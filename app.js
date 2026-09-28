/* PixelPDF — converts images to a PDF entirely in the browser (no libraries, no uploads). */

const $ = (id) => document.getElementById(id);
const els = {
  nav: $('nav'), navLinks: $('navLinks'), menuBtn: $('menuBtn'), themeToggle: $('themeToggle'),
  dropzone: $('dropzone'), fileInput: $('fileInput'), workspace: $('workspace'), grid: $('grid'),
  count: $('count'), plural: $('plural'), addMore: $('addMore'), clearAll: $('clearAll'),
  pageSize: $('pageSize'), orientation: $('orientation'), margin: $('margin'),
  quality: $('quality'), qualityVal: $('qualityVal'), fileName: $('fileName'),
  convertBtn: $('convertBtn'), progress: $('progress'), progressFill: $('progressFill'), progressText: $('progressText'),
  success: $('success'), resultInfo: $('resultInfo'), downloadBtn: $('downloadBtn'),
  backBtn: $('backBtn'), restartBtn: $('restartBtn'), toast: $('toast'),
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] }; // in PDF points (1/72 inch)
const MAX_SIDE = 3000; // cap image resolution to keep memory and file size reasonable

let items = []; // { id, file, url, rotation }
let nextId = 1;
let pdfUrl = null;

/* ---------------- UI chrome ---------------- */

els.themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('pp-theme', root.dataset.theme); } catch (e) {}
});

els.menuBtn.addEventListener('click', () => {
  const open = els.navLinks.classList.toggle('open');
  els.menuBtn.setAttribute('aria-expanded', open);
});
els.navLinks.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => els.navLinks.classList.remove('open')));

addEventListener('scroll', () => els.nav.classList.toggle('scrolled', scrollY > 10), { passive: true });

// Highlight the nav link of the section currently in view
const navAnchors = [...els.navLinks.querySelectorAll('a')];
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      navAnchors.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
['converter', 'how', 'features', 'faq'].forEach((id) => spy.observe($(id)));

$('year').textContent = new Date().getFullYear();

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

/* ---------------- Adding files ---------------- */

function addFiles(fileList) {
  const files = [...fileList];
  const valid = files.filter((f) => ACCEPTED.includes(f.type));
  if (valid.length < files.length) toast(`Skipped ${files.length - valid.length} unsupported file(s)`);
  if (!valid.length) return;
  valid.forEach((file) => items.push({ id: nextId++, file, url: URL.createObjectURL(file), rotation: 0 }));
  showView('workspace');
  render();
  if (!els.fileName.dataset.touched && items.length) {
    els.fileName.value = items[0].file.name.replace(/\.[^.]+$/, '') || 'my-images';
  }
}

els.fileInput.addEventListener('change', () => { addFiles(els.fileInput.files); els.fileInput.value = ''; });
els.addMore.addEventListener('click', () => els.fileInput.click());
els.fileName.addEventListener('input', () => { els.fileName.dataset.touched = '1'; });

['dragenter', 'dragover'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); els.dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => {
  e.preventDefault(); els.dropzone.classList.remove('drag');
}));
els.dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

// Allow dropping extra files anywhere on the workspace too
els.workspace.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
els.workspace.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
});

/* ---------------- Rendering the grid ---------------- */

const ICONS = {
  rotate: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};

