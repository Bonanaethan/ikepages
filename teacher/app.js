// Set username in navbar
const user = AUTH.getUser();
document.getElementById('nav-username').textContent = user?.['cognito:username'] || user?.email || '';

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    panel.classList.remove('hidden');
    panel.classList.add('active');
  });
});

// ---- COURSES (shared, loaded early so users tab can use them) ----
let allCourses = [];

async function loadCourseOptions() {
  const res = await AUTH.api('GET', '/admin/classes');
  allCourses = Array.isArray(res) ? res : [];
}

// ---- USERS ----
let allUsers = [];

async function loadUsers() {
  const list = document.getElementById('students-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const endpoint = AUTH.isAdmin() ? '/admin/users' : '/users';
  const res = await AUTH.api('GET', endpoint);
  allUsers = Array.isArray(res) ? res : [];
  renderUsers();
}

function renderUsers() {
  const list = document.getElementById('students-list');
  const filter = document.getElementById('group-filter')?.value || 'all';
  const filtered = filter === 'all' ? allUsers : allUsers.filter(u => (u.groups || []).includes(filter));
  if (!filtered.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No users found.</p>'; return; }
  list.innerHTML = '';
  filtered.forEach(u => {
    const courseOptions = allCourses.map(c =>
      `<option value="${c.sk}">${c.name}</option>`
    ).join('');
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card-info">
        <div class="item-card-title">${u.username}</div>
        <div class="item-card-sub">${u.email || ''} ${u.groups?.length ? '— ' + u.groups.join(', ') : ''}</div>
      </div>
      ${AUTH.isAdmin() && allCourses.length ? `
      <div style="display:flex;gap:8px;align-items:center">
        <select id="course-select-${u.username}" style="background:#222536;border:1px solid #2e3248;border-radius:6px;padding:6px 10px;color:#e8eaf0;font-size:12px;font-family:inherit;outline:none;cursor:pointer">
          <option value="">Assign to course...</option>
          ${courseOptions}
        </select>
        <button class="btn" onclick="assignToCourse('${u.username}')">Assign</button>
      </div>` : ''}`;
    list.appendChild(card);
  });
}

window.assignToCourse = async (username) => {
  const select = document.getElementById('course-select-' + username);
  const courseId = select?.value;
  if (!courseId) return;
  await AUTH.api('POST', `/admin/classes/${courseId}/members`, { username });
  select.value = '';
  alert(`${username} added to course.`);
};

document.getElementById('group-filter')?.addEventListener('change', renderUsers);

document.getElementById('add-student-btn').addEventListener('click', () => {
  document.getElementById('add-student-form').classList.toggle('hidden');
});
document.getElementById('s-cancel').addEventListener('click', () => {
  document.getElementById('add-student-form').classList.add('hidden');
});
document.getElementById('s-save').addEventListener('click', async () => {
  const msg = document.getElementById('s-msg');
  const username = document.getElementById('s-username').value.trim();
  const email = document.getElementById('s-email').value.trim();
  const password = document.getElementById('s-password').value.trim();
  if (!username || !email || !password) { msg.textContent = 'All fields required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Creating...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/users', { username, email, password });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'User created.'; msg.className = 'msg success';
  document.getElementById('s-username').value = '';
  document.getElementById('s-email').value = '';
  document.getElementById('s-password').value = '';
  loadUsers();
});

// ---- COURSES TAB (admin only) ----
if (AUTH.isAdmin()) {
  document.getElementById('admin-tab-btn').style.display = '';

  async function loadCourses() {
    const list = document.getElementById('classes-list');
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
    const courses = await AUTH.api('GET', '/admin/classes');
    allCourses = Array.isArray(courses) ? courses : [];
    if (!allCourses.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No courses yet.</p>'; return; }
    list.innerHTML = '';
    allCourses.forEach(c => {
      const members = c.members || [];
      const card = document.createElement('div');
      card.className = 'item-card';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'flex-start';
      card.style.gap = '10px';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <div class="item-card-info">
            <div class="item-card-title">${c.name}</div>
            <div class="item-card-sub">${members.length} member(s)</div>
          </div>
          <button class="btn danger" onclick="deleteCourse('${c.sk}')">Delete</button>
        </div>
        ${members.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:4px;border-top:1px solid var(--border);width:100%">
          ${members.map(m => `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--text)">${m}</span>`).join('')}
        </div>` : ''}`;
      list.appendChild(card);
    });
  }

  window.deleteCourse = async (courseId) => {
    await AUTH.api('DELETE', '/admin/classes/' + courseId);
    loadCourses();
  };

  document.getElementById('add-class-btn').addEventListener('click', () => {
    document.getElementById('add-class-form').classList.toggle('hidden');
  });
  document.getElementById('c-cancel').addEventListener('click', () => {
    document.getElementById('add-class-form').classList.add('hidden');
  });
  document.getElementById('c-save').addEventListener('click', async () => {
    const msg = document.getElementById('c-msg');
    const name = document.getElementById('c-name').value.trim();
    if (!name) { msg.textContent = 'Name required.'; msg.className = 'msg error'; return; }
    msg.textContent = 'Saving...'; msg.className = 'msg';
    const res = await AUTH.api('POST', '/admin/classes', { name });
    if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
    msg.textContent = 'Course created.'; msg.className = 'msg success';
    document.getElementById('c-name').value = '';
    loadCourses();
  });

  document.querySelector('[data-tab="courses"]').addEventListener('click', loadCourses);
}

// Initial load
(async () => {
  if (AUTH.isAdmin()) await loadCourseOptions();
  loadUsers();
})();
