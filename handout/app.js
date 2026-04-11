const user = AUTH.getUser();
const isTeacher = AUTH.isTeacher() || AUTH.isAdmin();

document.getElementById('nav-username').textContent = user?.['cognito:username'] || user?.email || '';

let allHandouts = [];
let allCourses = [];

// Load courses for filter and form
async function loadCourses() {
  if (!isTeacher) return;
  const res = await AUTH.api('GET', '/admin/classes');
  allCourses = Array.isArray(res) ? res : [];
  
  // Populate filter
  const filter = document.getElementById('course-filter');
  if (filter && allCourses.length) {
    filter.innerHTML = '<option value="all">All Courses</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
    document.getElementById('filter-bar').style.display = '';
  }
  
  // Populate form dropdown
  const courseSelect = document.getElementById('h-course');
  if (courseSelect) {
    courseSelect.innerHTML = '<option value="">No course</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
  }
}

// Load handouts
async function loadHandouts() {
  const list = document.getElementById('handouts-list');
  list.innerHTML = '<p style="color:var(--muted);font-size:14px">Loading...</p>';
  const res = await AUTH.api('GET', '/handouts');
  allHandouts = Array.isArray(res) ? res : [];
  renderHandouts();
}

function renderHandouts() {
  const list = document.getElementById('handouts-list');
  const filterVal = document.getElementById('course-filter')?.value || 'all';
  const filtered = filterVal === 'all' ? allHandouts : allHandouts.filter(h => h.courseId === filterVal);
  
  if (!filtered.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:14px">No handouts available.</p>';
    return;
  }
  
  list.innerHTML = '';
  filtered.forEach(h => {
    const courseName = allCourses.find(c => c.sk === h.courseId)?.name || '';
    const card = document.createElement('div');
    card.className = 'handout-card';
    card.innerHTML = `
      <div class="handout-header">
        <div>
          <div class="handout-title">${h.url ? `<a href="${h.url}" target="_blank">${h.title}</a>` : h.title}</div>
          ${courseName ? `<div class="handout-course">${courseName}</div>` : ''}
        </div>
      </div>
      ${h.description ? `<div class="handout-desc">${h.description}</div>` : ''}
      ${h.content ? `<div class="handout-content">${h.content}</div>` : ''}
      ${isTeacher ? `
      <div class="handout-actions">
        <button class="btn" onclick="editHandout('${h.sk}')">Edit</button>
        <button class="btn danger" onclick="deleteHandout('${h.sk}')">Delete</button>
      </div>` : ''}`;
    list.appendChild(card);
  });
}

document.getElementById('course-filter')?.addEventListener('change', renderHandouts);

// Teacher controls
if (isTeacher) {
  document.getElementById('add-handout-btn').style.display = '';
  
  document.getElementById('add-handout-btn').addEventListener('click', () => {
    document.getElementById('form-title').textContent = 'New Handout';
    document.getElementById('h-id').value = '';
    document.getElementById('h-title').value = '';
    document.getElementById('h-url').value = '';
    document.getElementById('h-desc').value = '';
    document.getElementById('h-content').value = '';
    document.getElementById('h-course').value = '';
    document.getElementById('h-msg').textContent = '';
    document.getElementById('handout-form').classList.remove('hidden');
  });
  
  document.getElementById('h-cancel').addEventListener('click', () => {
    document.getElementById('handout-form').classList.add('hidden');
  });
  
  document.getElementById('h-save').addEventListener('click', async () => {
    const msg = document.getElementById('h-msg');
    const id = document.getElementById('h-id').value;
    const title = document.getElementById('h-title').value.trim();
    const url = document.getElementById('h-url').value.trim();
    const description = document.getElementById('h-desc').value.trim();
    const content = document.getElementById('h-content').value.trim();
    const courseId = document.getElementById('h-course').value;
    
    if (!title) {
      msg.textContent = 'Title required.';
      msg.className = 'msg error';
      return;
    }
    
    msg.textContent = 'Saving...';
    msg.className = 'msg';
    
    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/handouts/${id}` : '/handouts';
    const res = await AUTH.api(method, endpoint, { title, url, description, content, courseId });
    
    if (res.error) {
      msg.textContent = res.error;
      msg.className = 'msg error';
      return;
    }
    
    msg.textContent = id ? 'Handout updated.' : 'Handout created.';
    msg.className = 'msg success';
    
    setTimeout(() => {
      document.getElementById('handout-form').classList.add('hidden');
      loadHandouts();
    }, 1000);
  });
}

window.editHandout = (id) => {
  const h = allHandouts.find(x => x.sk === id);
  if (!h) return;
  
  document.getElementById('form-title').textContent = 'Edit Handout';
  document.getElementById('h-id').value = h.sk;
  document.getElementById('h-title').value = h.title || '';
  document.getElementById('h-url').value = h.url || '';
  document.getElementById('h-desc').value = h.description || '';
  document.getElementById('h-content').value = h.content || '';
  document.getElementById('h-course').value = h.courseId || '';
  document.getElementById('h-msg').textContent = '';
  document.getElementById('handout-form').classList.remove('hidden');
};

window.deleteHandout = async (id) => {
  if (!confirm('Delete this handout?')) return;
  await AUTH.api('DELETE', '/handouts/' + id);
  loadHandouts();
};

// Init
(async () => {
  if (isTeacher) await loadCourses();
  loadHandouts();
})();
