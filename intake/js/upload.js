// Read a RIGHT 4.0 application packet and fill the ledger from it.
//
// The packet is the organization's own statement of who it is, who signs for it,
// what it delivers and where. Asking for the same facts on a form means typing
// them a fifth time, and every retype is a chance to spell the name differently
// and split one organization into two.
//
// So: ask for the files, read them here, show what came from where, let a person
// correct it, and file one profile record through the same transports the rest
// of the intake uses. The PDFs never leave the browser — see pdftext.js.

import { readPdf } from './pdftext.js';
import { buildDraft, pointsFor } from './extract.js';
import { recordIssueUrl, commitRecord } from './transport.js';

const DATA = new URL('../../data/intake/', import.meta.url);
const PUBLIC = new URL('../../data/public/', import.meta.url);

const state = {
  catalog: null,
  config: {},
  facilities: [],
  reference: new Map(),
  files: [],
  draft: null,
  assignments: {},
  overrides: {},
  sites: new Map(),
  tier: null,
  showAll: false,
  busy: false,
  error: null,
  fatal: null,
  done: null,
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(message, tone = '') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

async function getJSON(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

/** Five columns, no nested quotes: a real parser would be more code than this. */
function parseCSV(text) {
  const rows = [];
  for (const line of text.trim().split('\n')) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { cells.push(cell); cell = ''; }
      else cell += c;
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

/* ------------------------------------------------------------------- boot */
async function boot() {
  const [catalog, config, facilities, grid] = await Promise.all([
    getJSON(new URL('documents.json', DATA), null),
    getJSON(new URL('config.json', DATA), {}),
    getJSON(new URL('facilities.json', DATA), { facilities: [] }),
    fetch(new URL('cdcr-attachment-a-institutions.csv', PUBLIC), { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
  ]);

  if (!catalog) {
    state.fatal = 'The document catalogue (data/intake/documents.json) did not load.';
    return render();
  }

  state.catalog = catalog;
  state.config = config;
  state.facilities = facilities.facilities || [];
  for (const [code, , underserved, eop, mhcb, rhu] of parseCSV(grid).slice(1)) {
    state.reference.set(code, {
      underserved: underserved === 'yes',
      EOP: eop === 'yes',
      MHCB: mhcb === 'yes',
      RHU: rhu === 'yes',
    });
  }

  render();
}

/* ------------------------------------------------------------------ render */
function render() {
  const app = document.getElementById('app');
  if (state.fatal) {
    app.innerHTML = `<h1>Something is missing</h1><p class="lede">${esc(state.fatal)}</p>`;
    return;
  }
  if (state.done) {
    app.innerHTML = doneScreen();
    wireDone();
    return;
  }
  if (!state.draft) {
    app.innerHTML = askScreen();
    wireAsk();
    return;
  }
  app.innerHTML = reviewScreen();
  wireReview();
}

/* ------------------------------------------------------------- 1. the ask */
function askScreen() {
  const docs = state.catalog.documents;
  const required = docs.filter((d) => d.required);
  const bySection = new Map();
  for (const d of docs) {
    if (!bySection.has(d.section)) bySection.set(d.section, []);
    bySection.get(d.section).push(d);
  }

  return `
    <h1>Read the packet</h1>
    <p class="lede">A RIGHT 4.0 application already contains most of what the ledger asks for. Drop the packet here
      and we will read it back, show where every fact came from, and let you correct it before anything is filed.</p>

    <div class="drop" id="drop">
      <b>Drop the application packet</b>
      <span>PDFs · one file or fifteen · nothing leaves this browser</span>
      <input type="file" id="files" accept="application/pdf" multiple>
    </div>

    <p class="note">The files are read with pdf.js in this page and are never uploaded. What gets filed is the
      handful of facts below, not the packet: a member organization's tax forms and budgets do not belong in a
      public repository.</p>

    <h2>What we look for</h2>
    <p class="help" style="margin-bottom:14px">${required.length} of these ${docs.length} are required for a
      complete application. Every one of them is a document an organization has already signed.</p>
    ${[...bySection.entries()]
      .map(
        ([section, list]) => `
        <h3>${esc(section)}</h3>
        <ul class="plain">
          ${list
            .map(
              (d) => `<li class="doc">
                <span class="mark"></span>
                <span class="what">
                  <span class="name">${esc(d.label)}${d.required ? '' : ' <span class="opt">optional</span>'}</span>
                  <span class="why">${esc(gives(d))}</span>
                </span>
              </li>`
            )
            .join('')}
        </ul>`
      )
      .join('')}
  `;
}

function wireDrop() {
  const drop = document.getElementById('drop');
  const input = document.getElementById('files');
  if (!drop) return;
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => takeFiles([...input.files]));
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  }
  drop.addEventListener('drop', (e) => takeFiles([...e.dataTransfer.files]));
}

async function takeFiles(list) {
  const pdfs = list.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (!pdfs.length) {
    toast('That is not a PDF. Scans of a signed page are fine as long as they were saved as PDF.', 'bad');
    return;
  }
  const limit = state.catalog.limits?.files || 12;
  if (state.files.length + pdfs.length > limit) {
    toast(`Up to ${limit} files at a time.`, 'bad');
    return;
  }

  state.busy = true;
  render();
  document.getElementById('app').innerHTML = `<h1>Reading…</h1><p class="lede"><span class="spinner"></span>
    ${pdfs.length} file${pdfs.length === 1 ? '' : 's'}. A thirty-page packet takes about a second.</p>`;

  for (const file of pdfs) {
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > (state.catalog.limits?.bytes || 2e7)) {
        toast(`${file.name} is too large to read here.`, 'bad');
        continue;
      }
      const read = await readPdf(bytes);
      state.files.push({ name: file.name, pages: read.pages, numPages: read.numPages });
    } catch (err) {
      toast(`${file.name}: ${err.message || 'could not be read'}`, 'bad');
    }
  }

  state.busy = false;
  rebuild();
  render();
}

function rebuild() {
  state.draft = buildDraft({
    files: state.files,
    catalog: state.catalog,
    facilities: state.facilities,
    reference: state.reference,
    assignments: state.assignments,
  });

  // The grid is the one field a person is likely to touch, so it lives in local
  // state that survives a rebuild.
  state.sites = new Map(
    state.draft.sites.map((s) => [
      s.code,
      { populations: new Set(s.populations), language: !!s.language, underserved: !!s.underserved, from: s.from },
    ])
  );
  state.tier = state.draft.points.budget_tier;
}

/* ---------------------------------------------------------- 2. the review */
const GROUP_ORDER = ['org', 'signatory', 'program', 'sites', 'grant'];

function reviewScreen() {
  const d = state.draft;
  const found = d.documents.filter((x) => x.found);
  const missingRequired = d.documents.filter((x) => !x.found && x.required);
  const fields = state.catalog.fields;

  return `
    <h1>${esc(value('org.legal_name') || 'This packet')}</h1>
    <p class="lede">Read from ${found.length} document${found.length === 1 ? '' : 's'} across
      ${state.files.length} file${state.files.length === 1 ? '' : 's'}. Correct anything that came out wrong;
      nothing is filed until you say so.</p>

    <div class="stats">
      <div class="stat"><b>${found.length}</b><span>documents recognised</span></div>
      <div class="stat"><b>${d.filled}</b><span>facts filled in</span></div>
      <div class="stat"><b>${missingRequired.length}</b><span>still to ask for</span></div>
    </div>

    ${d.checks.refused ? refusedBanner(d.checks.refused) : ''}

    <h2>What was in the packet</h2>
    <ul class="plain">
      ${d.documents
        .map((doc) => docRow(doc))
        .join('')}
    </ul>
    ${d.loose.length ? `<p class="help">${d.loose.length} page${d.loose.length === 1 ? '' : 's'} of the upload
      matched no document (the RFA's own instructions, mostly). They were read for nothing and are not kept.</p>` : ''}

    ${missingRequired.length ? missingCard(missingRequired) : ''}

    <form id="profile" novalidate>
      ${GROUP_ORDER.filter((g) => fields.some((f) => f.group === g))
        .map((g) => groupBlock(g))
        .join('')}

      ${pointsCard()}

      <button class="primary" type="submit">File this profile</button>
      <div class="alts">
        <span>Filed as one record in <code>data/intake/records/profile/</code>.</span>
        <button type="button" data-act="download">Download the JSON instead</button>
        <button type="button" data-act="token">Use an access token</button>
      </div>
      ${jsonPreview()}
    </form>
  `;
}

function refusedBanner(refused) {
  return `<p class="note" style="border-color:var(--bad);color:var(--bad)">
    This upload contains a ${esc(refused.label)} on ${esc(refused.file)} page ${refused.page}. Nothing else was read:
    that page does not belong in a grant packet and it does not belong in this repository.</p>`;
}

const FIELD_LABEL = () => new Map(state.catalog.fields.map((f) => [f.key, f.label]));

/** "Gives: legal name, DBA, entity type" — what a document is for, in one line. */
function gives(doc) {
  const labels = FIELD_LABEL();
  const names = (doc.reads || [])
    .filter((k) => labels.has(k))
    .map((k) => labels.get(k).toLowerCase());
  return names.length ? `gives ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}` : String(doc.note || '').slice(0, 140);
}

function docRow(doc) {
  const tag = doc.required ? '' : ' <span class="opt">optional</span>';
  const pages = doc.found ? `${doc.pages.length}p` : '';
  // Anything we could not identify can still be pointed at a file by hand: an
  // insurance certificate, a budget, a screenshot of a Secretary of State page.
  const who = doc.found
    ? ''
    : `<select data-assign="${esc(doc.id)}">
         <option value="">which file?</option>
         ${state.files.map((f) => `<option ${state.assignments[doc.id] === f.name ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
       </select>`;
  return `<li class="doc ${doc.found ? '' : 'off'}">
    <span class="mark ${doc.found ? 'on' : ''}">${doc.found ? '✓' : '·'}</span>
    <span class="what">
      <span class="name">${esc(doc.label)}${tag}</span>
      <span class="why">${esc(doc.found ? gives(doc) : 'Not in this upload.')}</span>
    </span>
    <span class="pages">${esc(pages)}${pages && who ? ' · ' : ''}${who}</span>
  </li>`;
}

function missingCard(missing) {
  return `
    <h2>Ask them for these</h2>
    <div class="note" style="border-color:var(--warn)">
      <p style="margin:0 0 8px">A complete packet still needs:</p>
      <ul style="margin:0 0 10px;padding-left:18px">
        ${missing.map((m) => `<li>${esc(m.label)}</li>`).join('')}
      </ul>
      <button type="button" class="alts" data-act="copy-missing"
        style="all:unset;cursor:pointer;text-decoration:underline;font-size:13.5px;color:var(--muted)">
        Copy the list</button>
    </div>`;
}

function groupBlock(groupId) {
  const meta = state.catalog.groups.find((g) => g.id === groupId) || { title: groupId };
  if (groupId === 'sites') {
    return `<h2>${esc(meta.title)}</h2><p class="help" style="margin:-4px 0 12px">${esc(meta.blurb)}</p>
      ${sitesBlock()}`;
  }
  return `<h2>${esc(meta.title)}</h2><p class="help" style="margin:-4px 0 12px">${esc(meta.blurb)}</p>
    ${state.catalog.fields.filter((f) => f.group === groupId).map((f) => fieldBlock(f)).join('')}`;
}

const METHOD = {
  form: 'form field',
  'caption-left': 'label beside the box',
  'caption-above': 'label above the box',
  text: 'printed text',
};

function fieldBlock(field) {
  const found = state.draft.fields[field.key];
  const current = value(field.key);
  const local = field.privacy === 'local';
  const badge = found
    ? `<span class="badge ${found.confidence}"><span class="dot"></span>${esc(found.sources[0].source)} ·
        ${esc(METHOD[found.sources[0].method] || found.sources[0].method)}${
        found.sources.length > 1 ? ` +${found.sources.length - 1}` : ''
      }</span>`
    : '';
  const opt = field.required ? '' : '<span class="opt">optional</span>';
  const lock = local && current ? '<span class="local">stays on this device</span>' : '';
  const err = state.error && state.error[field.key] ? `<p class="conflict">${esc(state.error[field.key])}</p>` : '';
  const conflict = found?.conflict
    ? `<p class="conflict">The packet disagrees with itself here: also reads “${esc(found.conflict)}”.</p>`
    : '';
  const help = field.help ? `<p class="help">${esc(field.help)}</p>` : '';
  const label = `<label for="f-${field.key}">${esc(field.label)}${opt}${badge}${lock}</label>`;

  let inner;
  if (field.type === 'choice') {
    inner = `<select id="f-${field.key}" name="${field.key}">
      <option value="">—</option>
      ${(field.options || [])
        .map((o) => `<option value="${esc(o.value)}" ${current === o.value ? 'selected' : ''}>${esc(o.label)}</option>`)
        .join('')}
    </select>`;
  } else if (field.type === 'textarea') {
    inner = `<textarea id="f-${field.key}" name="${field.key}" maxlength="${field.max || 600}">${esc(current)}</textarea>`;
  } else if (field.type === 'date') {
    inner = `<input id="f-${field.key}" name="${field.key}" type="date" value="${esc(current)}">`;
  } else if (field.type === 'int') {
    inner = `<input id="f-${field.key}" name="${field.key}" type="number" inputmode="numeric" min="0" step="1" value="${esc(current)}">`;
  } else if (field.type === 'list') {
    const list = Array.isArray(current) ? current.join(', ') : current;
    inner = `<input id="f-${field.key}" name="${field.key}" type="text" value="${esc(list)}" placeholder="Spanish, Vietnamese">`;
  } else {
    inner = `<input id="f-${field.key}" name="${field.key}" type="text" value="${esc(current)}" maxlength="${field.max || 200}">`;
  }

  return `<div class="field" data-key="${esc(field.key)}">${label}${inner}${help}${conflict}${err}</div>`;
}

function sitesBlock() {
  const rows = new Map();
  for (const f of state.facilities) rows.set(f.code, { code: f.code, name: f.name });
  for (const [code, site] of state.sites) {
    if (!rows.has(code)) rows.set(code, { code, name: site.facility || code });
  }

  const ordered = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const relevant = (code) => state.sites.has(code);

  return `
    <p class="help" style="margin-top:0">Attachment A, cell by cell: the institution, and the population the
      program would serve there. The packet's ticks are pre-filled; a printed x on the state's page means the
      opposite and was ignored.</p>
    ${state.error?.sites ? `<p class="conflict">${esc(state.error.sites)}</p>` : ''}
    <table class="grid ${state.showAll ? 'showall' : ''}" id="grid">
      <thead>
        <tr><th>Institution</th><th>GP</th><th>EOP</th><th>MHCB</th><th>RHU</th><th>Other<br>language</th></tr>
      </thead>
      <tbody>
        ${ordered
          .map((r) => {
            const site = state.sites.get(r.code);
            const ref = state.reference.get(r.code);
            const cell = (p) => `<td><input type="checkbox" data-site="${esc(r.code)}" data-pop="${p}"
              ${site?.populations.has(p) ? 'checked' : ''}></td>`;
            return `<tr class="${relevant(r.code) ? '' : 'extra'}" data-row="${esc(r.code)}">
              <td>${esc(r.name)}${ref?.underserved ? ' <span class="star">*</span>' : ''}</td>
              ${cell('GP')}${cell('EOP')}${cell('MHCB')}${cell('RHU')}
              <td><input type="checkbox" data-site="${esc(r.code)}" data-pop="LANGUAGE" ${site?.language ? 'checked' : ''}></td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
    <p class="help"><span class="star">*</span> underserved institution, worth half a point.
      <button type="button" data-act="all" style="all:unset;cursor:pointer;text-decoration:underline;color:var(--muted)">
        ${state.showAll ? 'Show only the institutions in this packet' : 'Show all 31 institutions'}</button></p>`;
}

function pointsCard() {
  const sites = siteList();
  const languages = asList(value('program.languages'));
  const points = pointsFor({ tier: state.tier, sites, languages });
  const bands = [
    ['', 'Not stated'],
    ['1', 'under $250,000 — 1 point'],
    ['2', '$250,000 to $500,000 — 2 points'],
    ['3', 'above $500,000 — 3 points'],
  ];
  return `
    <h2>What this packet is worth</h2>
    <p class="help" style="margin:-4px 0 12px">Straight from §9 of the RFA: points come from the budget band, plus
      at most one more for the criteria below. It is not a score of the program; it is how the money is divided.</p>
    <div class="points">
      <div class="total">${points.total} <span style="font-size:13px;color:var(--muted)">of ${points.max}</span></div>
      <ul>
        <li>Budget band: ${esc(points.budget_tier ? `${points.budget_tier} point${points.budget_tier === 1 ? '' : 's'}` : 'not read — no budget in this upload')}</li>
        ${points.extra.map((e) => `<li>+${e.points} for ${esc(e.why)}</li>`).join('')}
        ${points.extra.length ? '<li>Additional points are capped at 1.0</li>' : ''}
      </ul>
      <div class="field" style="margin:14px 0 0">
        <label for="tier">Budget band</label>
        <select id="tier">
          ${bands.map(([v, label]) => `<option value="${v}" ${String(state.tier || '') === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
        ${state.draft.budget_total
          ? `<p class="help">Read from the budget PDF. The figure itself stays on this device.</p>`
          : `<p class="help">Two budget PDFs set this. Without them, ask the organization which band they are in.</p>`}
      </div>
    </div>`;
}

function jsonPreview() {
  return `<details><summary>Show the record that would be filed</summary><pre>${esc(
    JSON.stringify(assemble(), null, 2)
  )}</pre></details>`;
}

/* ------------------------------------------------------------ form wiring */
function wireAsk() {
  wireDrop();
}

function wireReview() {
  const form = document.getElementById('profile');
  if (!form) return;

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.site) {
      const site = state.sites.get(el.dataset.site) || {
        populations: new Set(),
        language: false,
        underserved: !!state.reference.get(el.dataset.site)?.underserved,
        from: 'manual',
      };
      if (el.dataset.pop === 'LANGUAGE') site.language = el.checked;
      else if (el.checked) site.populations.add(el.dataset.pop);
      else site.populations.delete(el.dataset.pop);
      state.sites.set(el.dataset.site, site);
      if (el.checked) document.querySelector(`[data-row="${el.dataset.site}"]`)?.classList.remove('extra');
      refreshPoints();
      return;
    }
    if (el.id === 'tier') {
      state.tier = el.value ? Number(el.value) : null;
      refreshPoints();
      return;
    }
    if (el.name) {
      state.overrides[el.name] = el.value;
      if (state.error) delete state.error[el.name];
    }
  });

  form.addEventListener('change', (e) => {
    if (!e.target.dataset.assign) return;
    const id = e.target.dataset.assign;
    if (e.target.value) state.assignments[id] = e.target.value;
    else delete state.assignments[id];
    rebuild();
    render();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    file();
  });

  document.querySelector('[data-act="download"]')?.addEventListener('click', download);
  document.querySelector('[data-act="token"]')?.addEventListener('click', withToken);
  document.querySelector('[data-act="all"]')?.addEventListener('click', () => {
    state.showAll = !state.showAll;
    document.getElementById('grid').classList.toggle('showall', state.showAll);
  });
  document.querySelector('[data-act="copy-missing"]')?.addEventListener('click', copyMissing);
}

function refreshPoints() {
  const card = document.querySelector('.points');
  if (!card) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = pointsCard();
  const next = wrapper.querySelector('.points');
  card.replaceWith(next);
  const tier = next.querySelector('#tier');
  tier?.addEventListener('change', (e) => {
    state.tier = e.target.value ? Number(e.target.value) : null;
    refreshPoints();
  });
}

function copyMissing() {
  const list = state.draft.documents.filter((d) => !d.found && d.required).map((d) => `- ${d.label}`);
  const text = `For a complete RIGHT 4.0 packet, we still need:\n${list.join('\n')}`;
  navigator.clipboard?.writeText(text).then(
    () => toast('Copied. Paste it into the email.', 'good'),
    () => toast('Could not copy; the list is on the page.', 'bad')
  );
}

/* --------------------------------------------------------------- assemble */
function value(key) {
  if (key in state.overrides) return state.overrides[key];
  const found = state.draft.fields[key];
  if (!found) return '';
  return Array.isArray(found.value) ? found.value : found.value;
}

function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function siteList() {
  return [...state.sites.entries()]
    .filter(([, s]) => s.populations.size || s.language)
    .map(([code, s]) => ({
      code,
      facility: state.facilities.find((f) => f.code === code)?.name || code,
      populations: [...s.populations].sort(),
      language: !!s.language,
      underserved: !!s.underserved,
    }));
}

const slug = (s) =>
  String(s || 'org')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';

export function assemble() {
  const today = new Date().toISOString().slice(0, 10);
  const get = (key) => {
    const v = value(key);
    return Array.isArray(v) ? '' : String(v || '').trim();
  };
  const num = (key) => {
    const n = Number(String(get(key)).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const org = compact({
    legal_name: get('org.legal_name'),
    dba: get('org.dba'),
    entity: get('org.entity'),
    nonprofit_status: get('org.nonprofit_status'),
    fiscal_sponsor: get('org.fiscal_sponsor'),
    nonprofit_cert: get('org.nonprofit_cert'),
    website: get('org.website'),
    email: get('org.email'),
  });

  const signatory = compact({
    name: get('signatory.name'),
    title: get('signatory.title'),
    email: get('signatory.email'),
    signed_on: get('signatory.signed_on'),
  });

  const contacts = [];
  for (const i of [0, 1]) {
    const c = compact({
      name: get(`contacts.${i}.name`),
      title: get(`contacts.${i}.title`),
      email: get(`contacts.${i}.email`),
      phone: get(`contacts.${i}.phone`),
    });
    // The signatory is usually also contact #1. Say it once.
    if (Object.keys(c).length && c.name !== signatory.name) contacts.push(c);
  }

  const program = compact({
    name: get('program.name'),
    summary: get('program.summary'),
    delivery: get('program.delivery'),
    languages: asList(value('program.languages')),
    capacity: num('program.capacity'),
    frequency: get('program.frequency'),
  });

  const grant = compact({
    round: get('grant.round'),
    solicitation: get('grant.solicitation'),
    vendor_id: get('grant.vendor_id'),
    agreement_no: get('grant.agreement_no'),
    funding_start: get('grant.funding_start'),
    funding_end: get('grant.funding_end'),
    application_due: get('grant.application_due'),
    executed_county: get('grant.executed_county'),
  });

  const sites = siteList().map((s) =>
    compact({
      facility: s.facility,
      facility_code: s.code,
      populations: s.populations,
      languages: s.language ? asList(value('program.languages')) : [],
      underserved: s.underserved || null,
      source: state.sites.get(s.code)?.from === 'grid' ? 'attachment-a' : 'typed',
    })
  );

  const languages = asList(value('program.languages'));
  const points = pointsFor({ tier: state.tier, sites: siteList(), languages });

  const withheld = state.catalog.fields
    .filter((f) => f.privacy === 'local' && get(f.key))
    .map((f) => f.key);

  const docSummaries = state.draft.documents
    .filter((d) => d.found)
    .map((d) => ({ id: d.id, label: d.short, pages: d.pages.length }));

  return {
    id: `profile-${slug(org.legal_name)}-${today}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'profile',
    schema: 'tpw.profile/1',
    source: 'packet-upload',
    submitted_at: new Date().toISOString(),
    org,
    signatory,
    contacts,
    program,
    sites,
    grant,
    checks: {
      documents: docSummaries.length,
      pages: docSummaries.reduce((n, d) => n + d.pages, 0),
      fein_documents: state.draft.checks.fein?.documents ?? 0,
      fein_consistent: state.draft.checks.fein?.consistent ?? null,
      signed: !!state.draft.checks.signed,
      grid_read: state.draft.checks.grid_readable ?? null,
      grid_disputed: state.draft.checks.grid_disputed || [],
    },
    points: { budget_tier: points.budget_tier, extra: points.extra, total: points.total },
    documents: docSummaries,
    missing: state.draft.documents.filter((d) => !d.found && d.required).map((d) => d.id),
    withheld,
  };
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ file it */
function validate(record) {
  const errors = {};
  if (!record.org?.legal_name) errors['org.legal_name'] = 'The ledger needs a legal name to file this under.';
  if (!record.signatory?.name) errors['signatory.name'] = 'Who signed the packet?';
  if (!record.program?.name) errors['program.name'] = 'The packet describes the program but never names it.';
  if (!record.sites?.length) errors.sites = 'Tick at least one institution: a profile with no site cannot join to anything.';
  return errors;
}

function file() {
  if (state.draft.checks.refused) {
    toast('This upload contains a Social Security number. Nothing is filed from it.', 'bad');
    return;
  }
  const record = assemble();
  const errors = validate(record);
  state.error = errors;
  if (Object.keys(errors).length) {
    render();
    document.querySelector('.conflict, .field')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast('Two or three things are still blank.', 'bad');
    return;
  }

  const label = record.org.legal_name;
  const url = recordIssueUrl(record, state.config, `[intake:profile] ${label} · RIGHT 4.0 packet`);
  if (url.length > 7000) {
    toast('That payload is too large for an issue link — download the file instead.', 'bad');
    return;
  }
  window.open(url, '_blank', 'noopener');
  finish(record, 'issue', url);
}

function download() {
  const record = assemble();
  const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${record.id}.json`;
  a.click();
  finish(record, 'file');
}

async function withToken() {
  const token = prompt(`Fine-grained access token with Contents: write on ${state.config.repo}`);
  if (!token) return;
  const record = assemble();
  try {
    const res = await commitRecord(record, state.config, token.trim());
    finish(record, 'commit', res.url);
  } catch (err) {
    toast(`Could not commit: ${err.message}`, 'bad');
  }
}

function finish(record, channel, url) {
  state.done = { record, channel, url };
  render();
}

/* -------------------------------------------------------------------- done */
function doneScreen() {
  const { record, channel, url } = state.done;
  const line =
    channel === 'issue'
      ? 'A GitHub tab opened with this profile. Submitting the issue is the last step.'
      : channel === 'commit'
      ? 'Committed. The organizations page picks it up on the next rebuild.'
      : 'Downloaded. Send it, or attach it to a pull request.';
  const missing = record.missing?.length
    ? `<p class="help">Still to ask for: ${esc(record.missing.join(', '))}.</p>`
    : '';
  return `
    <div class="done">
      <div class="mark">✓</div>
      <h2>${esc(record.org?.legal_name || 'Filed')}</h2>
      <p>${esc(line)}</p>
      ${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Open it on GitHub →</a></p>` : ''}
      ${missing}
      <p class="help">${record.sites?.length || 0} institution${record.sites?.length === 1 ? '' : 's'},
        ${esc(record.documents?.length || 0)} documents read,
        ${record.withheld?.length ? `${record.withheld.length} facts deliberately left out` : 'nothing withheld'}.</p>
      <button class="primary" data-act="again" type="button">Read another packet</button>
    </div>`;
}

function wireDone() {
  document.querySelector('[data-act="again"]')?.addEventListener('click', () => {
    state.done = null;
    state.draft = null;
    state.files = [];
    state.assignments = {};
    state.overrides = {};
    state.sites = new Map();
    state.tier = null;
    state.error = null;
    render();
  });
}

boot();
