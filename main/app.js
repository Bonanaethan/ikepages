function updateGreeting(name) {
  const hour = new Date().getHours();
  let greet = 'Good morning';
  if (hour >= 12 && hour < 17) greet = 'Good afternoon';
  else if (hour >= 17) greet = 'Good evening';

  document.getElementById('greeting').innerHTML = `${greet}, <span>${name}</span>`;
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ---- Clock ----
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ---- Weather ----
function loadWeather() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
      () => fetchWeatherByIP()
    );
  } else {
    fetchWeatherByIP();
  }
}

async function fetchWeatherByCoords(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&temperature_unit=celsius`;
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const [weatherRes, geoRes] = await Promise.all([fetch(url), fetch(geoUrl)]);
    const weatherData = await weatherRes.json();
    const geoData = await geoRes.json();
    const temp = Math.round(weatherData.current.temperature_2m);
    const feelsLike = Math.round(weatherData.current.apparent_temperature);
    const code = weatherData.current.weather_code;
    const city = geoData.address.city || geoData.address.town || geoData.address.village || 'Your Location';
    renderWeather(temp, feelsLike, code, city);
  } catch {
    fetchWeatherByIP();
  }
}

async function fetchWeatherByIP() {
  try {
    const ipRes = await fetch('https://ip-api.com/json/?fields=lat,lon,city');
    const ipData = await ipRes.json();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ipData.lat}&longitude=${ipData.lon}&current=temperature_2m,apparent_temperature,weather_code&temperature_unit=celsius`;
    const weatherRes = await fetch(url);
    const weatherData = await weatherRes.json();
    const temp = Math.round(weatherData.current.temperature_2m);
    const feelsLike = Math.round(weatherData.current.apparent_temperature);
    const code = weatherData.current.weather_code;
    renderWeather(temp, feelsLike, code, ipData.city || 'Your Location');
  } catch {
    showWeatherError('Unable to load weather');
  }
}

function renderWeather(temp, feelsLike, code, city) {
  const { icon, desc } = weatherFromCode(code);
  document.getElementById('weather-content').innerHTML = `
    <div class="weather-main">
      <div class="weather-icon">${icon}</div>
      <div>
        <div class="weather-temp">${temp}°C</div>
        <div class="weather-details">
          <div class="weather-desc">${desc}</div>
          <div class="weather-location">${city}</div>
          <div class="weather-feels">Feels like ${feelsLike}°C</div>
        </div>
      </div>
    </div>
  `;
}

function showWeatherError(msg) {
  document.getElementById('weather-content').innerHTML = `<div class="weather-loading">${msg}</div>`;
}

// ---- Announcements ----
async function initAnnouncements() {
  const list = document.getElementById('announcements-list');
  const isTeacherOrAdmin = AUTH.isTeacher() || AUTH.isAdmin();

  if (isTeacherOrAdmin) {
    document.getElementById('announcement-form').classList.remove('hidden');
    document.getElementById('ann-save').addEventListener('click', async () => {
      const title = document.getElementById('ann-title').value.trim();
      const message = document.getElementById('ann-message').value.trim();
      const msg = document.getElementById('ann-msg');
      if (!title) { msg.textContent = 'Title required.'; msg.style.color = '#e05252'; return; }
      msg.textContent = 'Posting...'; msg.style.color = 'var(--muted)';
      const res = await AUTH.api('POST', '/announcements', { title, message, assignedTo: 'all' });
      if (res.error) { msg.textContent = res.error; msg.style.color = '#e05252'; return; }
      msg.textContent = 'Posted.'; msg.style.color = '#4caf50';
      document.getElementById('ann-title').value = '';
      document.getElementById('ann-message').value = '';
      loadAnnouncements();
    });
  }

  loadAnnouncements();
}

