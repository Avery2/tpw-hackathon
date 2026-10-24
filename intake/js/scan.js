// Photograph a filled roster sheet → a session record.
//
// No OCR, on purpose. The sheet carries a QR code that fixes where the page is;
// everything else is geometry from sheet_geometry.js. The only thing read off
// the paper is which boxes have ink in them. Names never leave the sheet.

import { TABLE, COL, checkBox, sheetToImage, imageScale } from './sheet_geometry.js';
import { issueUrl } from './transport.js';

const $ = (s) => document.querySelector(s);
const app = () => document.getElementById('app');

const state = {
  config: {},
  facilities: [], // [{code, name}]
  image: null, // canvas holding the photograph
  location: null, // jsQR corner data
  decoded: null, // {v,s,d,p,f}
  marks: [], // booleans, one per row
  manual: null, // present count when no QR was found
  done: null,
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, tone = '') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

/* ------------------------------------------------------------------ org */
// One person, one organization: whoever is holding the phone. Typed once, kept
// on the device, used as the default on every sheet after that.
const ORG_KEY = 'tpw.scan.org.v1';
function lastOrg() {
  try {
    return localStorage.getItem(ORG_KEY) || '';
  } catch {
    return '';
  }
}
function rememberOrg(org) {
  try {
    if (org) localStorage.setItem(ORG_KEY, org);
  } catch {}
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  const [config, facilities] = await Promise.all([
    fetch('../data/intake/config.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch('../data/intake/facilities.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d.facilities)
      .catch(() => []),
  ]);
  state.config = config;
  state.facilities = facilities;
  render();
}

