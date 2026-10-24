// Three very small forms. One screen each, no steps, no derived fields.
// Everything else — cycles, join spine, validation rules — stays on the full
// intake; this page exists for the twenty-second version.

import { issueUrl, commitRecord } from './transport.js';

const DATA = new URL('../../data/intake/', import.meta.url);
const QUEUE = 'tpw.simple.queue.v1';

const state = { forms: [], config: {}, facilities: [], orgs: [], committed: [], local: [] };
let kind = 'weekly';
let errors = {};
let done = null;

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
  const [forms, config, facilities, orgs, records] = await Promise.all([
    getJSON('simple_forms.json', { forms: [] }),
    getJSON('config.json', {}),
    getJSON('facilities.json', { facilities: [] }),
    getJSON('orgs/index.json', { orgs: [] }),
    getJSON('records/index.json', { records: [] }),
  ]);

  state.forms = forms.forms || [];
  state.config = config;
  state.facilities = (facilities.facilities || []).map((f) => f.name);
  state.orgs = orgs.orgs || [];
  state.local = loadLocal();

  const names = (records.records || []).map((r) => r.file).filter(Boolean);
  state.committed = (
    await Promise.all(names.map((f) => getJSON(`records/${f}`, null)))
  ).filter(Boolean);

  const visible = state.forms.filter((f) => !f.hidden);
  kind = (location.hash.replace(/^#\/?/, '') || 'weekly').split('/')[0];
  if (!visible.some((f) => f.kind === kind)) kind = visible[0]?.kind || 'weekly';

  window.addEventListener('hashchange', () => {
    kind = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (!state.forms.some((f) => f.kind === kind && !f.hidden)) kind = state.forms.filter((f) => !f.hidden)[0]?.kind;
    done = null;
    errors = {};
    render();
    window.scrollTo({ top: 0 });
  });

  render();
}

const current = () => state.forms.find((f) => f.kind === kind);

/* ----------------------------------------------------------------- render */
function render() {
  const form = current();
  document.getElementById('tabs').innerHTML = state.forms
    .filter((f) => !f.hidden)
    .map((f) => `<a href="#${f.kind}" ${f.kind === kind ? 'aria-current="page"' : ''}>${esc(f.label)}</a>`)
    .join('');

  const app = document.getElementById('app');
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

  app.querySelector('[data-act="download"]')?.addEventListener('click', () => {
    const record = collect(form, el);
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${record.id}.json`;
    a.click();
    remember(record);
    finish(record, 'file');
  });

  app.querySelector('[data-act="token"]')?.addEventListener('click', () => {
    const record = collect(form, el);
    if (!record) return;
    const token = prompt('Fine-grained access token with Contents: write on ' + state.config.repo);
    if (!token) return;
    commitRecord(record, state.config, token.trim())
      .then((res) => {
        remember(record);
        finish(record, 'commit', res.url);
      })
      .catch((err) => toast(`Could not commit: ${err.message}`, 'bad'));
  });

  syncConditional(form);
}

function formScreen(form) {
  return `
    <h1>${esc(form.title)}</h1>
    <p class="lede">${esc(form.blurb)}</p>
    <form novalidate>
      ${form.fields.map((f) => field(f)).join('')}
      <button class="primary" type="submit">${esc(form.submit)}</button>
      <div class="alts">
        <span>No GitHub account?</span>
        <button type="button" data-act="download">Download the file</button>
        <button type="button" data-act="token">Use an access token</button>
      </div>
    </form>
    ${recent(form)}
  `;
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
    if (f.type === 'select') {
    return wrap(`<select id="f-${f.key}" name="${f.key}">
      <option value="">Choose…</option>
      ${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
    </select>`);
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
    const v = values[f.key];
    const box = el.querySelector(`[data-key="${f.key}"]`);
    const input = el.querySelector(`[name="${f.key}"]`);
    box?.querySelector('.err')?.remove();
    input?.classList.remove('invalid');

    if (f.show_if && !Object.entries(f.show_if).every(([k, want]) => values[k] === want)) continue;

    let msg = null;
    if (f.required && !v) msg = `${f.label} is required.`;
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
    if (f.type === 'integer' && values[f.key] !== '') values[f.key] = Number(values[f.key]);
  }

  const stamp = values.week_ending || values.period_end || values.release_date || new Date().toISOString().slice(0, 10);
  const slug = String(values.program || values.org || values.token || 'entry')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const hash = Math.random().toString(36).slice(2, 8);

  return {
    id: `${form.kind}-${slug}-${stamp}-${hash}`,
    kind: form.kind,
    schema: 'tpw.simple/1',
    source: 'quick-form',
    submitted_at: new Date().toISOString(),
    ...values,
  };
}

/* ---------------------------------------------------------------- publish */
function submit(form, el) {
  const record = collect(form, el);
  if (!record) return;

  const label = record.program || record.org || record.token || '';
  const url = issueUrl(record, state.config, `[intake:${form.kind}] ${label} · ${record.week_ending || record.period_end || record.release_date || ''}`);
  if (url.length > 7000) {
    toast('That payload is too large for an issue link — download the file instead.', 'bad');
    return;
  }
  remember(record);
  window.open(url, '_blank', 'noopener');
  finish(record, 'issue', url);
}

function remember(record) {
  state.local.unshift(record);
  saveLocal(state.local);
}

function finish(record, channel, url) {
  done = { record, channel, url };
  render();
}

function doneScreen() {
  const { record, channel, url } = done;
  const form = current();
  const line =
    channel === 'issue'
      ? 'A GitHub tab opened with this entry. Submitting the issue is the last step.'
      : channel === 'commit'
      ? 'Committed to the repository. The ledger picks it up on the next rebuild.'
      : 'Downloaded. Send the file, or attach it to a pull request.';
  return `
    <div class="done">
      <div class="mark">✓</div>
      <h2>${esc(form.doneTitle || 'Logged')}</h2>
      <p>${esc(line)}</p>
      ${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Open it on GitHub →</a></p>` : ''}
      <button class="primary" data-act="again" type="button">Add another</button>
    </div>`;
}

/* ----------------------------------------------------------------- recent */
function recent(form) {
  const rows = [...state.local, ...state.committed]
    .filter((r) => r.kind === form.kind)
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')))
    .slice(0, 5);

  if (!rows.length) {
    return `<div class="recent"><h2>Recent</h2><div class="empty">Nothing yet. The first entry takes about twenty seconds.</div></div>`;
  }
  return `
    <div class="recent">
      <h2>Recent</h2>
      <ul>
        ${rows
          .map((r) => {
            const when = r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
            const bits =
              form.kind === 'weekly'
                ? `${esc(r.program || '—')} · ${r.sessions ?? '—'} sessions · ${r.attendance ?? '—'} people`
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
