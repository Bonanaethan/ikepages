const isTeacher = AUTH.isTeacher() || AUTH.isAdmin();
const username = AUTH.getUser()?.['cognito:username'] || '';
document.getElementById('nav-username').textContent = username;
if (isTeacher) document.getElementById('add-hw-btn').classList.remove('hidden');

let allAssignments = [];
let doneMap = {};
let allCourses = [];
let blocks = [];
let editingId = null;
let currentFilter = 'all';

// Built-in assignments (always present)
const BUILTINS = [];

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(str) { return String(str).replace(/"/g,'&quot;'); }

// ---- LOAD DATA ----
async function init() {
  // Load courses for everyone (for filter)
  const coursesRes = await AUTH.api('GET', '/courses');
  allCourses = Array.isArray(coursesRes) ? coursesRes : [];

  if (allCourses.length) {
    // For students, only show courses accessible via their classes
    let visibleCourses = allCourses;
    if (!isTeacher) {
      // Get student's own classes, then find their course IDs
      const classesRes = await AUTH.api('GET', '/my/classes');
      const allClassesList = Array.isArray(classesRes) ? classesRes : [];
      const studentClasses = allClassesList.filter(c => (c.members || []).includes(username));
      const studentCourseIds = new Set(studentClasses.map(c => c.courseId).filter(Boolean));
      visibleCourses = allCourses.filter(c => studentCourseIds.has(c.sk));
    }
    if (visibleCourses.length) {
      const filterBar = document.getElementById('course-filter-bar');
      const filterSel = document.getElementById('hw-course-filter');
      filterBar.style.display = '';
      filterSel.innerHTML = '<option value="all">All Courses</option>' +
        visibleCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
      filterSel.addEventListener('change', render);

      // Auto-apply course filter from URL param
      const urlCourse = new URLSearchParams(window.location.search).get('course');
      if (urlCourse && visibleCourses.find(c => c.sk === urlCourse)) {
        filterSel.value = urlCourse;
      }
    }
  }

  // Populate editor course dropdown for teachers
  if (isTeacher) {
    const sel = document.getElementById('hw-course');
    if (sel) sel.innerHTML = '<option value="">No course</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
  }

  const [assignments, done] = await Promise.all([
    AUTH.api('GET', '/assignments'),
    AUTH.api('GET', '/assignments/done')
  ]);
  allAssignments = Array.isArray(assignments) ? assignments : [];
  doneMap = done || {};
  render();
}

// ---- RENDER CARDS ----
function render() {
  const list = document.getElementById('hw-list');
  const empty = document.getElementById('hw-empty');
  list.innerHTML = '';

  const all = [...BUILTINS, ...allAssignments];

  const courseFilter = document.getElementById('hw-course-filter')?.value || 'all';

  let filtered = all.filter(hw => {
    const done = !!doneMap[hw.sk];
    if (currentFilter === 'pending') return !done;
    if (currentFilter === 'done') return done;
    return true;
  }).filter(hw => {
    if (courseFilter === 'all') return true;
    if (hw.builtin) return false;
    return hw.courseId === courseFilter;
  });

  filtered.sort((a, b) => {
    if (a.builtin && !b.builtin) return -1;
    if (!a.builtin && b.builtin) return 1;
    if (!isTeacher) return a.title.localeCompare(b.title);
    const da = !!doneMap[a.sk], db = !!doneMap[b.sk];
    if (da !== db) return da ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  if (!filtered.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  if (!isTeacher && courseFilter === 'all') {
    // Group by course for students when showing all
    const groups = {};
    filtered.forEach(hw => {
      const key = hw.courseId || '__none__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(hw);
    });

    Object.entries(groups).forEach(([courseId, items]) => {
      const courseName = allCourses.find(c => c.sk === courseId)?.name || (courseId === '__none__' ? 'General' : 'Unknown');
      const header = document.createElement('div');
      header.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--yellow);font-weight:600;margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)';
      header.textContent = courseName;
      list.appendChild(header);
      items.forEach(hw => renderHwCard(hw, list));
    });
  } else {
    filtered.forEach(hw => renderHwCard(hw, list));
  }
}

function renderHwCard(hw, list) {
    const done = !!doneMap[hw.sk];
    const overdue = hw.dueDate && !done && new Date(hw.dueDate) < new Date().setHours(0,0,0,0);
    const dueText = hw.dueDate
      ? `Due ${new Date(hw.dueDate + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'No due date';
    const courseName = allCourses.find(c => c.sk === hw.courseId)?.name || '';

    const card = document.createElement('div');
    card.className = 'hw-card' + (done ? ' done' : '');
    card.innerHTML = `
      <div class="hw-check ${done ? 'checked' : ''}" data-id="${hw.sk}" title="Mark complete"></div>
      <div class="hw-card-body">
        <div class="hw-card-subject">${escHtml(hw.subject || courseName || 'General')}</div>
        <div class="hw-card-title">${escHtml(hw.title)}</div>
        <div class="hw-card-meta ${overdue ? 'overdue' : ''}">${overdue ? '⚠ Overdue · ' : ''}${dueText}</div>
      </div>
      <div class="hw-card-actions">
        ${hw.practiceLink ? `<a class="hw-doc-badge" href="${escHtml(hw.practiceLink)}" target="_blank" rel="noopener noreferrer">📝 Practice</a>` : ''}
        ${isTeacher && !hw.builtin ? `
          <button class="hw-edit-btn" data-id="${hw.sk}" title="Edit">✏</button>
          <button class="hw-delete" data-id="${hw.sk}" title="Delete">×</button>
        ` : ''}
      </div>`;

    // Click body to view (only for non-builtin or builtin without practiceLink)
    if (!hw.builtin) {
      card.querySelector('.hw-card-body').addEventListener('click', () => {
        window.location.href = `view.html?id=${hw.sk}`;
      });
    }

    card.querySelector('.hw-check').addEventListener('click', e => {
      e.stopPropagation();
      toggleDone(hw.sk);
    });
    card.querySelector('.hw-edit-btn')?.addEventListener('click', e => { e.stopPropagation(); openEditor(hw.sk); });
    card.querySelector('.hw-delete')?.addEventListener('click', e => { e.stopPropagation(); deleteHw(hw.sk); });

    list.appendChild(card);
}

async function toggleDone(id) {
  doneMap[id] = !doneMap[id];
  render();
  await AUTH.api('POST', `/assignments/${id}/done`, { done: doneMap[id] });
}

async function deleteHw(id) {
  if (!confirm('Delete this assignment?')) return;
  await AUTH.api('DELETE', '/assignments/' + id);
  allAssignments = allAssignments.filter(a => a.sk !== id);
  render();
}

// ---- FILTERS ----
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// ---- EDITOR ----
function openEditor(id = null) {
  editingId = id;
  blocks = [];
  document.getElementById('hw-id').value = id || '';
  document.getElementById('editor-msg').textContent = '';

  if (id) {
    const hw = allAssignments.find(a => a.sk === id);
    if (hw) {
      document.getElementById('editor-title').textContent = 'Edit Assignment';
      document.getElementById('hw-title-input').value = hw.title || '';
      document.getElementById('hw-subject').value = hw.subject || '';
      document.getElementById('hw-due').value = hw.dueDate || '';
      document.getElementById('hw-course').value = hw.courseId || '';
      document.getElementById('hw-assign').value = hw.assignedTo === 'all' ? '' : (Array.isArray(hw.assignedTo) ? hw.assignedTo.join(', ') : hw.assignedTo);
      try { blocks = JSON.parse(hw.content); } catch { blocks = []; }
    }
  } else {
    document.getElementById('editor-title').textContent = 'New Assignment';
    ['hw-title-input','hw-subject','hw-due','hw-assign'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('hw-course').value = '';
  }

  renderEditorBlocks();
  document.getElementById('editor-overlay').classList.remove('hidden');
  document.getElementById('editor-panel').classList.remove('hidden');
  setTimeout(() => document.getElementById('editor-panel').classList.add('open'), 10);
}

function closeEditor() {
  document.getElementById('editor-panel').classList.remove('open');
  setTimeout(() => {
    document.getElementById('editor-panel').classList.add('hidden');
    document.getElementById('editor-overlay').classList.add('hidden');
  }, 300);
}

document.getElementById('add-hw-btn').addEventListener('click', () => openEditor());
document.getElementById('editor-close').addEventListener('click', closeEditor);
document.getElementById('editor-cancel').addEventListener('click', closeEditor);
document.getElementById('editor-overlay').addEventListener('click', closeEditor);

document.getElementById('editor-save').addEventListener('click', async () => {
  const msg = document.getElementById('editor-msg');
  const title = document.getElementById('hw-title-input').value.trim();
  const id = document.getElementById('hw-id').value;
  if (!title) { msg.textContent = 'Title required.'; msg.className = 'msg error'; return; }
  msg.textContent = 'Saving...'; msg.className = 'msg';

  const assignRaw = document.getElementById('hw-assign').value.trim();
  const assignedTo = assignRaw ? assignRaw.split(',').map(s => s.trim()).filter(Boolean) : 'all';

  const payload = {
    title,
    subject: document.getElementById('hw-subject').value.trim(),
    dueDate: document.getElementById('hw-due').value,
    courseId: document.getElementById('hw-course').value,
    assignedTo,
    content: JSON.stringify(blocks)
  };

  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? `/assignments/${id}` : '/assignments';
  const res = await AUTH.api(method, endpoint, payload);
  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Saved.'; msg.className = 'msg success';
  setTimeout(async () => {
    closeEditor();
    const assignments = await AUTH.api('GET', '/assignments');
    allAssignments = Array.isArray(assignments) ? assignments : [];
    render();
  }, 800);
});

// ---- BLOCK EDITOR (shared with handout) ----
function addBlock(type) {
  const block = { type, id: Date.now() + Math.random() };
  if (type === 'header') block.text = '';
  if (type === 'paragraph') block.text = '';
  if (type === 'bullets') block.items = [''];
  if (type === 'image') { block.url = ''; block.alt = ''; }
  if (type === 'file') { block.url = ''; block.name = ''; }
  if (type === 'question') { block.question = ''; block.hint = ''; block.answer = ''; block.solution = ''; block.type = 'question'; }
  blocks.push(block);
  renderEditorBlocks();
}

document.querySelectorAll('.block-add-btn').forEach(btn => {
  btn.addEventListener('click', () => addBlock(btn.dataset.type));
});

window.moveBlock = (idx, dir) => {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= blocks.length) return;
  [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
  renderEditorBlocks();
};

window.removeBlock = (idx) => { blocks.splice(idx, 1); renderEditorBlocks(); };
window.addBullet = (idx) => { blocks[idx].items.push(''); renderEditorBlocks(); };
window.removeBullet = (idx, i) => { blocks[idx].items.splice(i, 1); if (!blocks[idx].items.length) blocks[idx].items = ['']; renderEditorBlocks(); };

function renderEditorBlocks() {
  const container = document.getElementById('blocks-container');
  container.innerHTML = '';
  if (!blocks.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;padding:40px 0">Use the toolbar above to add content blocks.</p>';
    return;
  }
  blocks.forEach((block, idx) => {
    const el = document.createElement('div');
    el.className = 'block';
    el.innerHTML = `
      <div class="block-controls">
        <button class="block-ctrl-btn" onclick="moveBlock(${idx},-1)">↑</button>
        <button class="block-ctrl-btn" onclick="moveBlock(${idx},1)">↓</button>
        <button class="block-ctrl-btn del" onclick="removeBlock(${idx})">×</button>
      </div>
      ${blockEditorHTML(block, idx)}`;
    container.appendChild(el);
    attachBlockEvents(el, block, idx);
  });
}

function blockEditorHTML(block, idx) {
  if (block.type === 'header') return `<div class="block-label">Header</div><input type="text" class="block-field" data-idx="${idx}" data-field="text" placeholder="Header text..." value="${escAttr(block.text||'')}" />`;
  if (block.type === 'paragraph') return `<div class="block-label">Paragraph</div><textarea class="block-field" data-idx="${idx}" data-field="text" placeholder="Write text here..." rows="4">${escHtml(block.text||'')}</textarea>`;
  if (block.type === 'bullets') return `<div class="block-label">Bullet List</div><div id="bullets-${idx}">${(block.items||['']).map((item,i)=>`<div style="display:flex;gap:6px;margin-bottom:6px"><input type="text" class="bullet-item" data-idx="${idx}" data-item="${i}" placeholder="List item..." value="${escAttr(item)}" style="flex:1"/><button class="block-ctrl-btn del" onclick="removeBullet(${idx},${i})">×</button></div>`).join('')}</div><button class="block-add-btn" onclick="addBullet(${idx})" style="margin-top:4px">+ Add item</button>`;
  if (block.type === 'image') return `<div class="block-label">Image</div><div class="block-upload-area" onclick="document.getElementById('img-upload-${idx}').click()"><input type="file" id="img-upload-${idx}" accept="image/*" data-idx="${idx}" data-type="image"/>${block.url?`<img src="${escAttr(block.url)}" class="block-upload-preview"/>`:'<div class="block-upload-label">Click to upload image</div>'}<div class="upload-progress" id="img-progress-${idx}"></div></div><input type="text" class="block-field" data-idx="${idx}" data-field="alt" placeholder="Alt text (optional)" value="${escAttr(block.alt||'')}" style="margin-top:8px"/>`;
  if (block.type === 'file') return `<div class="block-label">File Attachment</div><div class="block-upload-area" onclick="document.getElementById('file-upload-${idx}').click()"><input type="file" id="file-upload-${idx}" data-idx="${idx}" data-type="file"/>${block.url?`<div class="block-upload-filename">📎 ${escHtml(block.name||'File attached')}</div>`:'<div class="block-upload-label">Click to upload file</div>'}<div class="upload-progress" id="file-progress-${idx}"></div></div>`;
  if (block.type === 'math') return `<div class="block-label">Math Equation (LaTeX)</div><input type="text" class="block-field math-input" data-idx="${idx}" data-field="formula" placeholder="e.g. \\frac{a}{b}" value="${escAttr(block.formula||'')}"/><div class="math-preview" id="math-preview-${idx}">${renderMath(block.formula||'')}</div>`;
  if (block.type === 'divider') return `<div class="block-label">Divider</div><hr style="border-color:var(--border);margin-top:4px"/>`;
  if (block.type === 'question') return `
    <div class="block-label">Question</div>
    <textarea class="block-field" data-idx="${idx}" data-field="question" placeholder="Question text (supports LaTeX with \\( \\) or \\[ \\])" rows="3">${escHtml(block.question||'')}</textarea>
    <input type="text" class="block-field" data-idx="${idx}" data-field="hint" placeholder="Hint (optional)" value="${escAttr(block.hint||'')}" style="margin-top:6px"/>
    <input type="text" class="block-field" data-idx="${idx}" data-field="answer" placeholder="Correct answer (students must match this exactly)" value="${escAttr(block.answer||'')}" style="margin-top:6px"/>
    <textarea class="block-field" data-idx="${idx}" data-field="solution" placeholder="Solution explanation (shown when student clicks 'Show Solution')" rows="3" style="margin-top:6px">${escHtml(block.solution||'')}</textarea>`;
}

function attachBlockEvents(el, block, idx) {
  el.querySelectorAll('.block-field').forEach(input => {
    input.addEventListener('input', e => {
      blocks[e.target.dataset.idx][e.target.dataset.field] = e.target.value;
      if (block.type === 'math') document.getElementById(`math-preview-${idx}`).innerHTML = renderMath(e.target.value);
    });
  });
  el.querySelectorAll('.bullet-item').forEach(input => {
    input.addEventListener('input', e => { blocks[idx].items[parseInt(e.target.dataset.item)] = e.target.value; });
  });
  el.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', e => handleUpload(e, idx));
  });
}

async function handleUpload(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  const type = e.target.dataset.type;
  const progressEl = document.getElementById(`${type === 'image' ? 'img' : 'file'}-progress-${idx}`);
  progressEl.textContent = 'Uploading...';
  const res = await AUTH.api('POST', '/upload-url', { filename: file.name, contentType: file.type });
  if (res.error) { progressEl.textContent = 'Upload failed.'; return; }
  await fetch(res.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  blocks[idx].url = res.publicUrl;
  if (type === 'file') blocks[idx].name = file.name;
  progressEl.textContent = 'Uploaded.';
  renderEditorBlocks();
}

function renderMath(formula) {
  if (!formula) return '';
  try { return katex.renderToString(formula, { throwOnError: false, displayMode: true }); }
  catch { return `<span style="color:#e05252">Invalid formula</span>`; }
}

init();