/* ---------------------------------------------------------------- render */
function render() {
  if (state.done) {
    app().innerHTML = doneScreen();
    $('[data-act="again"]')?.addEventListener('click', reset);
    return;
  }

  app().innerHTML = `
    <h1>Scan a filled sheet</h1>
    <p class="lede">One flat photo of the whole page. Only the ticked boxes are read —
       the names stay on the paper.</p>
    <div class="drop" id="drop">
      <b>Photograph the sheet</b>
      <span>or drop an image here</span>
      <input type="file" id="file" accept="image/*" capture="environment">
    </div>
    <div class="stage ${state.image ? 'on' : ''}" id="stage">
      <div class="shot"><canvas id="canvas"></canvas></div>
      <div class="result" id="result"></div>
    </div>`;

  const drop = $('#drop');
  const file = $('#file');
  file.addEventListener('change', () => file.files?.[0] && handleFile(file.files[0]));
  drop.addEventListener('click', (e) => {
    if (e.target !== file) file.click();
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  if (state.image) {
    renderResult();
    draw();
  }
}

function reset() {
  Object.assign(state, { image: null, location: null, decoded: null, marks: [], manual: null, done: null });
  render();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------- the image */
async function handleFile(file) {
  const bitmap = await createImageBitmap(file).catch(
    () =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      })
  );
  if (!bitmap) return toast('Could not read that image.', 'bad');

  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);

  state.image = canvas;
  state.decoded = null;
  state.location = null;
  state.manual = null;
  state.marks = Array(TABLE.rows).fill(false);

  const pixels = ctx.getImageData(0, 0, w, h);
  const found = window.jsQR ? window.jsQR(pixels.data, w, h, { inversionAttempts: 'attemptBoth' }) : null;

  if (found) {
    try {
      const payload = JSON.parse(found.data);
      if (payload && payload.v === 1) {
        state.decoded = payload;
        state.location = found.location;
        readBoxes(pixels, found.location);
      }
    } catch {
      /* not one of our sheets */
    }
  }

  render();
  if (!state.decoded) {
    toast('No sheet code found in that photo.', 'bad');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * Sample the interior of each tick box. The QR's three corners give an affine
 * map, so rotation, scale and mild skew are handled with no image library.
 */
function readBoxes(pixels, location) {
  const { data, width, height } = pixels;
  const map = sheetToImage(location);
  const scale = imageScale(location);
  const luma = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  // Paper brightness, measured on the blank strip left of the tick column.
  const refPoint = map(COL.name.x + COL.name.w - 8, TABLE.firstRow + TABLE.rowHeight / 2);
  let refSum = 0;
  let refN = 0;
  for (let dx = -3; dx <= 3; dx += 1) {
    for (let dy = -3; dy <= 3; dy += 1) {
      const l = luma(Math.round(refPoint.x + dx * scale), Math.round(refPoint.y + dy * scale));
      if (l != null) {
        refSum += l;
        refN += 1;
      }
    }
  }
  const ref = refN ? refSum / refN : 235;

  state.marks = [];
  for (let i = 0; i < TABLE.rows; i += 1) {
    const box = checkBox(i);
    const p = map(box.x + box.w / 2, box.y + box.h / 2);
    let dark = 0;
    let total = 0;
    // Sample the inner 10pt of the 18pt box, at half-point spacing, so a pen
    // stroke cannot slip between sample points.
    for (let dx = -5; dx <= 5; dx += 0.5) {
      for (let dy = -5; dy <= 5; dy += 0.5) {
        const l = luma(Math.round(p.x + dx * scale), Math.round(p.y + dy * scale));
        if (l != null) {
          total += 1;
          if (l < ref * 0.62) dark += 1;
        }
      }
    }
    state.marks.push(total > 0 && dark / total >= 0.08);
  }
}

/* ---------------------------------------------------------------- drawing */
function draw() {
  const canvas = $('#canvas');
  if (!canvas || !state.image) return;
  canvas.width = state.image.width;
  canvas.height = state.image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(state.image, 0, 0);
  if (!state.location) return;

  const map = sheetToImage(state.location);
  state.marks.forEach((on, i) => {
    const box = checkBox(i);
    const a = map(box.x, box.y);
    const b = map(box.x + box.w, box.y + box.h);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = on ? '#5d8d67' : 'rgba(150,150,150,.5)';
    if (on) {
      ctx.fillStyle = 'rgba(93,141,103,.25)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  });
}

const rosterIds = () => {
  const ids = state.decoded?.i || [];
  return Array.from({ length: TABLE.rows }, (_, i) => ids[i] || '');
};

const rowId = (i) => rosterIds()[i] || '';

/* --------------------------------------------------------------- results */
function renderResult() {
  const panel = $('#result');
  if (!panel) return;

  if (!state.decoded) {
    panel.innerHTML = `
      <div class="banner bad">No sheet code found. Retake the photo flat, with the whole page in frame — or count by hand.</div>
      <div class="row"><div><label>Present</label>
        <input id="f-present" type="number" min="0" max="60" placeholder="How many in the room"></div></div>
      <div class="row">
        <div><label>Organization</label>
          <input id="f-org" type="text" value="${esc(lastOrg())}"></div>
        <div><label>Program</label><input id="f-program" type="text" value=""></div>
      </div>
        <div><label>Facility</label><input id="f-facility" type="text" value="" list="flist">
          <datalist id="flist">${state.facilities.map((f) => `<option value="${esc(f.name)}">`).join('')}</datalist></div>
      </div>
      <div class="row"><div><label>Session date</label>
        <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <button class="primary" type="button" id="manual-file">File this session</button>
      <div class="alts"><button type="button" data-act="again">Try another photo</button></div>`;
    $('#manual-file').addEventListener('click', () => {
      state.manual = Math.max(0, Number($('#f-present').value) || 0);
      const record = buildRecord();
      if (record) publish(record);
    });
    return;
  }

  const d = state.decoded;
  const facility = state.facilities.find((f) => f.code === d.f);
  const present = state.marks.filter(Boolean).length;

  panel.innerHTML = `
    <div class="banner ok">Sheet <b>${esc(d.s)}</b>${d.d ? ` · ${esc(d.d)}` : ''}${facility ? ` · ${esc(facility.name)}` : ''}</div>
    <div class="count"><b id="present-count">${present}</b><span>ticked — tap an ID to correct it</span></div>
    <div class="chips" id="chips">
      ${state.marks
        .map((on, i) => `<span class="chip ${on ? 'in' : ''}" data-row="${i}" title="${esc(rowId(i) || 'walk-in row')}">${esc(rowId(i) || String(i + 1).padStart(2, '0'))}</span>`)
        .join('')}
    </div>
    <form id="session-form">
      <div class="row">
        <div><label for="f-org">Organization</label>
          <input id="f-org" type="text" value="${esc(d.o || lastOrg())}"></div>
        <div><label for="f-program">Program</label>
          <input id="f-program" type="text" value="${esc(d.p || '')}"></div>
      </div>
      <div class="row">
        <div><label for="f-facility">Facility</label>
          <input id="f-facility" type="text" value="${esc(facility?.name || '')}" list="flist">
          <datalist id="flist">${state.facilities.map((f) => `<option value="${esc(f.name)}">`).join('')}</datalist></div>
        <div><label for="f-date">Session date</label>
          <input id="f-date" type="date" value="${esc(d.d || '')}"></div>
      </div>
      <button class="primary" type="submit">File this session</button>
      <div class="alts">
        <button type="button" data-act="download">Download the file</button>
        <button type="button" data-act="again">Use a different photo</button>
      </div>
    </form>`;

  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const i = Number(chip.dataset.row);
    state.marks[i] = !state.marks[i];
    chip.classList.toggle('in', state.marks[i]);
    $('#present-count').textContent = state.marks.filter(Boolean).length;
    draw();
  });

  $('#session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const record = buildRecord();
    if (record) publish(record);
  });

  $('[data-act="download"]')?.addEventListener('click', () => {
    const record = buildRecord();
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${record.id}.json`;
    a.click();
    state.done = { record, channel: 'file' };
    render();
  });

  $('[data-act="again"]')?.addEventListener('click', reset);
}

function buildRecord() {
  const program = ($('#f-program')?.value || '').trim();
  const facility = ($('#f-facility')?.value || '').trim();
  const date = $('#f-date')?.value || '';
  const present = state.manual != null ? state.manual : state.marks.filter(Boolean).length;
  const org = ($('#f-org')?.value || '').trim();

  if (!org) return toast('Which organization is filing this?', 'bad'), null;
  if (!program) return toast('Which program is this?', 'bad'), null;  if (!facility) return toast('Which facility?', 'bad'), null;
  if (!date) return toast('Session date is missing.', 'bad'), null;

  rememberOrg(org);

  const slug = program.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const roster = rosterIds();
  const ticked = state.marks.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const presentIds = ticked.map((i) => roster[i]).filter(Boolean);
  const walkins = ticked.filter((i) => !roster[i]).length;

  return {
    id: `session-${slug}-${date}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'session',
    schema: 'tpw.simple/1',
    source: state.decoded ? 'scan' : 'scan-manual',
    submitted_at: new Date().toISOString(),
    org: org,
    program,
    facility,
    session_date: date,
    session_no: state.decoded?.n || null,
    sheet: state.decoded?.s || null,
    roster,
    roster_size: roster.filter(Boolean).length,
    present: presentIds,
    present_count: presentIds.length,
    walkins,
    checked_count: present,
  };
}

function publish(record) {
  const url = issueUrl(record, state.config, `[intake:session] ${record.program} · ${record.session_date}`);
  if (url.length > 7000) {
    toast('Too large for an issue link — download the file instead.', 'bad');
    return;
  }
  window.open(url, '_blank', 'noopener');
  state.done = { record, channel: 'issue', url };
  render();
}

function doneScreen() {
  const { record, channel, url } = state.done;
  return `
    <div class="done">
      <div class="mark">✓</div>
      <h2>Session recorded</h2>
      <p>${record.present} present · ${esc(record.program || '')} · ${esc(record.session_date)}
        ${channel === 'issue' ? '<br>A GitHub tab opened — submit the issue to finish.' : ''}</p>
      ${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Open it on GitHub →</a></p>` : ''}
      <button class="primary" data-act="again" type="button">Scan another sheet</button>
    </div>`;
}

boot();
