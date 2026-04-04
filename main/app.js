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

// ---- Bookmarks ----
const STORAGE_KEY = 'bmw_bookmarks';

function loadBookmarks() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function renderBookmarks() {
  const grid = document.getElementById('bookmarks-grid');
  const bookmarks = loadBookmarks();
  grid.innerHTML = '';

  if (bookmarks.length === 0) {
    grid.innerHTML = '<span style="color:#555;font-size:13px;">No bookmarks yet — add one below.</span>';
  }

  bookmarks.forEach((bm, i) => {
    const domain = new URL(bm.url).hostname;
    const a = document.createElement('a');
    a.className = 'bookmark-item';
    a.href = bm.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `
      <img class="bookmark-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" />
      ${bm.name}
      <button class="bookmark-delete" data-index="${i}" title="Remove">×</button>
    `;
    grid.appendChild(a);
  });

  grid.querySelectorAll('.bookmark-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const bms = loadBookmarks();
      bms.splice(idx, 1);
      saveBookmarks(bms);
      renderBookmarks();
    });
  });
}

function initBookmarks() {
  renderBookmarks();

  document.getElementById('add-bookmark-btn').addEventListener('click', () => {
    document.getElementById('bookmark-modal').classList.remove('hidden');
    document.getElementById('bm-name').focus();
  });

  document.getElementById('bm-cancel').addEventListener('click', closeModal);

  document.getElementById('bm-save').addEventListener('click', () => {
    const name = document.getElementById('bm-name').value.trim();
    let url = document.getElementById('bm-url').value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { return; }
    const bms = loadBookmarks();
    bms.push({ name, url });
    saveBookmarks(bms);
    renderBookmarks();
    closeModal();
  });
}

function closeModal() {
  document.getElementById('bookmark-modal').classList.add('hidden');
  document.getElementById('bm-name').value = '';
  document.getElementById('bm-url').value = '';
}

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
  // Always use Cognito username, ignore saved displayName
  const cognitoUsername = AUTH.getUser()?.['cognito:username'] || AUTH.getUser()?.email || '';
  if (cognitoUsername) {
    updateGreeting(cognitoUsername);
    document.getElementById('nav-username').textContent = cognitoUsername;
  }
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
initBookmarks();
initCustomizer();

// Show teacher link if user is a teacher
if (AUTH.isTeacher()) {
  const link = document.getElementById('teacher-link');
  if (link) link.style.display = '';
}

// Load profile for students — redirect to setup if missing, else show first name
(async () => {
  if (!AUTH.isTeacher()) {
    const profile = await AUTH.api('GET', '/profile');
    if (!profile.firstName) {
      window.location.href = '../profile/index.html';
      return;
    }
    updateGreeting(profile.firstName);
    document.getElementById('nav-username').textContent = profile.firstName + ' ' + profile.lastName;
  }
})();
