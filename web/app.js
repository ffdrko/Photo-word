// this is app js
/* SnapNote web client */
const $ = (id) => document.getElementById(id);

const els = {
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  cameraInput: $('cameraInput'),
  thumbsWrap: $('thumbsWrap'),
  imageCount: $('imageCount'),
  runOcrBtn: $('runOcrBtn'),
  ocrStatus: $('ocrStatus'),
  stepText: $('step-text'),
  rawText: $('rawText'),
  formatBtn: $('formatBtn'),
  stepPreview: $('step-preview'),
  docTitle: $('docTitle'),
  blocksPreview: $('blocksPreview'),
  exportBtn: $('exportBtn'),
  startOverBtn: $('startOverBtn'),
  themeToggle: $('themeToggle'),
};

let images = []; // [{ file, url }]
let currentBlocks = [];

// ---------- Theme ----------
const savedTheme = localStorage.getItem('snapnote-theme');
if (savedTheme === 'dark') {
  document.documentElement.dataset.theme = 'dark';
  els.themeToggle.textContent = '☀️';
}
els.themeToggle.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  if (!dark) delete document.documentElement.dataset.theme;
  els.themeToggle.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('snapnote-theme', dark ? 'dark' : 'light');
});

// ---------- Image selection ----------
function addImages(fileList) {
  let added = false;
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    images.push({ file, url: URL.createObjectURL(file) });
    added = true;
  }
  if (!added) return;
  renderThumbs();
  updateCount();
}

function removeImage(index) {
  URL.revokeObjectURL(images[index].url);
  images.splice(index, 1);
  renderThumbs();
  updateCount();
}

function renderThumbs() {
  els.thumbsWrap.innerHTML = '';
  els.thumbsWrap.classList.toggle('hidden', images.length === 0);
  els.runOcrBtn.classList.toggle('hidden', images.length === 0);
  images.forEach((img, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb';
    const el = document.createElement('img');
    el.src = img.url;
    el.alt = `Image ${i + 1}`;
    const btn = document.createElement('button');
    btn.className = 'thumb-remove';
    btn.textContent = '✕';
    btn.title = 'Remove image';
    btn.addEventListener('click', () => removeImage(i));
    wrap.append(el, btn);
    els.thumbsWrap.appendChild(wrap);
  });
}

function updateCount() {
  const n = images.length;
  els.imageCount.textContent = n ? `(${n} image${n > 1 ? 's' : ''})` : '';
  els.dropZone.querySelector('p').textContent =
    n === 0 ? 'Drag & drop images here (multiple allowed), or' : 'Add more images:';
}

els.fileInput.addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });
els.cameraInput.addEventListener('change', (e) => { addImages(e.target.files); e.target.value = ''; });

['dragover', 'dragenter'].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  els.dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
  })
);
els.dropZone.addEventListener('drop', (e) => addImages(e.dataTransfer.files));

// ---------- OCR (sequential over all images) ----------
function setStatus(msg, isError = false) {
  els.ocrStatus.textContent = msg;
  els.ocrStatus.classList.toggle('error', isError);
  els.ocrStatus.classList.remove('hidden');
}

els.runOcrBtn.addEventListener('click', async () => {
  if (!images.length) return;
  els.runOcrBtn.disabled = true;
  els.rawText.value = '';
  const confidences = [];
  try {
    for (let i = 0; i < images.length; i++) {
      setStatus(`⏳ Running OCR on image ${i + 1} of ${images.length}…`);
      const fd = new FormData();
      fd.append('image', images[i].file);
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `OCR failed for image ${i + 1}`);
      if (typeof data.confidence === 'number') confidences.push(data.confidence);
      if (els.rawText.value) els.rawText.value += '\n\n';
      els.rawText.value += data.rawText;
    }
    const avg = confidences.length
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
      : null;
    setStatus(`✅ Done${avg !== null ? ` (average confidence: ${avg}%)` : ''}`);
    els.stepText.classList.remove('hidden');
    els.rawText.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(`❌ ${err.message}`, true);
  } finally {
    els.runOcrBtn.disabled = false;
  }
});

// ---------- Format ----------
els.formatBtn.addEventListener('click', async () => {
  const rawText = els.rawText.value.trim();
  if (!rawText) return;
  els.formatBtn.disabled = true;
  try {
    const res = await fetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Formatting failed');
    currentBlocks = data.blocks;
    renderBlocks(currentBlocks);
    els.stepPreview.classList.remove('hidden');
    els.stepPreview.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
  } finally {
    els.formatBtn.disabled = false;
  }
});

function renderBlocks(blocks) {
  els.blocksPreview.innerHTML = '';
  for (const b of blocks) {
    let node;
    if (b.type.startsWith('heading')) {
      node = document.createElement(b.type); // h1/h2/h3
      node.textContent = b.text;
    } else if (b.type === 'bullet') {
      node = renderListItem('ul', b);
    } else if (b.type === 'numbered') {
      node = renderListItem('ol', b);
    } else {
      node = document.createElement('p');
      node.append(...renderRuns(b.runs));
    }
    els.blocksPreview.appendChild(node);
  }
}

function renderRuns(runs) {
  return (runs || []).map((r) => {
    const span = document.createElement('span');
    span.textContent = r.text;
    if (r.bold) span.style.fontWeight = 'bold';
    if (r.italic) span.style.fontStyle = 'italic';
    return span;
  });
}

function renderListItem(tag, block) {
  // group consecutive list items into a single ul/ol
  const last = els.blocksPreview.lastElementChild;
  if (last && last.tagName.toLowerCase() === tag) {
    const li = document.createElement('li');
    li.append(...renderRuns(block.runs));
    last.appendChild(li);
    return null;
  }
  const list = document.createElement(tag);
  const li = document.createElement('li');
  li.append(...renderRuns(block.runs));
  list.appendChild(li);
  return list;
}

// ---------- Export ----------
els.exportBtn.addEventListener('click', async () => {
  if (!currentBlocks.length) return;
  els.exportBtn.disabled = true;
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: currentBlocks, title: els.docTitle.value || 'Notes' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(els.docTitle.value || 'notes').replace(/[^a-z0-9 _-]/gi, '').trim() || 'notes'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  } finally {
    els.exportBtn.disabled = false;
  }
});

// ---------- Reset ----------
els.startOverBtn.addEventListener('click', () => {
  images.forEach((i) => URL.revokeObjectURL(i.url));
  images = [];
  currentBlocks = [];
  renderThumbs();
  updateCount();
  els.ocrStatus.classList.add('hidden');
  els.stepText.classList.add('hidden');
  els.stepPreview.classList.add('hidden');
  els.rawText.value = '';
  els.blocksPreview.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
