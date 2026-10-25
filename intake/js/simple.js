// Three very small forms. One screen each, no steps, no derived fields.
// Everything else — cycles, join spine, validation rules — stays on the full
// intake; this page exists for the twenty-second version.

import { submitRecord } from './sheets.js';

const DATA = new URL('../../data/intake/', import.meta.url);
// Keep confirmed Sheet receipts separate from the old GitHub queue.
const QUEUE = 'tpw.simple.sheets.v1';

const state = { forms: [], facilities: [], orgs: [], local: [] };
let kind = 'session';
let errors = {};
let done = null;
let multi = []; // facilities chosen in the current form
const pendingRecords = new Map(); // retain identity through edits after an ambiguous save

/* ------------------------------------------------------------------ utils */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function toast(message, tone = '') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function getJSON(path, fallback) {
  try {
    const res = await fetch(new URL(path, DATA), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

const loadLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) || '[]');
  } catch {
    return [];
  }
};
const saveLocal = (rows) => {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(rows.slice(0, 60)));
  } catch {}
};

/* ------------------------------------------------------------------- boot */
async function boot() {
  const [forms, facilities, orgs] = await Promise.all([
    getJSON('simple_forms.json', { forms: [] }),
    getJSON('facilities.json', { facilities: [] }),
    getJSON('orgs/index.json', { orgs: [] }),
  ]);

  state.forms = forms.forms || [];
  state.facilities = (facilities.facilities || []).map((f) => f.name);
  state.orgs = orgs.orgs || [];
  state.local = loadLocal();

  const visible = state.forms.filter((f) => !f.hidden);
  kind = (location.hash.replace(/^#\/?/, '') || DEMO_KIND).split('/')[0];
  if (kind !== DEMO_KIND && !visible.some((f) => f.kind === kind)) kind = visible[0]?.kind || 'session';

  window.addEventListener('hashchange', () => {
    kind = location.hash.replace(/^#\/?/, '').split('/')[0] || DEMO_KIND;
    if (kind !== DEMO_KIND && !state.forms.some((f) => f.kind === kind && !f.hidden))
      kind = state.forms.filter((f) => !f.hidden)[0]?.kind;
    done = null;
    errors = {};
    multi = [];
    render();
    window.scrollTo({ top: 0 });
  });

  render();
}

const current = () => state.forms.find((f) => f.kind === kind);

/* ----------------------------------------------------------------- tabs */
/**
 * Session and the guided form append to separate tabs in the same master
 * Google Sheet. The older Quarter form stays in the contract at
 * #aggregate, but is not offered in the tab row.
 */
const DEMO_KIND = 'demo';

function tabs() {
  const out = state.forms
    .filter((f) => !f.hidden && f.tab !== false)
    .map((f) => ({ kind: f.kind, label: f.label }));
  return [{ kind: DEMO_KIND, label: 'Quarterly totals' }, ...out];
}

/* ----------------------------------------------------------------- render */
/** The bar at the top says where a filing goes, so it has to match the tab. */
function note(text) {
  const el = document.getElementById('bar-note');
  if (el) el.textContent = text;
}

function render() {
  const form = current();
  document.getElementById('tabs').innerHTML = tabs()
    .map((t) => `<a href="#${t.kind}" ${t.kind === kind ? 'aria-current="page"' : ''}>${esc(t.label)}</a>`)
    .join('');

  const app = document.getElementById('app');
  if (kind === DEMO_KIND) {
    note(
      'Demo build: guided submissions append to TPW’s Google Sheet, not CDCR. Sign-in is not enabled yet; use synthetic test data only.'
    );
    app.innerHTML = demoPanel();
    window.scrollTo({ top: 0 });
    return;
  }
  note(
    'Demo build: entries append to TPW’s Google Sheet, not CDCR. Sign-in is not enabled yet; use synthetic test data only.'
  );
  app.innerHTML = done ? doneScreen() : formScreen(form);

  if (done) {
    app.querySelector('[data-act="again"]')?.addEventListener('click', () => {
      done = null;
      render();
    });
    return;
  }

  const el = app.querySelector('form');
  el.addEventListener('input', (e) => {
    const f = form.fields.find((x) => x.key === e.target.name);
    if (f) {
      if (errors[f.key]) {
        delete errors[f.key];
        e.target.classList.remove('invalid');
        e.target.parentElement.querySelector('.err')?.remove();
      }
      if (f.key === 'status') syncConditional(form);
    }
  });

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(form, el);
  });

  const facInput = app.querySelector('[data-act="add-facility"]');
  if (facInput) {
    const add = () => {
      const input = app.querySelector('[data-key="facilities"] input');
      const value = (input?.value || '').trim();
      if (!value) return;
      const match = state.facilities.find((n) => n.toLowerCase() === value.toLowerCase());
      if (!match) {
        toast('Pick a facility from the list.', 'bad');
        return;
      }
      if (!multi.includes(match)) multi.push(match);
      input.value = '';
      input.focus();
      paintPicked();
    };
    app.querySelector('[data-act="add-facility"]').addEventListener('click', add);
    app.querySelector('[data-key="facilities"] input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    paintPicked();
  }

  app.querySelector('[data-act="download"]')?.addEventListener('click', () => {
    const record = collect(form, el);
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${record.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Local JSON backup downloaded. This entry has not been filed.');
  });

  syncConditional(form);
}

/** The quarterly form stays embedded and resizes with each step.
 * Its own header/footer are hidden; the parent page provides navigation.
 */
function demoPanel() {
  return `
    <div class="demo-panel">
      <iframe src="../form-demo/?embed=1" title="Quarterly totals form" loading="lazy"></iframe>
    </div>`;
}

function formScreen(form) {
  return `
    <h1>${esc(form.title)}</h1>
    <p class="lede">${esc(form.blurb)}</p>
    ${rollsInto()}
    ${waysIn(form)}
    <form novalidate>
      ${form.fields
        .filter((f) => !f.hidden)
        .map((f) => field(f))
        .join('')}
      <button class="primary" type="submit">${esc(form.submit)}</button>
      <div class="alts">
        <span>No account needed for this demo.</span>
        <button type="button" data-act="download">Download a local backup</button>
      </div>
      <p class="help" id="save-status" role="status" aria-live="polite"></p>
    </form>
    ${footnote(form)}
    ${recent(form)}
  `;
}

/** The paper routes into the same record. Quiet, and under the heading it belongs to. */
function waysIn(form) {
  if (form.kind !== 'session') return '';
  return `
    <div class="ways">
      <span>Paper instead</span>
      <a href="sheet.html">Print a blank sheet</a>
      <a href="scan.html">Scan a filled one</a>
      <a href="upload.html">Read your packet</a>
    </div>`;
}

/** The one thing that is not a quarterly filing, kept out of the tabs. */
function footnote(form) {
  if (form.kind === 'followup') return '';
  return `<p class="footnote">Heard what happened after someone was released?
    <a href="#followup">Record an outcome →</a></p>`;
}

function field(f) {
  const req = f.required ? '' : '<span class="opt">optional</span>';
  const label = `<label for="f-${f.key}">${esc(f.label)}${req}</label>`;
  const err = errors[f.key] ? `<p class="err">${esc(errors[f.key])}</p>` : '';
  const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
  const wrap = (inner) => `<div class="field ${f.half ? 'half' : ''}" data-key="${f.key}">${label}${inner}${help}${err}</div>`;

  if (f.type === 'textarea') {
    return wrap(
      `<textarea id="f-${f.key}" name="${f.key}" placeholder="${esc(f.placeholder || '')}" maxlength="${f.max || 2000}"></textarea>`
    );
  }
  if (f.type === 'facility') {
    return wrap(`
      <input id="f-${f.key}" name="${f.key}" type="text" list="facilities" autocomplete="off"
        placeholder="Start typing a facility" value="${esc(errors[`_v_${f.key}`] || '')}">
      <datalist id="facilities">${state.facilities.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`);
  }
  if (f.type === 'select') {
    return wrap(`<select id="f-${f.key}" name="${f.key}">
      <option value="">Choose…</option>
      ${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
    </select>`);
  }
  if (f.type === 'facilities') {
    return `<div class="field" data-key="${f.key}">
      ${label}
      <div class="multi">
        <input id="f-${f.key}" name="${f.key}" type="text" list="facilities" autocomplete="off"
          placeholder="Start typing a facility, then press Enter">
        <button type="button" class="addbtn" data-act="add-facility">Add</button>
      </div>
      <datalist id="facilities">${state.facilities.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="picked" id="picked"></div>
      ${help}${err}
    </div>`;
  }
  if (f.type === 'counts') {
    // Folded away so the twenty-second path stays twenty seconds. Opened when it
    // holds an error, or the error would be invisible.
    return `<details class="group"${errors[f.key] ? ' open' : ''}>
      <summary>${esc(f.label)}<span class="opt">optional</span></summary>
      ${help}
      <div class="groupgrid">
        ${f.items
          .map(
            (it) => `<div class="field half">
              <label for="f-${it.key}">${esc(it.label)}</label>
              <input id="f-${it.key}" name="${it.key}" type="number" inputmode="numeric" min="0" step="1" placeholder="—">
            </div>`
          )
          .join('')}
      </div>
      ${err}
    </details>`;
  }
  if (f.type === 'choice') {
    return `<div class="field" data-key="${f.key}">
      ${label}
      <div class="choices" role="radiogroup" aria-label="${esc(f.label)}">
        ${f.options
          .map(
            (o, i) => `<label><input type="radio" name="${f.key}" value="${esc(o.value)}" id="f-${f.key}-${i}">
              ${esc(o.label)}</label>`
          )
          .join('')}
      </div>
      ${help}${err}
    </div>`;
  }

  const inputType = f.type === 'date' ? 'date' : f.type === 'integer' ? 'number' : 'text';
  const list = f.datalist ? ` list="${f.datalist}"` : '';
  const extra = f.type === 'integer' ? ' inputmode="numeric" min="0" step="1"' : '';
  return wrap(`
    <input id="f-${f.key}" name="${f.key}" type="${inputType}"${list}${extra}
      placeholder="${esc(f.placeholder || '')}" autocomplete="off"
      ${f.max && f.type !== 'integer' ? `maxlength="${f.max}"` : ''}>
    ${datalist(f.datalist)}`);
}

function datalist(name) {
  if (!name) return '';
  if (name === 'orgs') {
    return `<datalist id="orgs">${state.orgs.map((o) => `<option value="${esc(o.org)}">`).join('')}</datalist>`;
  }
  const programs = [...new Set(state.orgs.flatMap((o) => (o.programs || []).map((p) => p.name)))];
  return `<datalist id="programs">${programs.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;
}

function paintPicked() {
  const host = document.getElementById('picked');
  if (!host) return;
  host.innerHTML = multi
    .map(
      (f, i) => `<span class="pickedchip">${esc(f)}<button type="button" data-drop="${i}" aria-label="Remove">×</button></span>`
    )
    .join('');
  host.querySelectorAll('[data-drop]').forEach((b) => {
    b.addEventListener('click', () => {
      multi.splice(Number(b.dataset.drop), 1);
      paintPicked();
    });
  });
}

function syncConditional(form) {
  const status = document.querySelector('input[name="status"]:checked')?.value;
  for (const f of form.fields) {
    if (!f.show_if) continue;
    const show = Object.entries(f.show_if).every(([k, v]) => (k === 'status' ? status === v : true));
    const box = document.querySelector(`[data-key="${f.key}"]`);
    if (box) box.style.display = show ? '' : 'none';
  }
}

/* --------------------------------------------------------------- validate */
function collect(form, el) {
  errors = {};
  const values = {};

  for (const f of form.fields) {
    if (f.hidden) continue;
    if (f.type === 'counts') {
      // Flattened: one integer per bucket, so the record stays a flat row.
      for (const item of f.items || []) {
        const raw = (el.querySelector(`[name="${item.key}"]`)?.value || '').trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || (f.max != null && n > f.max)) {
          errors[f.key] = `${item.label} must be a whole number between 0 and ${f.max}.`;
          break;
        }
        values[item.key] = n;
      }
      continue;
    }
    if (f.type === 'facilities') {
      values[f.key] = [...multi];
      continue;
    }
    if (f.type === 'choice') {
      const picked = el.querySelector(`input[name="${f.key}"]:checked`);
      values[f.key] = picked ? picked.value : '';
    } else {
      const input = el.querySelector(`[name="${f.key}"]`);
      let v = (input?.value || '').trim();
      if (f.type === 'token') v = v.toLowerCase();
      values[f.key] = v;
    }
  }

  for (const f of form.fields) {
    if (f.hidden) continue;
    const v = values[f.key];
    const box = el.querySelector(`[data-key="${f.key}"]`);
    const input = el.querySelector(`[name="${f.key}"]`);
    box?.querySelector('.err')?.remove();
    input?.classList.remove('invalid');

    if (f.show_if && !Object.entries(f.show_if).every(([k, want]) => values[k] === want)) continue;

    if (f.type === 'counts') {
      if (errors[f.key]) {
        const p = document.createElement('p');
        p.className = 'err';
        p.textContent = errors[f.key];
        box?.appendChild(p);
      }
      continue;
    }

    let msg = null;
    if (f.required && (!v || (Array.isArray(v) && v.length === 0))) msg = `${f.label} is required.`;
    else if (Array.isArray(v)) { /* list fields validated above */ }
    else if (v && f.type === 'integer') {
      const n = Number(v);
      if (!Number.isInteger(n)) msg = `${f.label} must be a whole number.`;
      else if (f.min != null && n < f.min) msg = `${f.label} must be at least ${f.min}.`;
      else if (f.max != null && n > f.max) msg = `${f.label} must be at most ${f.max}.`;
    } else if (v && f.type === 'token' && !/^[0-9a-f]{32}$/.test(v)) {
      msg = 'A token is 32 characters, 0-9 and a-f.';
    } else if (v && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      msg = `${f.label} needs a date.`;
    } else if (v && f.type === 'select' && !f.options.includes(v)) {
      msg = `Choose a ${f.label.toLowerCase()}.`;
    }

    if (msg) {
      errors[f.key] = msg;
      input?.classList.add('invalid');
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = msg;
      box?.appendChild(p);
    }
  }

  if (Object.keys(errors).length) {
    const first = el.querySelector('.field .err');
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return null;
  }

  for (const f of form.fields) {
    if (f.hidden) continue;
    if (f.show_if && !Object.entries(f.show_if).every(([key, want]) => values[key] === want)) {
      delete values[f.key];
      continue;
    }
    if (f.type === 'integer' && values[f.key] !== '') values[f.key] = Number(values[f.key]);
  }

  const stamp = values.session_date || values.quarter || values.release_date || new Date().toISOString().slice(0, 10);
  const slug = String(values.program || values.org || values.token || 'entry')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const hash = Math.random().toString(36).slice(2, 8);
  const stampSlug = String(stamp).toLowerCase().replace(/[^a-z0-9-]+/g, '');

  return {
    id: `${form.kind}-${slug}-${stampSlug}-${hash}`,
    kind: form.kind,
    schema: 'tpw.simple/1',
    source: 'quick-form',
    submitted_at: new Date().toISOString(),
    ...values,
  };
}

/* ---------------------------------------------------------------- publish */
async function submit(form, el) {
  if (el.dataset.saving) return;
  const record = collect(form, el);
  if (!record) return;
  const pending = pendingRecords.get(form.kind);
  if (pending) {
    record.id = pending.id;
    record.submitted_at = pending.submitted_at;
  }
  pendingRecords.set(form.kind, record);
  el.dataset.saving = 'true';
  const controls = [...el.querySelectorAll('input, select, textarea, button')];
  controls.forEach((control) => { control.disabled = true; });
  const button = el.querySelector('[type="submit"]');
  const label = button.textContent;
  button.textContent = 'Saving to Google Sheets…';
  const status = el.querySelector('#save-status');
  status.textContent = 'Saving to Google Sheets…';
  try {
    const receipt = await submitRecord(record);
    pendingRecords.delete(form.kind);
    remember({ ...record, receipt });
    finish(record, receipt);
  } catch (error) {
    status.textContent = `Save not confirmed: ${error.message} Your answers are still here.`;
    toast(status.textContent, 'bad');
  } finally {
    delete el.dataset.saving;
    controls.forEach((control) => { control.disabled = false; });
    button.textContent = label;
  }
}

function remember(record) {
  state.local.unshift(record);
  saveLocal(state.local);
}

function finish(record, receipt) {
  done = { record, receipt };
  render();
}

function doneScreen() {
  const { receipt } = done;
  return `
    <div class="done">
      <div class="mark">✓</div>
      <h2>Saved to Google Sheets</h2>
      <p>Sheet tab: ${esc(receipt.tab)}<br>Receipt: ${esc(receipt.submissionId)}<br>Record: ${esc(receipt.recordId)}</p>
      <button class="primary" data-act="again" type="button">Add another</button>
    </div>
    ${rollsIntoDone()}`;
}

/** What a filing is for. Quiet, once, under the form — not a pitch. */
function rollsInto() {
  return `<p class="rolls">This entry is saved to TPW’s master Google Sheet for reporting.
    It is not a submission to CDCR.</p>`;
}

function rollsIntoDone() {
  return `<p class="rolls">Saved to the intake sheet. This does not yet update the
    <a href="../index.html#report">report</a> or the historical rollup automatically.</p>`;
}

/* ----------------------------------------------------------------- recent */
function recent(form) {
  const rows = state.local
    .filter((r) => r.kind === form.kind)
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
    .slice(0, 5);

  if (!rows.length) {
    return `<div class="recent"><h2>Saved from this browser</h2><div class="empty">Nothing yet. The first entry takes about twenty seconds.</div></div>`;
  }
  return `
    <div class="recent">
      <h2>Saved from this browser</h2>
      <ul>
        ${rows
          .map((r) => {
            const when = r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
            const bits =
              form.kind === 'session'
                ? `${esc(r.program || '—')} · ${esc(r.facility || '—')} · ${r.present_count ?? '—'} present`
                : form.kind === 'aggregate'
                ? `${esc(r.program || '—')} · ${esc(r.quarter || '—')} · ${r.served ?? '—'} served`
                : `${esc((r.token || '').slice(0, 8))}… · ${esc(String(r.status || '').replace(/_/g, ' '))}`;
            return `<li><span>${bits}</span><span class="when">${esc(when)}</span></li>`;
          })
          .join('')}
      </ul>
    </div>`;
}

boot();