function render() {
  els.count.textContent = items.length;
  els.plural.textContent = items.length === 1 ? '' : 's';
  els.grid.innerHTML = '';
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="thumb"><img src="${item.url}" alt="" class="r${item.rotation}" style="transform: rotate(${item.rotation}deg)"></div>
      <div class="card-meta"><span class="card-name"></span><span class="badge">${i + 1}</span></div>
      <div class="card-tools">
        <button class="tool" data-act="rotate" title="Rotate">${ICONS.rotate}</button>
        <button class="tool del" data-act="del" title="Remove">${ICONS.del}</button>
        <button class="tool move" data-act="left" title="Move left">${ICONS.left}</button>
        <button class="tool move" data-act="right" title="Move right">${ICONS.right}</button>
      </div>`;
    card.querySelector('.card-name').textContent = item.file.name;
    card.querySelector('.card-name').title = item.file.name;
    els.grid.appendChild(card);
  });
}

els.grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.tool');
  if (!btn) return;
  const id = +btn.closest('.card').dataset.id;
  const i = items.findIndex((it) => it.id === id);
  const act = btn.dataset.act;
  if (act === 'rotate') items[i].rotation = (items[i].rotation + 90) % 360;
  if (act === 'del') {
    URL.revokeObjectURL(items[i].url);
    items.splice(i, 1);
    if (!items.length) { showView('empty'); return; }
  }
  if (act === 'left' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
  if (act === 'right' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
  render();
});

// Drag-and-drop reordering
let dragId = null;
els.grid.addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  dragId = +card.dataset.id;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragId));
});
els.grid.addEventListener('dragend', () => {
  dragId = null;
  els.grid.querySelectorAll('.card').forEach((c) => c.classList.remove('dragging', 'over'));
});
els.grid.addEventListener('dragover', (e) => {
  if (dragId === null) return;
  e.preventDefault();
  const card = e.target.closest('.card');
  els.grid.querySelectorAll('.card.over').forEach((c) => c !== card && c.classList.remove('over'));
  if (card && +card.dataset.id !== dragId) card.classList.add('over');
});
els.grid.addEventListener('drop', (e) => {
  if (dragId === null) return;
  e.preventDefault();
  e.stopPropagation();
  const card = e.target.closest('.card');
  if (!card) return;
  const from = items.findIndex((it) => it.id === dragId);
  const to = items.findIndex((it) => it.id === +card.dataset.id);
  if (from === to) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  render();
});

els.clearAll.addEventListener('click', reset);
els.restartBtn.addEventListener('click', reset);
els.backBtn.addEventListener('click', () => showView('workspace'));

function reset() {
  items.forEach((it) => URL.revokeObjectURL(it.url));
  items = [];
  delete els.fileName.dataset.touched;
  els.fileName.value = 'my-images';
  showView('empty');
}

function showView(view) {
  els.dropzone.hidden = view !== 'empty';
  els.workspace.hidden = view !== 'workspace';
  els.success.hidden = view !== 'success';
}

/* ---------------- Settings ---------------- */

function segmented(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  return () => el.querySelector('.on').dataset.v;
}
const getOrientation = segmented(els.orientation);
const getMargin = segmented(els.margin);

function updateQualityLabel() {
  const q = +els.quality.value;
  els.qualityVal.textContent = q >= 0.95 ? 'Maximum' : q >= 0.85 ? 'High' : q >= 0.7 ? 'Medium' : 'Small file';
}
els.quality.addEventListener('input', updateQualityLabel);
updateQualityLabel();

/* ---------------- Conversion ---------------- */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = url;
  });
}

// Draw the image (rotated, on white) to a canvas and return JPEG bytes + dimensions
async function toJpeg(item, quality) {
  const img = await loadImage(item.url);
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);

  const sideways = item.rotation === 90 || item.rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: canvas.width, height: canvas.height };
}

// Work out page size and where the image sits on it
function layoutPage(img, sizeKey, orientation, margin) {
  let pw, ph;
  if (sizeKey === 'fit') {
    pw = img.width * 0.75; // 96 dpi pixels -> 72 dpi points
    ph = img.height * 0.75;
    pw += margin * 2; ph += margin * 2;
  } else {
    [pw, ph] = PAGE_SIZES[sizeKey];
    const landscape = orientation === 'landscape' || (orientation === 'auto' && img.width > img.height);
    if (landscape) [pw, ph] = [ph, pw];
  }
  const boxW = pw - margin * 2, boxH = ph - margin * 2;
  const s = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * s, dh = img.height * s;
  return { pw, ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
}

// Minimal PDF writer: one page per JPEG, embedded directly with DCTDecode
function buildPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); length += b.length; };
  const f = (n) => +n.toFixed(2);

  const total = 2 + pages.length * 3;
  push('%PDF-1.4\n%âãÏÓ\n');

  const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); body(); push('\nendobj\n'); };

  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));

  pages.forEach((p, i) => {
    const pageNum = 3 + i * 3, contentNum = pageNum + 1, imageNum = pageNum + 2;
    const { pw, ph, x, y, dw, dh } = p.layout;
    obj(pageNum, () => push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] ` +
      `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`));
    const stream = `q ${f(dw)} 0 0 ${f(dh)} ${f(x)} ${f(y)} cm /Im0 Do Q`;
    obj(contentNum, () => push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    obj(imageNum, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.img.width} /Height ${p.img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.img.bytes.length} >>\nstream\n`);
      push(p.img.bytes);
      push('\nendstream');
    });
  });

  const xrefStart = length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setProgress(done, total, label) {
  els.progressFill.style.width = `${Math.round((done / total) * 100)}%`;
  els.progressText.textContent = label;
}

els.convertBtn.addEventListener('click', async () => {
  if (!items.length) return;
  const sizeKey = els.pageSize.value;
  const orientation = getOrientation();
  const margin = +getMargin();
  const quality = +els.quality.value;
  const name = (els.fileName.value.trim() || 'my-images').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';

  els.convertBtn.disabled = true;
  els.progress.hidden = false;
  try {
    const pages = [];
    for (let i = 0; i < items.length; i++) {
      setProgress(i, items.length, `Processing ${i + 1} of ${items.length}…`);
      const img = await toJpeg(items[i], quality);
      pages.push({ img, layout: layoutPage(img, sizeKey, orientation, margin) });
    }
    setProgress(1, 1, 'Building PDF…');
    const blob = buildPdf(pages);

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);
    els.downloadBtn.href = pdfUrl;
    els.downloadBtn.download = name;
    els.resultInfo.textContent = `${name} · ${pages.length} page${pages.length === 1 ? '' : 's'} · ${formatSize(blob.size)}`;
    showView('success');
    els.downloadBtn.click(); // start the download automatically
    toast('Download started');
  } catch (err) {
    console.error(err);
    toast('Something went wrong: ' + err.message);
  } finally {
    els.convertBtn.disabled = false;
    els.progress.hidden = true;
    setProgress(0, 1, '');
  }
});
