const user = AUTH.getUser();
const role = AUTH.getRole();
document.getElementById('nav-username').textContent = (user?.['cognito:username'] || '') + (role ? ` (${role})` : '');

let allUsers = [], allCourses = [], allClasses = [], allAnnouncements = [];

// ---- TABS ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    panel.classList.remove('hidden');
    panel.classList.add('active');
    if (btn.dataset.tab === 'users') loadUsers();
    if (btn.dataset.tab === 'courses') loadCourses();
    if (btn.dataset.tab === 'classes') loadClasses();
    if (btn.dataset.tab === 'announcements') loadAnnouncements();
  });
});

// ==================== USERS ====================
async function loadUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const res = await AUTH.api('GET', '/admin/users');
  allUsers = Array.isArray(res) ? res : [];
  renderUsers();
}

function renderUsers() {
  const list = document.getElementById('users-list');
  const filter = document.getElementById('group-filter').value;
  const filtered = filter === 'all' ? allUsers : allUsers.filter(u => (u.groups||[]).includes(filter));
  if (!filtered.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No users found.</p>'; return; }
  list.innerHTML = '';
  filtered.forEach(u => {
    const userClasses = allClasses.filter(cl => (cl.members||[]).includes(u.username));
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cssText = 'flex-direction:column;align-items:flex-start;gap:10px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%">
        <div class="item-card-info">
          <div class="item-card-title">${u.username} ${u.firstName ? `<span style="font-weight:400;color:var(--muted)">(${u.firstName} ${u.lastName})</span>` : ''}</div>
          <div class="item-card-sub">${u.email} — ${(u.groups||[]).join(', ') || 'no group'}</div>
          ${u.dob ? `<div class="item-card-sub">DOB: ${u.dob}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" onclick="openEditUser('${u.username}')">Edit</button>
          <button class="btn danger" onclick="deleteUser('${u.username}')">Delete</button>
        </div>
      </div>
      <div style="width:100%;border-top:1px solid var(--border);padding-top:8px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Classes</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
          ${userClasses.length ? userClasses.map(cl => {
            const courseName = allCourses.find(c => c.sk === cl.courseId)?.name || '';
            return `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:12px;display:inline-flex;align-items:center;gap:6px">
              ${cl.name}${courseName ? ` <span style="color:var(--muted)">(${courseName})</span>` : ''}
              <button onclick="removeMember('${cl.sk}','${u.username}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>
            </span>`;
          }).join('') : '<span style="font-size:12px;color:var(--muted)">No classes</span>'}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <select id="class-select-${u.username}" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--text);font-size:12px;font-family:inherit;outline:none;cursor:pointer">
            <option value="">Assign to class...</option>
            ${allClasses.map(cl => {
              const courseName = allCourses.find(c => c.sk === cl.courseId)?.name || '';
              return `<option value="${cl.sk}">${cl.name}${courseName ? ` (${courseName})` : ''}</option>`;
            }).join('')}
          </select>
          <button class="btn" onclick="assignToClass('${u.username}')">Assign</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

document.getElementById('group-filter').addEventListener('change', renderUsers);

window.openEditUser = (username) => {
  const u = allUsers.find(x => x.username === username);
  if (!u) return;
  document.getElementById('edit-username').value = username;
  document.getElementById('edit-firstName').value = u.firstName || '';
  document.getElementById('edit-lastName').value = u.lastName || '';
  document.getElementById('edit-dob').value = u.dob || '';
  document.getElementById('edit-group').value = (u.groups||[])[0] || 'students';
  document.getElementById('edit-msg').textContent = '';
  document.getElementById('edit-user-modal').classList.remove('hidden');
};

document.getElementById('edit-cancel').addEventListener('click', () => document.getElementById('edit-user-modal').classList.add('hidden'));
document.getElementById('edit-save').addEventListener('click', async () => {
  const msg = document.getElementById('edit-msg');
  const username = document.getElementById('edit-username').value;
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('PUT', `/admin/users/${username}`, {
    firstName: document.getElementById('edit-firstName').value.trim(),
    lastName: document.getElementById('edit-lastName').value.trim(),
    dob: document.getElementById('edit-dob').value,
    group: document.getElementById('edit-group').value
  });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Saved.'; msg.className = 'msg success';
  setTimeout(() => { document.getElementById('edit-user-modal').classList.add('hidden'); loadUsers(); }, 800);
});

window.deleteUser = async (username) => {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const res = await AUTH.api('DELETE', `/admin/users/${username}`);
  if (res.error) { alert(res.error); return; }
  loadUsers();
};

window.assignToClass = async (username) => {
  const sel = document.getElementById(`class-select-${username}`);
  const classId = sel?.value;
  if (!classId) return;
  await AUTH.api('POST', `/admin/classes/${classId}/members`, { username });
  sel.value = '';
  await Promise.all([loadUsers(), loadClasses()]);
};

window.removeMember = async (classId, username) => {
  await AUTH.api('DELETE', `/admin/classes/${classId}/members/${username}`);
  await Promise.all([loadUsers(), loadClasses()]);
};

document.getElementById('add-user-btn').addEventListener('click', () => document.getElementById('add-user-form').classList.toggle('hidden'));
document.getElementById('u-cancel').addEventListener('click', () => document.getElementById('add-user-form').classList.add('hidden'));
document.getElementById('u-save').addEventListener('click', async () => {
  const msg = document.getElementById('u-msg');
  const username = document.getElementById('u-username').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const password = document.getElementById('u-password').value.trim();
  const group = document.getElementById('u-group').value;
  if (!username || !email || !password) { msg.textContent = 'All fields required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Creating...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/users', { username, email, password, group });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'User created.'; msg.className = 'msg success';
  document.getElementById('u-username').value = '';
  document.getElementById('u-email').value = '';
  document.getElementById('u-password').value = '';
  loadUsers();
});

// ==================== COURSES ====================
async function loadCourses() {
  const list = document.getElementById('courses-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const res = await AUTH.api('GET', '/admin/courses');
  allCourses = Array.isArray(res) ? res : [];
  if (!allCourses.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No courses yet.</p>'; return; }
  list.innerHTML = '';
  allCourses.forEach(c => {
    // Count classes using this course
    const classCount = allClasses.filter(cl => cl.courseId === c.sk).length;
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-card-info">
        <div class="item-card-title">${c.name}</div>
        ${c.description ? `<div class="item-card-sub">${c.description}</div>` : ''}
        <div class="item-card-sub">${classCount} class${classCount !== 1 ? 'es' : ''}</div>
      </div>
      <button class="btn danger" onclick="deleteCourse('${c.sk}')">Delete</button>`;
    list.appendChild(card);
  });
}

window.deleteCourse = async (id) => {
  if (!confirm('Delete this course? Classes assigned to it will lose their course link.')) return;
  await AUTH.api('DELETE', `/admin/courses/${id}`);
  loadCourses();
};

document.getElementById('add-course-btn').addEventListener('click', () => document.getElementById('add-course-form').classList.toggle('hidden'));
document.getElementById('c-cancel').addEventListener('click', () => document.getElementById('add-course-form').classList.add('hidden'));
document.getElementById('c-save').addEventListener('click', async () => {
  const msg = document.getElementById('c-msg');
  const name = document.getElementById('c-name').value.trim();
  if (!name) { msg.textContent = 'Name required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/admin/courses', { name, description: document.getElementById('c-desc').value.trim() });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Course created.'; msg.className = 'msg success';
  document.getElementById('c-name').value = '';
  document.getElementById('c-desc').value = '';
  loadCourses();
});

// ==================== CLASSES ====================
async function loadClasses() {
  const list = document.getElementById('classes-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const res = await AUTH.api('GET', '/admin/classes');
  allClasses = Array.isArray(res) ? res : [];

  // Populate course dropdown in add form
  const clCourse = document.getElementById('cl-course');
  if (clCourse) {
    clCourse.innerHTML = '<option value="">Select a course...</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
  }

  if (!allClasses.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No classes yet.</p>'; return; }
  list.innerHTML = '';
  allClasses.forEach(cl => {
    const courseName = allCourses.find(c => c.sk === cl.courseId)?.name || 'No course';
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cssText = 'flex-direction:column;align-items:flex-start;gap:10px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%">
        <div class="item-card-info">
          <div class="item-card-title">${cl.name}</div>
          <div class="item-card-sub">Course: <span style="color:var(--yellow)">${courseName}</span></div>
          <div class="item-card-sub">${(cl.members||[]).length} student(s)</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" onclick="openEditClass('${cl.sk}')">Edit</button>
          <button class="btn" onclick="window.location.href='class.html?id=${cl.sk}'">View</button>
          <button class="btn danger" onclick="deleteClass('${cl.sk}')">Delete</button>
        </div>
      </div>
      ${(cl.members||[]).length ? `
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px solid var(--border);width:100%">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;width:100%;margin-bottom:4px">Students</div>
        ${(cl.members||[]).map(m => `
          <span style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:12px;display:inline-flex;align-items:center;gap:6px">
            ${m}
            <button onclick="removeMember('${cl.sk}','${m}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>
          </span>`).join('')}
      </div>` : ''}`;
    list.appendChild(card);
  });
}

window.openEditClass = (classId) => {
  const cl = allClasses.find(x => x.sk === classId);
  if (!cl) return;
  document.getElementById('edit-class-id').value = classId;
  document.getElementById('edit-class-name').value = cl.name || '';
  const courseSelect = document.getElementById('edit-class-course');
  courseSelect.innerHTML = '<option value="">Select a course...</option>' +
    allCourses.map(c => `<option value="${c.sk}"${c.sk === cl.courseId ? ' selected' : ''}>${c.name}</option>`).join('');
  document.getElementById('edit-class-msg').textContent = '';
  document.getElementById('edit-class-modal').classList.remove('hidden');
};

document.getElementById('edit-class-cancel').addEventListener('click', () => document.getElementById('edit-class-modal').classList.add('hidden'));
document.getElementById('edit-class-save').addEventListener('click', async () => {
  const msg = document.getElementById('edit-class-msg');
  const classId = document.getElementById('edit-class-id').value;
  const name = document.getElementById('edit-class-name').value.trim();
  const courseId = document.getElementById('edit-class-course').value;
  if (!name) { msg.textContent = 'Name required.'; msg.className = 'msg error'; return; }
  if (!courseId) { msg.textContent = 'Please select a course.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('PUT', `/admin/classes/${classId}`, { name, courseId });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Saved.'; msg.className = 'msg success';
  setTimeout(() => { document.getElementById('edit-class-modal').classList.add('hidden'); loadClasses(); }, 800);
});

window.deleteClass = async (id) => {
  if (!confirm('Delete this class?')) return;
  await AUTH.api('DELETE', `/admin/classes/${id}`);
  loadClasses();
};

document.getElementById('add-class-btn').addEventListener('click', () => document.getElementById('add-class-form').classList.toggle('hidden'));
document.getElementById('cl-cancel').addEventListener('click', () => document.getElementById('add-class-form').classList.add('hidden'));
document.getElementById('cl-save').addEventListener('click', async () => {
  const msg = document.getElementById('cl-msg');
  const name = document.getElementById('cl-name').value.trim();
  const courseId = document.getElementById('cl-course').value;
  if (!name) { msg.textContent = 'Name required.'; msg.className = 'msg error'; return; }
  if (!courseId) { msg.textContent = 'Please select a course.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const res = await AUTH.api('POST', '/admin/classes', { name, courseId });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Class created.'; msg.className = 'msg success';
  document.getElementById('cl-name').value = '';
  document.getElementById('cl-course').value = '';
  loadClasses();
});

// ==================== ANNOUNCEMENTS ====================
async function loadAnnouncements() {
  const list = document.getElementById('announcements-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading...</p>';
  const res = await AUTH.api('GET', '/announcements');
  allAnnouncements = Array.isArray(res) ? res : [];
  if (!allAnnouncements.length) { list.innerHTML = '<p style="color:var(--muted);font-size:13px">No announcements yet.</p>'; return; }
  list.innerHTML = '';
  allAnnouncements.forEach(a => {
    const assigned = a.assignedTo === 'all' ? 'All students' : Array.isArray(a.assignedTo) ? a.assignedTo.join(', ') : a.assignedTo;
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cssText = 'flex-direction:column;align-items:flex-start;gap:6px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%">
        <div class="item-card-info">
          <div class="item-card-title">${a.title}</div>
          ${a.message ? `<div class="item-card-sub" style="white-space:pre-wrap">${a.message}</div>` : ''}
          <div class="item-card-sub">→ ${assigned}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn" onclick="openEditAnn('${a.sk}')">Edit</button>
          <button class="btn danger" onclick="deleteAnn('${a.sk}')">Delete</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

function openAnnForm(ann = null) {
  document.getElementById('ann-form-title').textContent = ann ? 'Edit Announcement' : 'New Announcement';
  document.getElementById('ann-id').value = ann?.sk || '';
  document.getElementById('ann-title').value = ann?.title || '';
  document.getElementById('ann-message').value = ann?.message || '';
  document.getElementById('ann-msg').textContent = '';
  const assigned = ann?.assignedTo || 'all';
  if (assigned === 'all') {
    document.getElementById('ann-assign-type').value = 'all';
  } else if (Array.isArray(assigned) && assigned.some(id => allClasses.find(cl => cl.sk === id))) {
    document.getElementById('ann-assign-type').value = 'class';
  } else {
    document.getElementById('ann-assign-type').value = 'individual';
    document.getElementById('ann-usernames').value = Array.isArray(assigned) ? assigned.join(', ') : '';
  }
  updateAssignUI();
  if (Array.isArray(assigned)) {
    assigned.forEach(id => {
      const cb = document.getElementById(`ann-class-cb-${id}`);
      if (cb) cb.checked = true;
    });
  }
  document.getElementById('ann-form').classList.remove('hidden');
}

window.openEditAnn = (id) => {
  const ann = allAnnouncements.find(a => a.sk === id);
  if (ann) openAnnForm(ann);
};

window.deleteAnn = async (id) => {
  if (!confirm('Delete this announcement?')) return;
  await AUTH.api('DELETE', `/announcements/${id}`);
  loadAnnouncements();
};

function updateAssignUI() {
  const type = document.getElementById('ann-assign-type').value;
  document.getElementById('ann-class-select').classList.toggle('hidden', type !== 'class');
  document.getElementById('ann-individual-input').classList.toggle('hidden', type !== 'individual');
  if (type === 'class') {
    const container = document.getElementById('ann-class-checkboxes');
    container.innerHTML = allClasses.map(cl => {
      const courseName = allCourses.find(c => c.sk === cl.courseId)?.name || '';
      return `<label style="display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="ann-class-cb-${cl.sk}" value="${cl.sk}" />
        ${cl.name}${courseName ? ` <span style="color:var(--muted);font-size:11px">(${courseName})</span>` : ''}
      </label>`;
    }).join('');
  }
}

document.getElementById('ann-assign-type').addEventListener('change', updateAssignUI);
document.getElementById('add-ann-btn').addEventListener('click', () => openAnnForm());
document.getElementById('ann-cancel').addEventListener('click', () => document.getElementById('ann-form').classList.add('hidden'));
document.getElementById('ann-save').addEventListener('click', async () => {
  const msg = document.getElementById('ann-msg');
  const id = document.getElementById('ann-id').value;
  const title = document.getElementById('ann-title').value.trim();
  if (!title) { msg.textContent = 'Title required.'; msg.className = 'msg error'; return; }
  const type = document.getElementById('ann-assign-type').value;
  let assignedTo = 'all';
  if (type === 'class') {
    assignedTo = Array.from(document.querySelectorAll('#ann-class-checkboxes input:checked')).map(cb => cb.value);
  } else if (type === 'individual') {
    assignedTo = document.getElementById('ann-usernames').value.split(',').map(s => s.trim()).filter(Boolean);
  }
  msg.textContent = 'Saving...'; msg.className = 'msg';
  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? `/announcements/${id}` : '/announcements';
  const res = await AUTH.api(method, endpoint, { title, message: document.getElementById('ann-message').value.trim(), assignedTo });
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = id ? 'Updated.' : 'Posted.'; msg.className = 'msg success';
  setTimeout(() => { document.getElementById('ann-form').classList.add('hidden'); loadAnnouncements(); }, 800);
});

// ==================== INIT ====================
(async () => {
  await Promise.all([loadCourses(), loadClasses()]);
  loadUsers();
})();
