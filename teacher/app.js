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

// ---- STUDENTS ----
async function loadStudents() {
  const list = document.getElementById('students-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const students = await AUTH.api('GET', '/users');
  if (!students.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No students yet.</p>'; return; }
  list.innerHTML = '';
  students.forEach(s => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card-info">
        <div class="item-card-title">${s.username}</div>
        <div class="item-card-sub">${s.email || ''}</div>
      </div>`;
    list.appendChild(card);
  });
}

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
  msg.textContent = 'Student created.'; msg.className = 'msg success';
  document.getElementById('s-username').value = '';
  document.getElementById('s-email').value = '';
  document.getElementById('s-password').value = '';
  loadStudents();
});

// ---- ASSIGNMENTS ----
async function loadAssignments() {
  const list = document.getElementById('assignments-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const items = await AUTH.api('GET', '/assignments');
  if (!items.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No assignments yet.</p>'; return; }
  list.innerHTML = '';
  items.forEach(a => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card-info">
        <div class="item-card-title">${a.title}</div>
        <div class="item-card-sub">${a.dueDate ? 'Due: ' + a.dueDate : ''} ${a.description ? '— ' + a.description : ''}</div>
      </div>
      <button class="btn danger" data-id="${a.sk}">Delete</button>`;
    card.querySelector('.btn.danger').addEventListener('click', async () => {
      await AUTH.api('DELETE', '/assignments/' + a.sk);
      loadAssignments();
    });
    list.appendChild(card);
  });
}

document.getElementById('add-assignment-btn').addEventListener('click', () => {
  document.getElementById('add-assignment-form').classList.toggle('hidden');
});
document.getElementById('a-cancel').addEventListener('click', () => {
  document.getElementById('add-assignment-form').classList.add('hidden');
});
document.getElementById('a-save').addEventListener('click', async () => {
  const msg = document.getElementById('a-msg');
  const title = document.getElementById('a-title').value.trim();
  const description = document.getElementById('a-desc').value.trim();
  const dueDate = document.getElementById('a-due').value;
  if (!title) { msg.textContent = 'Title required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/assignments', { title, description, dueDate });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Assignment created.'; msg.className = 'msg success';
  document.getElementById('a-title').value = '';
  document.getElementById('a-desc').value = '';
  document.getElementById('a-due').value = '';
  loadAssignments();
});

// ---- HANDOUTS ----
async function loadHandouts() {
  const list = document.getElementById('handouts-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const items = await AUTH.api('GET', '/handouts');
  if (!items.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No handouts yet.</p>'; return; }
  list.innerHTML = '';
  items.forEach(h => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card-info">
        <div class="item-card-title">${h.url ? `<a href="${h.url}" target="_blank" style="color:var(--yellow);text-decoration:none">${h.title}</a>` : h.title}</div>
        <div class="item-card-sub">${h.description || ''}</div>
      </div>
      <button class="btn danger" data-id="${h.sk}">Delete</button>`;
    card.querySelector('.btn.danger').addEventListener('click', async () => {
      await AUTH.api('DELETE', '/handouts/' + h.sk);
      loadHandouts();
    });
    list.appendChild(card);
  });
}

document.getElementById('add-handout-btn').addEventListener('click', () => {
  document.getElementById('add-handout-form').classList.toggle('hidden');
});
document.getElementById('h-cancel').addEventListener('click', () => {
  document.getElementById('add-handout-form').classList.add('hidden');
});
document.getElementById('h-save').addEventListener('click', async () => {
  const msg = document.getElementById('h-msg');
  const title = document.getElementById('h-title').value.trim();
  const url = document.getElementById('h-url').value.trim();
  const description = document.getElementById('h-desc').value.trim();
  if (!title) { msg.textContent = 'Title required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/handouts', { title, url, description });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Handout created.'; msg.className = 'msg success';
  document.getElementById('h-title').value = '';
  document.getElementById('h-url').value = '';
  document.getElementById('h-desc').value = '';
  loadHandouts();
});

// Initial load
loadStudents();
loadAssignments();
loadHandouts();

// ---- ADMIN ----
if (AUTH.isAdmin()) {
  document.getElementById('admin-tab-btn').style.display = '';

  async function loadAllUsers() {
    const list = document.getElementById('users-list');
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
    const users = await AUTH.api('GET', '/admin/users');
    if (!users.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No users found.</p>'; return; }
    list.innerHTML = '';
    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-info">
          <div class="item-card-title">${u.username}</div>
          <div class="item-card-sub">${u.email} — ${u.groups.join(', ') || 'no group'}</div>
        </div>`;
      list.appendChild(card);
    });
  }

  async function loadClasses() {
    const list = document.getElementById('classes-list');
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
    const classes = await AUTH.api('GET', '/admin/classes');
    if (!classes.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No classes yet.</p>'; return; }
    list.innerHTML = '';
    classes.forEach(c => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-info">
          <div class="item-card-title">${c.name}</div>
          <div class="item-card-sub">${c.members?.length || 0} member(s)</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" placeholder="Username to add" id="add-member-${c.sk}"
            style="background:#222536;border:1px solid #2e3248;border-radius:6px;padding:6px 10px;color:#e8eaf0;font-size:12px;font-family:inherit;outline:none;width:160px" />
          <button class="btn" onclick="addMember('${c.sk}')">Add</button>
          <button class="btn danger" onclick="deleteClass('${c.sk}')">Delete</button>
        </div>`;
      list.appendChild(card);
    });
  }

  window.addMember = async (classId) => {
    const input = document.getElementById('add-member-' + classId);
    const username = input.value.trim();
    if (!username) return;
    await AUTH.api('POST', `/admin/classes/${classId}/members`, { username });
    input.value = '';
    loadClasses();
  };

  window.deleteClass = async (classId) => {
    await AUTH.api('DELETE', '/admin/classes/' + classId);
    loadClasses();
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
    msg.textContent = 'Class created.'; msg.className = 'msg success';
    document.getElementById('c-name').value = '';
    loadClasses();
  });

  // Load admin data when tab is clicked
  document.querySelector('[data-tab="admin"]').addEventListener('click', () => {
    loadAllUsers();
    loadClasses();
  });
}
