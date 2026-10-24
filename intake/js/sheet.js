// Builds the printable session roster. Positions come from sheet_geometry.js,
// which the scanner also reads, so the paper and the camera cannot disagree.

import { TABLE, COL, QR, TITLE, LEDE, META, checkBox, rowY } from './sheet_geometry.js';

const $ = (id) => document.getElementById(id);
const pt = (n) => `${n}pt`;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const facilities = new Map(); // name -> code
let sheetCode = newCode();

function newCode() {
  let out = '';
  for (let i = 0; i < 4; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `SS-${out}`;
}

/** "M78 Marcus" or "M78, Marcus" → {id, name}. */
function parseRoster(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, ...rest] = line.split(/[,\t]|\s{2,}| (?=[A-Z][a-z])/);
      const cleanId = id.trim().replace(/[^A-Za-z0-9-]/g, '').slice(0, 10);
      const name = rest.join(' ').trim().slice(0, 28);
      return cleanId ? { id: cleanId.toUpperCase(), name } : null;
    })
    .filter(Boolean)
    .slice(0, TABLE.rows);
}

const rows = () => {
  const people = parseRoster($('roster').value);
  return Array.from({ length: TABLE.rows }, (_, i) => people[i] || { id: '', name: '' });
};

function placeChrome() {
  const put = (id, x, y) => {
    const el = $(id);
    if (!el) return;
    el.style.left = pt(x);
    el.style.top = pt(y);
  };
  put('ttl', TITLE.x, TITLE.y - 10);
  put('sub', LEDE.x, LEDE.y);
  put('meta', META.x, META.y);
  const qr = $('qr');
  qr.style.left = pt(QR.x);
  qr.style.top = pt(QR.y);
  qr.style.width = pt(QR.size);
  qr.style.height = pt(QR.size);

  document.querySelectorAll('[data-col]').forEach((el) => {
    const c = COL[el.dataset.col];
    if (c) el.style.left = pt(c.x);
  });
}

function drawGrid() {
  const people = rows();
  const parts = [];
  people.forEach((p, i) => {
    const y = rowY(i);
    const box = checkBox(i);
    parts.push(
      `<div class="rowline" style="left:36pt;top:${pt(y + TABLE.rowHeight)};width:540pt;height:.6pt"></div>`,
      `<div class="rnum" style="left:36pt;top:${pt(y + 11)};width:18pt">${String(i + 1).padStart(2, '0')}</div>`,
      p.id ? `<div class="rid" style="left:${pt(COL.id.x)};top:${pt(y + 10)}">${esc(p.id)}</div>` : '',
      p.name ? `<div class="rname" style="left:${pt(COL.name.x)};top:${pt(y + 9)}">${esc(p.name)}</div>` : '',
      `<div class="box" style="left:${pt(box.x)};top:${pt(box.y)};width:${pt(box.w)};height:${pt(box.h)}"></div>`
    );
  });
  $('grid').innerHTML = parts.join('');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function payload() {
  const people = rows();
  return JSON.stringify({
    v: 1,
    s: sheetCode,
    o: $('org').value.trim().slice(0, 40),
    p: $('program').value.trim().slice(0, 40),
    f: facilities.get($('facility').value.trim()) || $('facility').value.trim().slice(0, 12),
    d: $('date').value || '',
    n: Number($('session').value) || 1,
    i: people.map((x) => x.id),
  });
}

function drawQR() {
  const qr = qrcode(0, 'M');
  qr.addData(payload());
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
  const svg = $('qr').querySelector('svg');
  if (svg) {
    svg.setAttribute('width', pt(QR.size));
    svg.setAttribute('height', pt(QR.size));
    svg.style.display = 'block';
  }
}

function refresh() {
  const date = $('date').value;
  $('m-org').textContent = $('org').value.trim();
  $('m-program').textContent = $('program').value.trim();
  $('m-facility').textContent = $('facility').value.trim();
  $('m-date').textContent = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  $('m-session').textContent = String(Number($('session').value) || 1);
  $('m-sheet').textContent = sheetCode;
  drawQR();
}

async function boot() {
  placeChrome();

  try {
    const [fac, orgs] = await Promise.all([
      fetch('../data/intake/facilities.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('../data/intake/orgs/index.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ orgs: [] })),
    ]);
    for (const f of fac.facilities) {
      facilities.set(f.name, f.code);
      $('facilities').insertAdjacentHTML('beforeend', `<option value="${esc(f.name)}">`);
    }
    for (const o of orgs.orgs || []) {
      $('orglist').insertAdjacentHTML('beforeend', `<option value="${esc(o.org)}">`);
      for (const p of o.programs || []) $('programlist').insertAdjacentHTML('beforeend', `<option value="${esc(p.name)}">`);
    }
  } catch {
    /* offline is fine */
  }

  $('date').value = new Date().toISOString().slice(0, 10);

  try {
    const last = JSON.parse(localStorage.getItem('tpw.sheet.last') || '{}');
    for (const k of ['org', 'program', 'facility', 'roster']) if (last[k]) $(k).value = last[k];
  } catch {}

  for (const id of ['org', 'program', 'facility', 'date', 'session']) $(id).addEventListener('input', refresh);
  $('roster').addEventListener('input', () => {
    drawGrid();
    refresh();
  });

  $('print').addEventListener('click', () => {
    localStorage.setItem(
      'tpw.sheet.last',
      JSON.stringify({ org: $('org').value, program: $('program').value, facility: $('facility').value, roster: $('roster').value })
    );
    sheetCode = newCode();
    refresh();
    drawGrid();
    window.print();
  });

  drawGrid();
  refresh();
}

boot();