async function loadAnnouncements() {
  const list = document.getElementById('announcements-list');
  const isTeacherOrAdmin = AUTH.isTeacher() || AUTH.isAdmin();
  const items = await AUTH.api('GET', '/announcements');
  if (!Array.isArray(items) || !items.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">No announcements.</p>';
    return;
  }
  list.innerHTML = '';
  items.forEach(a => {
    const card = document.createElement('div');
    card.className = 'announcement-card';
    const isHwMarked = a.type === 'hw_marked';
    if (isHwMarked) card.style.borderLeftColor = '#4caf50';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div class="announcement-title">${a.title}</div>
          ${a.message ? `<div class="announcement-msg" style="white-space:pre-wrap">${a.message}</div>` : ''}
          ${isHwMarked && a.assignmentId ? `<a href="../homework/view.html?id=${a.assignmentId}" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:rgba(76,175,80,0.12);border:1px solid #4caf50;border-radius:6px;padding:5px 12px;text-decoration:none;color:#4caf50;font-size:12px;font-weight:600">📄 View marked homework →</a>` : ''}
          <div class="announcement-date">${new Date(a.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        ${isTeacherOrAdmin ? `<button onclick="deleteAnnouncement('${a.sk}')" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0;margin-left:12px" title="Delete">×</button>` : ''}
      </div>`;
    list.appendChild(card);
  });
}

window.deleteAnnouncement = async (id) => {
  await AUTH.api('DELETE', '/announcements/' + id);
  loadAnnouncements();
};

// ---- Customization ----
const SETTINGS_KEY = 'bmw_settings';

const defaultSettings = {
  accentColor: '#1c69d4',
  bgStyle: 'grid',
  showClock: true,
  showWeather: true,
  displayName: 'Ethan'
};

function getSettings() {
  return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function applySettings(s) {
  document.documentElement.style.setProperty('--bmw-blue', s.accentColor);
  document.body.dataset.bg = s.bgStyle;
  document.querySelector('.clock-widget').style.display = s.showClock ? '' : 'none';
  document.querySelector('.weather-widget').style.display = s.showWeather ? '' : 'none';
}

function initCustomizer() {
  const s = getSettings();
  document.getElementById('set-accent').value   = s.accentColor;
  document.getElementById('set-bg').value        = s.bgStyle;
  document.getElementById('set-clock').checked   = s.showClock;
  document.getElementById('set-weather').checked = s.showWeather;
  document.getElementById('set-name').value      = s.displayName;

  applySettings(s);

  document.getElementById('customize-btn').addEventListener('click', () => {
    document.getElementById('customize-panel').classList.toggle('open');
  });
  document.getElementById('customize-close').addEventListener('click', () => {
    document.getElementById('customize-panel').classList.remove('open');
  });
  document.getElementById('set-accent').addEventListener('input', (e) => {
    const s = getSettings(); s.accentColor = e.target.value; saveSettings(s); applySettings(s);
  });
  document.getElementById('set-bg').addEventListener('change', (e) => {
    const s = getSettings(); s.bgStyle = e.target.value; saveSettings(s); applySettings(s);
  });
  document.getElementById('set-clock').addEventListener('change', (e) => {
    const s = getSettings(); s.showClock = e.target.checked; saveSettings(s); applySettings(s);
  });
  document.getElementById('set-weather').addEventListener('change', (e) => {
    const s = getSettings(); s.showWeather = e.target.checked; saveSettings(s); applySettings(s);
  });
  document.getElementById('set-name').addEventListener('input', (e) => {
    const s = getSettings(); s.displayName = e.target.value; saveSettings(s); applySettings(s);
  });
}

// ---- WMO weather code mapping ----
function weatherFromCode(code) {
  if (code === 0)  return { icon: '☀️', desc: 'Clear sky' };
  if (code <= 2)   return { icon: '⛅', desc: 'Partly cloudy' };
  if (code === 3)  return { icon: '☁️', desc: 'Overcast' };
  if (code <= 49)  return { icon: '🌫️', desc: 'Foggy' };
  if (code <= 59)  return { icon: '🌦️', desc: 'Drizzle' };
  if (code <= 69)  return { icon: '🌧️', desc: 'Rain' };
  if (code <= 79)  return { icon: '❄️', desc: 'Snow' };
  if (code <= 82)  return { icon: '🌧️', desc: 'Rain showers' };
  if (code <= 86)  return { icon: '🌨️', desc: 'Snow showers' };
  if (code <= 99)  return { icon: '⛈️', desc: 'Thunderstorm' };
  return { icon: '🌡️', desc: 'Unknown' };
}

// ---- Init ----
const settings = getSettings();
const cognitoUser = AUTH.getUser();
const username = cognitoUser?.['cognito:username'] || cognitoUser?.email || settings.displayName || '';
document.getElementById('nav-username').textContent = username;
updateGreeting(username);
startClock();
loadWeather();
initAnnouncements();
initCustomizer();

// Show teacher link if user is a teacher or admin
if (AUTH.isTeacher() || AUTH.isAdmin()) {
  const link = document.getElementById('teacher-link');
  if (link) link.style.display = '';
}

// Set nav username with group label and greeting with first name
(async () => {
  const role = AUTH.getRole();
  const cognitoUsername = AUTH.getUser()?.['cognito:username'] || '';
  const groupLabel = role ? ` (${role})` : '';

  // Always show username (with role) in top right
  document.getElementById('nav-username').textContent = cognitoUsername + groupLabel;

  // Try to get profile for first/last name for the greeting
  const profile = await AUTH.api('GET', '/profile');

  if (!AUTH.isTeacher() && !AUTH.isAdmin()) {
    // Students must complete profile
    if (!profile.firstName) {
      window.location.href = '../profile/index.html';
      return;
    }
  }

  // Show first + last name in greeting if available, otherwise username
  if (profile.firstName) {
    updateGreeting(profile.firstName + ' ' + profile.lastName);
  } else {
    updateGreeting(cognitoUsername);
  }

  // Show student's classes on dashboard
  if (!AUTH.isTeacher() && !AUTH.isAdmin()) {
    const myClasses = await AUTH.api('GET', '/my/classes');
    if (Array.isArray(myClasses) && myClasses.length) {
      const section = document.getElementById('my-classes-section');
      const listEl = document.getElementById('my-classes-list');
      section.classList.remove('hidden');
      // Get courses to show course name
      const coursesRes = await AUTH.api('GET', '/admin/courses');
      const courses = Array.isArray(coursesRes) ? coursesRes : [];
      myClasses.forEach(cls => {
        const courseName = courses.find(c => c.sk === cls.courseId)?.name || '';
        const card = document.createElement('a');
        card.href = `../student/class.html?id=${cls.sk}`;
        card.style.cssText = 'display:inline-flex;flex-direction:column;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;text-decoration:none;color:var(--text);transition:border-color 0.2s,background 0.2s;min-width:160px';
        card.innerHTML = `
          <span style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--yellow);font-weight:600">${courseName || 'Class'}</span>
          <span style="font-size:14px;font-weight:500">${cls.name}</span>`;
        card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--yellow)'; card.style.background = 'var(--yellow-lt)'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border)'; card.style.background = 'var(--surface2)'; });
        listEl.appendChild(card);
      });
    }
  }
})();
