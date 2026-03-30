// ---- Storage ----
const isTeacher = true;  // teacher mode always on (no login)
const session   = { username: 'teacher', name: 'Teacher', role: 'teacher' };
const HW_KEY = 'mm_homework';   // shared homework created by teacher
const DB_KEY = 'mm_users';

function loadHW() {
  return JSON.parse(localStorage.getItem(HW_KEY) || '[]');
}

function saveHW(data) {
  localStorage.setItem(HW_KEY, JSON.stringify(data));
}

function getUsers() {
  return JSON.parse(localStorage.getItem(DB_KEY) || '{}');
}

function saveUsers(u) {
  localStorage.setItem(DB_KEY, JSON.stringify(u));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Built-in assignments (always present) ----
const BUILTIN = [
  {
    id: '__builtin_g9w1__',
    subject: 'Math',
    title: 'MathMind G9 — Winter Practice 1',
    due: '',
    doc: '',
    notes: 'Algebraic Identities · Difference of Squares & Perfect Squares',
    practiceLink: 'practice-g9-winter-1.html',
    assignedTo: 'all',
    get done() {
      try {
        var d = JSON.parse(localStorage.getItem('mm_builtin_done') || '{}');
        return d['__builtin_g9w1__'] ? { teacher: true } : {};
      } catch(e) { return {}; }
    },
    builtin: true
  }
];

// ---- Filter state ----
let currentFilter = 'all';
let editingId = null;

// ---- Render ----
function render() {
  const all = [...BUILTIN, ...loadHW()];

  // Students only see assignments assigned to them or 'all'
  const visible = isTeacher ? all : all.filter(hw => {
    return hw.assignedTo === 'all' || (Array.isArray(hw.assignedTo) && hw.assignedTo.includes(session.username));
  });

  // Per-student done state
  const filtered = visible.filter(hw => {
    const done = isDone(hw);
    if (currentFilter === 'pending') return !done;
    if (currentFilter === 'done')    return done;
    return true;
  });

  filtered.sort((a, b) => {
    const da = isDone(a), db = isDone(b);
    if (da !== db) return da ? 1 : -1;
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  });

  const list  = document.getElementById('hw-list');
  const empty = document.getElementById('hw-empty');
  list.innerHTML = '';

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  filtered.forEach(hw => {
    const done    = isDone(hw);
    const overdue = hw.due && !done && new Date(hw.due) < new Date().setHours(0,0,0,0);
    const dueText = hw.due
      ? `Due ${new Date(hw.due + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'No due date';

    const card = document.createElement('div');
    card.className = 'hw-card' + (done ? ' done' : '');
    card.dataset.id = hw.id;

    card.innerHTML = `
      <div class="hw-check ${done ? 'checked' : ''} ${!isTeacher ? 'readonly' : ''}" data-id="${hw.id}" title="${isTeacher ? 'Mark complete' : ''}"></div>
      <div class="hw-card-body">
        <div class="hw-card-subject">${escHtml(hw.subject || 'General')}</div>
        <div class="hw-card-title">${escHtml(hw.title)}</div>
        <div class="hw-card-meta ${overdue ? 'overdue' : ''}">${overdue ? '⚠ Overdue · ' : ''}${dueText}</div>
      </div>
      <div class="hw-card-actions">
        ${hw.practiceLink ? `<a class="hw-doc-badge" href="${escHtml(hw.practiceLink)}" target="_blank" rel="noopener noreferrer">📝 Practice</a>` : ''}
        ${hw.doc ? `<a class="hw-doc-badge" href="${escHtml(hw.doc)}" target="_blank" rel="noopener noreferrer">📄 Doc</a>` : ''}
        ${isTeacher && !hw.builtin ? `<button class="hw-edit-btn" data-id="${hw.id}" title="Edit">✏</button>` : ''}
        ${isTeacher && !hw.builtin ? `<button class="hw-delete" data-id="${hw.id}" title="Delete">×</button>` : ''}
      </div>
    `;

    card.querySelector('.hw-card-body').addEventListener('click', () => openView(hw.id));
    card.querySelector('.hw-check').addEventListener('click', e => {
      e.stopPropagation();
      if (isTeacher) toggleDone(hw.id);
    });

    const editBtn = card.querySelector('.hw-edit-btn');
    if (editBtn) editBtn.addEventListener('click', e => { e.stopPropagation(); openAddModal(hw.id); });

    const delBtn = card.querySelector('.hw-delete');
    if (delBtn) delBtn.addEventListener('click', e => { e.stopPropagation(); deleteHw(hw.id); });

    list.appendChild(card);
  });
}

function isDone(hw) {
  if (!session) return false;
  const d = hw.done;
  if (typeof d === 'boolean') return d;
  if (typeof d === 'object' && d !== null) return !!(d[session.username] || d['teacher']);
  return false;
}

// ---- Actions ----
function toggleDone(id) {
  // Builtin
  const builtin = BUILTIN.find(h => h.id === id);
  if (builtin) {
    try {
      const d = JSON.parse(localStorage.getItem('mm_builtin_done') || '{}');
      d[id] = !d[id];
      localStorage.setItem('mm_builtin_done', JSON.stringify(d));
    } catch(e) {}
    render(); return;
  }
  const data = loadHW();
  const hw   = data.find(h => h.id === id);
  if (!hw) return;
  if (typeof hw.done !== 'object') hw.done = {};
  hw.done[session.username] = !hw.done[session.username];
  saveHW(data);
  render();
}

function deleteHw(id) {
  saveHW(loadHW().filter(h => h.id !== id));
  render();
}

// ---- Add / Edit Modal (teacher only) ----
function openAddModal(id = null) {
  if (!isTeacher) return;
  editingId = id;
  document.getElementById('modal-title').textContent = id ? 'Edit Assignment' : 'New Assignment';

  if (id) {
    const hw = loadHW().find(h => h.id === id);
    if (!hw) return;
    document.getElementById('hw-subject').value    = hw.subject || '';
    document.getElementById('hw-title-input').value = hw.title || '';
    document.getElementById('hw-due').value         = hw.due || '';
    document.getElementById('hw-doc').value         = hw.doc || '';
    document.getElementById('hw-notes').value       = hw.notes || '';
    document.getElementById('hw-practice').value    = hw.practiceLink || '';
    document.getElementById('hw-assign').value      = hw.assignedTo === 'all' ? '' : (Array.isArray(hw.assignedTo) ? hw.assignedTo.join(', ') : hw.assignedTo);
  } else {
    ['hw-subject','hw-title-input','hw-due','hw-doc','hw-notes','hw-practice','hw-assign'].forEach(id => {
      document.getElementById(id).value = '';
    });
  }

  document.getElementById('hw-modal').classList.remove('hidden');
  document.getElementById('hw-subject').focus();
}

function closeAddModal() {
  document.getElementById('hw-modal').classList.add('hidden');
  editingId = null;
}

function saveHwItem() {
  const title = document.getElementById('hw-title-input').value.trim();
  if (!title) { document.getElementById('hw-title-input').focus(); return; }

  let doc = document.getElementById('hw-doc').value.trim();
  if (doc && !/^https?:\/\//i.test(doc)) doc = 'https://' + doc;

  const assignRaw = document.getElementById('hw-assign').value.trim();
  const assignedTo = assignRaw
    ? assignRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : 'all';

  const item = {
    subject:     document.getElementById('hw-subject').value.trim(),
    title,
    due:         document.getElementById('hw-due').value,
    doc,
    notes:       document.getElementById('hw-notes').value.trim(),
    practiceLink: document.getElementById('hw-practice').value.trim(),
    assignedTo,
    done: {}
  };

  const data = loadHW();
  if (editingId) {
    const idx = data.findIndex(h => h.id === editingId);
    if (idx !== -1) { data[idx] = { ...data[idx], ...item }; }
  } else {
    data.push({ id: genId(), ...item, created: Date.now() });
  }

  saveHW(data);
  render();
  closeAddModal();
}

// ---- View Modal ----
function openView(id) {
  const hw = [...BUILTIN, ...loadHW()].find(h => h.id === id);
  if (!hw) return;

  document.getElementById('view-subject').textContent = hw.subject || 'General';
  document.getElementById('view-title').textContent   = hw.title;
  document.getElementById('view-due').textContent     = hw.due
    ? `Due ${new Date(hw.due + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'No due date';
  document.getElementById('view-notes').textContent = hw.notes || 'No notes.';

  const docLink      = document.getElementById('view-doc-link');
  const practiceLink = document.getElementById('view-practice-link');

  docLink.classList.toggle('hidden', !hw.doc);
  if (hw.doc) docLink.href = hw.doc;

  practiceLink.classList.toggle('hidden', !hw.practiceLink);
  if (hw.practiceLink) practiceLink.href = hw.practiceLink;

  const editBtn = document.getElementById('view-edit');
  editBtn.classList.toggle('hidden', !isTeacher || !!hw.builtin);
  editBtn.dataset.id = id;

  document.getElementById('view-modal').classList.remove('hidden');
}

function closeView() {
  document.getElementById('view-modal').classList.add('hidden');
}

// ---- Student management (teacher only) ----
function openStudentModal() {
  renderStudentList();
  document.getElementById('student-modal').classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.add('hidden');
}

function renderStudentList() {
  const users = getUsers();
  const list  = document.getElementById('student-list');
  list.innerHTML = '';

  const students = Object.entries(users).filter(([,u]) => u.role === 'student');

  if (students.length === 0) {
    list.innerHTML = '<div class="student-empty">No students yet.</div>';
    return;
  }

  students.forEach(([username, u]) => {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.innerHTML = `
      <div class="student-info">
        <span class="student-name">${escHtml(u.name || username)}</span>
        <span class="student-username">@${escHtml(username)}</span>
      </div>
      <button class="hw-delete" data-username="${escHtml(username)}" title="Remove student">×</button>
    `;
    row.querySelector('.hw-delete').addEventListener('click', () => removeStudent(username));
    list.appendChild(row);
  });
}

function addStudent() {
  const name     = document.getElementById('new-student-name').value.trim();
  const username = document.getElementById('new-student-user').value.trim().toLowerCase();
  const password = document.getElementById('new-student-pass').value.trim();

  if (!name || !username || !password) return;

  const users = getUsers();
  if (users[username]) {
    alert('Username already exists.');
    return;
  }

  users[username] = { name, password, role: 'student' };
  saveUsers(users);

  document.getElementById('new-student-name').value = '';
  document.getElementById('new-student-user').value = '';
  document.getElementById('new-student-pass').value = '';

  renderStudentList();
}

function removeStudent(username) {
  const users = getUsers();
  delete users[username];
  saveUsers(users);
  renderStudentList();
}

// ---- Nav setup ----
function setupNav() {
  document.getElementById('nav-username').textContent = 'Teacher';
  document.getElementById('add-hw-btn').classList.remove('hidden');
  document.getElementById('manage-students-btn').classList.remove('hidden');

}

// ---- Event listeners ----
document.getElementById('add-hw-btn').addEventListener('click', () => openAddModal());
document.getElementById('hw-cancel').addEventListener('click', closeAddModal);
document.getElementById('hw-save').addEventListener('click', saveHwItem);
document.getElementById('view-close').addEventListener('click', closeView);
document.getElementById('view-edit').addEventListener('click', e => {
  closeView(); openAddModal(e.target.dataset.id);
});
document.getElementById('manage-students-btn').addEventListener('click', openStudentModal);
document.getElementById('student-close').addEventListener('click', closeStudentModal);
document.getElementById('add-student-btn').addEventListener('click', addStudent);

document.getElementById('hw-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('hw-modal')) closeAddModal();
});
document.getElementById('view-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('view-modal')) closeView();
});
document.getElementById('student-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('student-modal')) closeStudentModal();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById('hw-modal').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveHwItem();
  if (e.key === 'Escape') closeAddModal();
});

// ---- Init ----
setupNav();
render();
