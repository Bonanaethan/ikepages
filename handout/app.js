const user = AUTH.getUser();
const isTeacher = AUTH.isTeacher() || AUTH.isAdmin();
document.getElementById('nav-username').textContent = user?.['cognito:username'] || user?.email || '';

let allHandouts = [];
let allCourses = [];
let blocks = [];
let editingId = null;

// ---- COURSES ----
async function loadCourses() {
  const res = await AUTH.api('GET', '/admin/classes');
  allCourses = Array.isArray(res) ? res : [];

  const filter = document.getElementById('course-filter');
  const courseSelect = document.getElementById('h-course');

  if (allCourses.length) {
    document.getElementById('filter-bar').style.display = '';
    filter.innerHTML = '<option value="all">All Courses</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">No course</option>' +
        allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
    }
  }
}

// ---- HANDOUTS LIST ----
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
  const filtered = (filterVal === 'all' ? allHandouts : allHandouts.filter(h => h.courseId === filterVal))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!filtered.length) { list.innerHTML = '<p style="color:var(--muted);font-size:14px">No handouts available.</p>'; return; }
  list.innerHTML = '';
  filtered.forEach(h => {
    const courseName = allCourses.find(c => c.sk === h.courseId)?.name || '';
    const parsedBlocks = tryParseBlocks(h.content);
    const blockCount = parsedBlocks.length;
    const card = document.createElement('div');
    card.className = 'hw-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="hw-card-body" onclick="window.location.href='view.html?id=${h.sk}'">
        <div class="hw-card-subject">${courseName || 'Handout'}</div>
        <div class="hw-card-title">📄 ${h.title}</div>
        <div class="hw-card-meta">${blockCount} block${blockCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="hw-card-actions">
        ${isTeacher ? `
          <button class="btn" onclick="event.stopPropagation();openEditor('${h.sk}')">Edit</button>
          <button class="btn danger" onclick="event.stopPropagation();deleteHandout('${h.sk}')">Delete</button>
        ` : ''}
      </div>`;
    list.appendChild(card);
  });
}

function tryParseBlocks(content) {
  try { return JSON.parse(content); } catch { return []; }
}

document.getElementById('course-filter')?.addEventListener('change', renderHandouts);

window.deleteHandout = async (id) => {
  if (!confirm('Delete this handout?')) return;
  await AUTH.api('DELETE', '/handouts/' + id);
  loadHandouts();
};

// ---- EDITOR ----
function openEditor(id = null) {
  editingId = id;
  blocks = [];
  document.getElementById('h-id').value = id || '';
  document.getElementById('editor-msg').textContent = '';

  if (id) {
    const h = allHandouts.find(x => x.sk === id);
    if (h) {
      document.getElementById('editor-title').textContent = 'Edit Handout';
      document.getElementById('h-title').value = h.title || '';
      document.getElementById('h-course').value = h.courseId || '';
      blocks = tryParseBlocks(h.content);
    }
  } else {
    document.getElementById('editor-title').textContent = 'New Handout';
    document.getElementById('h-title').value = '';
    document.getElementById('h-course').value = '';
  }

  renderEditorBlocks();
  document.getElementById('editor-overlay').classList.remove('hidden');
  document.getElementById('editor-panel').classList.remove('hidden');
  setTimeout(() => document.getElementById('editor-panel').classList.add('open'), 10);
}

window.openEditor = openEditor;

function closeEditor() {
  document.getElementById('editor-panel').classList.remove('open');
  setTimeout(() => {
    document.getElementById('editor-panel').classList.add('hidden');
    document.getElementById('editor-overlay').classList.add('hidden');
  }, 300);
}

document.getElementById('editor-close').addEventListener('click', closeEditor);
document.getElementById('editor-cancel').addEventListener('click', closeEditor);
document.getElementById('editor-overlay').addEventListener('click', closeEditor);

if (isTeacher) {
  document.getElementById('add-handout-btn').style.display = '';
  document.getElementById('add-handout-btn').addEventListener('click', () => openEditor());
}

// ---- BLOCKS ----
function addBlock(type) {
  const block = { type, id: Date.now() + Math.random() };
  if (type === 'header') block.text = '';
  if (type === 'paragraph') block.text = '';
  if (type === 'bullets') block.items = [''];
  if (type === 'image') block.url = ''; block.alt = '';
  if (type === 'file') block.url = ''; block.name = '';
  if (type === 'math') block.formula = '';
  if (type === 'divider') {}
  blocks.push(block);
  renderEditorBlocks();
}

document.querySelectorAll('.block-add-btn').forEach(btn => {
  btn.addEventListener('click', () => addBlock(btn.dataset.type));
});

function moveBlock(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= blocks.length) return;
  [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
  renderEditorBlocks();
}

function removeBlock(idx) {
  blocks.splice(idx, 1);
  renderEditorBlocks();
}

function renderEditorBlocks() {
  const container = document.getElementById('blocks-container');
  container.innerHTML = '';
  if (!blocks.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;padding:40px 0">Use the toolbar above to add blocks.</p>';
    return;
  }
  blocks.forEach((block, idx) => {
    const el = document.createElement('div');
    el.className = 'block';
    el.innerHTML = `
      <div class="block-controls">
        <button class="block-ctrl-btn" onclick="moveBlock(${idx},-1)" title="Move up">↑</button>
        <button class="block-ctrl-btn" onclick="moveBlock(${idx},1)" title="Move down">↓</button>
        <button class="block-ctrl-btn del" onclick="removeBlock(${idx})" title="Delete">×</button>
      </div>
      ${blockEditorHTML(block, idx)}`;
    container.appendChild(el);
    // Attach events after DOM insert
    attachBlockEvents(el, block, idx);
  });
}

window.moveBlock = moveBlock;
window.removeBlock = removeBlock;

function blockEditorHTML(block, idx) {
  if (block.type === 'header') return `
    <div class="block-label">Header</div>
    <input type="text" class="block-field" data-idx="${idx}" data-field="text" placeholder="Header text..." value="${escAttr(block.text || '')}" />`;

  if (block.type === 'paragraph') return `
    <div class="block-label">Paragraph</div>
    <textarea class="block-field" data-idx="${idx}" data-field="text" placeholder="Write your text here..." rows="4">${escHtml(block.text || '')}</textarea>`;

  if (block.type === 'bullets') return `
    <div class="block-label">Bullet List</div>
    <div id="bullets-${idx}">
      ${(block.items || ['']).map((item, i) => `
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input type="text" class="bullet-item" data-idx="${idx}" data-item="${i}" placeholder="List item..." value="${escAttr(item)}" style="flex:1" />
          <button class="block-ctrl-btn del" onclick="removeBullet(${idx},${i})">×</button>
        </div>`).join('')}
    </div>
    <button class="block-add-btn" onclick="addBullet(${idx})" style="margin-top:4px">+ Add item</button>`;

  if (block.type === 'image') return `
    <div class="block-label">Image</div>
    <div class="block-upload-area" onclick="document.getElementById('img-upload-${idx}').click()">
      <input type="file" id="img-upload-${idx}" accept="image/*" data-idx="${idx}" data-type="image" />
      ${block.url ? `<img src="${escAttr(block.url)}" class="block-upload-preview" />` : '<div class="block-upload-label">Click to upload image</div>'}
      <div class="upload-progress" id="img-progress-${idx}"></div>
    </div>
    <input type="text" class="block-field" data-idx="${idx}" data-field="alt" placeholder="Alt text (optional)" value="${escAttr(block.alt || '')}" style="margin-top:8px" />`;

  if (block.type === 'file') return `
    <div class="block-label">File Attachment</div>
    <div class="block-upload-area" onclick="document.getElementById('file-upload-${idx}').click()">
      <input type="file" id="file-upload-${idx}" data-idx="${idx}" data-type="file" />
      ${block.url ? `<div class="block-upload-filename">📎 ${escHtml(block.name || 'File attached')}</div>` : '<div class="block-upload-label">Click to upload file</div>'}
      <div class="upload-progress" id="file-progress-${idx}"></div>
    </div>`;

  if (block.type === 'math') return `
    <div class="block-label">Math Equation (LaTeX)</div>
    <input type="text" class="block-field math-input" data-idx="${idx}" data-field="formula" placeholder="e.g. \\frac{a}{b} + c^2" value="${escAttr(block.formula || '')}" />
    <div class="math-preview" id="math-preview-${idx}">${renderMath(block.formula || '')}</div>`;

  if (block.type === 'divider') return `<div class="block-label">Divider</div><hr style="border-color:var(--border);margin-top:4px" />`;

  return '';
}

function attachBlockEvents(el, block, idx) {
  // Text fields
  el.querySelectorAll('.block-field').forEach(input => {
    input.addEventListener('input', e => {
      blocks[e.target.dataset.idx][e.target.dataset.field] = e.target.value;
      if (block.type === 'math') {
        document.getElementById(`math-preview-${idx}`).innerHTML = renderMath(e.target.value);
      }
    });
  });

  // Bullet items
  el.querySelectorAll('.bullet-item').forEach(input => {
    input.addEventListener('input', e => {
      const i = parseInt(e.target.dataset.item);
      blocks[idx].items[i] = e.target.value;
    });
  });

  // File uploads
  el.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', e => handleUpload(e, idx));
  });
}

window.addBullet = (idx) => {
  blocks[idx].items.push('');
  renderEditorBlocks();
};

window.removeBullet = (idx, i) => {
  blocks[idx].items.splice(i, 1);
  if (!blocks[idx].items.length) blocks[idx].items = [''];
  renderEditorBlocks();
};

async function handleUpload(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  const type = e.target.dataset.type;
  const progressEl = document.getElementById(`${type === 'image' ? 'img' : 'file'}-progress-${idx}`);
  progressEl.textContent = 'Uploading...';

  const res = await AUTH.api('POST', '/upload-url', { filename: file.name, contentType: file.type });
  if (res.error) { progressEl.textContent = 'Upload failed: ' + res.error; return; }

  await fetch(res.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

  blocks[idx].url = res.publicUrl;
  if (type === 'file') blocks[idx].name = file.name;
  progressEl.textContent = 'Uploaded.';
  renderEditorBlocks();
}

function renderMath(formula) {
  if (!formula) return '';
  try {
    return katex.renderToString(formula, { throwOnError: false, displayMode: true });
  } catch { return `<span style="color:#e05252">Invalid formula</span>`; }
}

// ---- SAVE ----
document.getElementById('editor-save').addEventListener('click', async () => {
  const msg = document.getElementById('editor-msg');
  const title = document.getElementById('h-title').value.trim();
  const courseId = document.getElementById('h-course').value;
  const id = document.getElementById('h-id').value;

  if (!title) { msg.textContent = 'Title required.'; msg.className = 'msg error'; return; }
  if (!blocks.length) { msg.textContent = 'Add at least one block.'; msg.className = 'msg error'; return; }

  msg.textContent = 'Saving...'; msg.className = 'msg';
  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? `/handouts/${id}` : '/handouts';
  const res = await AUTH.api(method, endpoint, { title, courseId, content: JSON.stringify(blocks) });

  if (res.error) { msg.textContent = res.error; msg.className = 'msg error'; return; }
  msg.textContent = 'Saved.'; msg.className = 'msg success';
  setTimeout(() => { closeEditor(); loadHandouts(); }, 800);
});

// ---- RENDER BLOCKS (student view) ----
function renderBlocks(blocks) {
  if (!blocks || !blocks.length) return '';
  return blocks.map(b => {
    if (b.type === 'header') return `<div class="render-header">${escHtml(b.text || '')}</div>`;
    if (b.type === 'paragraph') return `<div class="render-paragraph">${escHtml(b.text || '')}</div>`;
    if (b.type === 'bullets') return `<ul class="render-bullets">${(b.items || []).map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`;
    if (b.type === 'image' && b.url) return `<img src="${escAttr(b.url)}" alt="${escAttr(b.alt || '')}" class="render-image" />`;
    if (b.type === 'file' && b.url) return `<a href="${escAttr(b.url)}" target="_blank" class="render-file">📎 ${escHtml(b.name || 'Download file')}</a>`;
    if (b.type === 'math' && b.formula) return `<div class="render-math">${renderMath(b.formula)}</div>`;
    if (b.type === 'divider') return `<hr class="render-divider" />`;
    return '';
  }).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(str) {
  return String(str).replace(/"/g,'&quot;');
}

// ---- INIT ----
(async () => {
  // Load courses for everyone so filter shows course names
  const res = await AUTH.api('GET', '/admin/classes');
  allCourses = Array.isArray(res) ? res : [];

  const filter = document.getElementById('course-filter');
  if (allCourses.length) {
    document.getElementById('filter-bar').style.display = '';
    filter.innerHTML = '<option value="all">All Courses</option>' +
      allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
  }

  if (isTeacher) {
    const courseSelect = document.getElementById('h-course');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">No course</option>' +
        allCourses.map(c => `<option value="${c.sk}">${c.name}</option>`).join('');
    }
  }

  loadHandouts();
})();
