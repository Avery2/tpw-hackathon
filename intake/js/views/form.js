// The intake form. Five steps, schema-driven, autosaving to this device, and
// publishing to git through one of three channels. Nothing is sent anywhere
// until the submitter chooses a channel.

import { esc, num, pct, shortDate, toast, delegate, modal, download, copy, bindFresh } from '../ui.js';
import * as S from '../schema.js';
import { store, enqueue, allCycles } from '../store.js';
import * as T from '../transport.js';

let draft = null;
let step = 0;
let done = null; // {cycle, meta}
let ctx = null;
let errorsBy = {};
const touched = new Set();

// The registry's handoff, when the submitter arrived from an organization
// profile. `values` is what the ledger already knows; `orgId` is who they asked
// to file for, which may differ from the draft already open here.
let handoff = null;
let prefilled = null; // organization name the open draft was seeded from

const STEPS = [
  { id: 'program', title: 'Program', hint: 'Which run of which program, and where.', fields: ['org', 'program', 'facility', 'yard', 'status'] },
  { id: 'dates', title: 'Dates', hint: 'When it started and finished.', fields: ['start_date', 'end_date'] },
  { id: 'numbers', title: 'Numbers', hint: 'Hours and people. This is what becomes impact.', fields: ['course_hours', 'participants_started', 'participants_completed'] },
  { id: 'join', title: 'Join spine', hint: 'Optional but decisive: the key that lets this cycle meet outcome data.', fields: [] },
  { id: 'review', title: 'Review & publish', hint: 'Check it, sign it, send it to the ledger.', fields: ['submitter_name', 'submitter_email'] },
];

export function render(root, context) {
  ctx = context;

  const want = handoffValues(context.params);
  handoff = want;

  if (!draft) {
    const saved = store.draft;
    if (saved) {
      draft = saved;
    } else {
      draft = S.blankCycle(want?.values || {});
      prefilled = want?.values.org || null;
    }
  }

  done = null;
  step = 0;
  paint(root);
}

/** `#/submit?org=…&program=…&site=…` -> the values that page already holds. */
function handoffValues(params) {
  const orgId = params?.get('org');
  if (!orgId) return null;
  const values = S.prefillFrom(orgId, params.get('program'), params.get('site'));
  return Object.keys(values).length ? { values, orgId } : null;
}

/* ------------------------------------------------------------------ paint */

function paint(root) {
  if (done) return paintDone(root);

  const all = allCycles(ctx.state);
  const { errors, warnings } = S.validate(draft, { all });
  errorsBy = {};
  for (const e of errors) (errorsBy[e.key] ||= []).push(e.msg);

  const cur = STEPS[step];
  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Collective Impact intake</p>
        <h1>Report a program cycle</h1>
        <p>One run of one program, at one facility, one yard. The form enforces the June 2026
           glossary, computes the sheet's formula columns, and records what the sheet never
           asked for: a participant key that can be joined to outcome records.</p>
      </div>
      <div style="text-align:right">
        <span class="savebit" id="savebit">${draft.org ? 'Draft saved on this device' : 'Nothing saved yet'}</span>
      </div>
    </div>

    ${handoffBanner()}

    <div class="wizard">
      <div class="steps" role="tablist">
        ${STEPS.map(
          (s, i) => `
          <button data-step="${i}" ${i === step ? 'aria-current="step"' : ''} class="${i < step ? 'done' : ''}">
            <span class="n">${i < step ? '✓' : String(i + 1).padStart(2, '0')}</span>
            <span class="t">${s.title}</span>
          </button>`
        ).join('')}
      </div>

      <div class="step-panel">
        <h2>${cur.title}</h2>
        <p class="sub">${cur.hint}</p>
        <div id="step-body">${stepBody()}</div>
        ${step === 4 ? '' : wizardFoot(errors, warnings)}
      </div>
    </div>`;

  bind(root);
  refreshDerived();
}

/**
 * Shown only when there is a conflict: an unfinished draft is open, and the
 * registry just handed us a different organization. The draft is never thrown
 * away to satisfy a URL — somebody decided to make that choice explicitly.
 */
function handoffBanner() {
  if (!handoff) return '';
  const target = handoff.values.org;
  if (!target || target === draft.org) return '';

  const open = draft.org
    ? `an unfinished draft for <strong>${esc(draft.org)}</strong>`
    : 'an unfinished draft';

  return `
    <div class="handoff">
      <div>
        <strong>You have ${open}.</strong>
        <p class="hint">Start a new cycle for ${esc(target)} instead, with the details already on file?</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small" data-act="discard-handoff">Keep the draft</button>
        <button class="btn small primary" data-act="apply-handoff">Start for ${esc(target)}</button>
      </div>
    </div>`;
}

/** Where the visible values came from, said plainly, on the step that shows them. */
function prefillNote() {
  if (!prefilled) return '';
  return `
    <div class="prefilled">
      <span class="tag good">on file</span>
      <span>Filled from <a href="#/orgs">${esc(prefilled)}</a>'s profile — organization, program,
        facility and contact come from cycles already reported. Change anything that differs; this
        is still a new record.</span>
    </div>`;
}

function wizardFoot(errors) {
  const stepKeys = new Set(STEPS[step].fields);
  const here = errors.filter((e) => stepKeys.has(e.key));
  return `
    <div class="wizard-foot">
      <div class="savebit">
        ${
          here.length
            ? `<span class="err" style="margin:0">${here.length} field${here.length > 1 ? 's' : ''} to fix</span>`
            : errors.length
            ? `<span class="savebit">${errors.length} issue${errors.length > 1 ? 's' : ''} left before publishing</span>`
            : '<span class="savebit">Ready to publish</span>'
        }
      </div>
      <div class="right">
        ${step > 0 ? '<button class="btn" data-act="back">Back</button>' : ''}
        ${step < 4 ? '<button class="btn primary" data-act="next">Continue</button>' : ''}
      </div>
    </div>`;
}

function stepBody() {
  const id = STEPS[step].id;
  if (id === 'program') return stepProgram();
  if (id === 'dates') return stepDates();
  if (id === 'numbers') return stepNumbers();
  if (id === 'join') return stepJoin();
  return stepReview();
}

/* --------------------------------------------------------------- controls */

function field(f, extra = '') {
  const v = draft[f.key] ?? '';
  const req = S.isRequired(f, draft);
  const bad = touched.has(f.key) && errorsBy[f.key];
  const label = `<label for="f-${f.key}">${esc(f.label)}${
    f.column ? `<span class="col">${esc(f.column)}</span>` : ''
  }${req ? '<span class="req">*</span>' : ''}</label>`;

  let control = '';
  if (f.type === 'textarea') {
    control = `<textarea id="f-${f.key}" data-k="${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  } else if (f.type === 'select' && f.source === 'facilities') {
    control = `<input id="f-${f.key}" data-k="${f.key}" type="text" list="facilities-list"
      value="${esc(v)}" placeholder="Start typing a facility name" autocomplete="off">
      <datalist id="facilities-list">
        ${S.state.facilities.map((x) => `<option value="${esc(x.name)}">${esc(x.code)}</option>`).join('')}
      </datalist>`;
  } else if (f.type === 'select') {
    control = `<select id="f-${f.key}" data-k="${f.key}">
      ${(f.options || [])
        .map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`)
        .join('')}
    </select>`;
  } else if (f.type === 'date') {
    control = `<input id="f-${f.key}" data-k="${f.key}" type="date" value="${esc(v)}">`;
  } else if (f.type === 'number' || f.type === 'integer') {
    control = `<input id="f-${f.key}" data-k="${f.key}" type="number" inputmode="numeric"
      value="${v === '' ? '' : esc(v)}" placeholder="${esc(f.placeholder || '')}"
      ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}
      ${f.step ? `step="${f.step}"` : 'step="1"'}>`;
  } else {
    control = `<input id="f-${f.key}" data-k="${f.key}" type="${f.type === 'email' ? 'email' : 'text'}"
      value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" autocomplete="${f.type === 'email' ? 'email' : 'off'}">`;
  }

  return `<div class="field" data-field="${f.key}">
    ${label}${control}
    ${f.help ? `<p class="hint">${esc(f.help)}</p>` : ''}
    ${bad ? `<p class="err">${esc(errorsBy[f.key][0])}</p>` : ''}
    ${extra}
  </div>`;
}

function stepProgram() {
  const code = S.facilityCode(draft.facility);
  const f = (k) => S.fieldByKey(k);
  return `
    ${prefillNote()}
    <div class="row2">
      ${field(f('org'))}
      ${field(f('program'))}
    </div>
    ${field(f('facility'), code ? `<p class="hint mono" style="color:var(--accent)">${esc(code)}</p>` : '')}
    ${field(f('yard'))}
    <div class="field">
      <label>${esc(f('status').label)}<span class="col">E</span><span class="req">*</span></label>
      <div class="seg" data-seg="status">
        ${S.state.schema.statuses
          .map((s) => `<button data-status="${esc(s)}" aria-pressed="${draft.status === s}">${esc(s)}</button>`)
          .join('')}
      </div>
      <p class="hint">${esc(f('status').help)}</p>
    </div>`;
}

function stepDates() {
  const d = S.derive(draft);
  const f = (k) => S.fieldByKey(k);
  return `
    <div class="row2">
      ${field(f('start_date'))}
      ${field(f('end_date'))}
    </div>
    <div class="derived">
      <div><dt>Cycle length</dt><dd>${d.duration_days == null ? '—' : num(d.duration_days)}<span>days</span></dd></div>
      <div><dt>Program year</dt><dd>${d.program_year ?? '—'}</dd></div>
    </div>
    <details class="why">
      <summary>Only know the month? Here is the convention.</summary>
      <p>The glossary is explicit: use the first of the month when you know the approximate start,
        and the last day of the month for the end. Dates are what allocate hours to a reporting year
        and what later align a cycle with facility and outcome records — so a deliberate approximation
        beats a blank.</p>
    </details>`;
}

function stepNumbers() {
  const f = (k) => S.fieldByKey(k);
  return `
    ${field(f('course_hours'))}
    <div class="row2">
      ${field(f('participants_started'))}
      ${field(f('participants_completed'))}
    </div>
    <div class="row2">
      ${field(f('funded_by'))}
    </div>
    ${field(f('notes'))}
    <div class="derived" id="derived"></div>`;
}

function stepJoin() {
  const j = S.state.schema.join;
  const tokens = draft.join?.tokens || [];
  const secret = store.secret;
  return `
    <p class="privacy"><b>Identifiers stay in this tab.</b> The key below never leaves your
      browser and is never written to the ledger. Only the derived tokens are submitted.</p>

    <details class="why" open>
      <summary>Why this step exists</summary>
      <p>${esc(j.why)}</p>
      <p><b>Method.</b> ${esc(j.method)}</p>
    </details>

    <div class="joinbox">
      <div>
        <div class="field">
          <label for="org-secret">Organization key</label>
          <input id="org-secret" type="password" value="${esc(secret)}" placeholder="Any long phrase only you know" autocomplete="off">
          <label class="check" style="margin-top:10px">
            <input type="checkbox" id="remember-secret" ${secret ? 'checked' : ''}>
            <span>Keep the key on this device so next quarter's cycles match this one</span>
          </label>
          <p class="hint">Same key + same CDCR number = same token, every cycle, forever. Lose the
            key and past tokens still join, but new ones will not match old ones.</p>
        </div>
      </div>
      <div>
        <div class="field">
          <label for="spinelines">Participants</label>
          <textarea id="spinelines" placeholder="A12345,completed&#10;A12346,completed&#10;A12347,did_not_complete">${esc(
            joinInput
          )}</textarea>
          <p class="hint">One per line. <code>A12345,completed</code> or <code>A12345,did_not_complete</code>.
            A 32-character token alone is accepted too, for organizations already hashing on their side.</p>
          <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">
            <button class="btn small" data-act="generate">Derive tokens</button>
            <button class="btn small ghost" data-act="example">Fill an example</button>
            ${tokens.length ? '<button class="btn small ghost" data-act="clear-tokens">Clear</button>' : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="derived">
      <div><dt>Tokens attached</dt><dd id="tok-count">${num(tokens.length)}</dd></div>
      <div><dt>Completers</dt><dd>${num(draft.participants_completed)}</dd></div>
      <div><dt>Coverage</dt><dd id="tok-cover">${
        draft.participants_completed ? pct(tokens.length / Number(draft.participants_completed)) : '—'
      }</dd></div>
    </div>

    ${tokens.length ? `<pre class="tokenlist" id="tokenlist">${esc(previewTokens(tokens))}</pre>` : ''}

    <label class="check" style="margin-top:18px">
      <input type="checkbox" id="pii-attest" ${draft.join?.attested ? 'checked' : ''}>
      <span>I confirm these tokens were derived on my device and contain no name, CDCR number,
        date of birth, or other direct identifier.</span>
    </label>`;
}

function previewTokens(tokens) {
  const head = tokens.slice(0, 12).map((t) => `${t.token}  ${t.event}`);
  return head.join('\n') + (tokens.length > 12 ? `\n… ${tokens.length - 12} more` : '');
}

/* ----------------------------------------------------------------- state */

let joinInput = '';

function bind(root) {
  const view = root;
  const signal = bindFresh(view);

  delegate(view, 'click', '[data-step]', (e, el) => {
    step = Number(el.dataset.step);
    paint(view);
  }, signal);

  delegate(view, 'click', '[data-act="next"]', () => {
    markTouched(STEPS[step]);
    if (step < 4) {
      step += 1;
      paint(view);
      view.scrollIntoView({ block: 'start' });
    }
  }, signal);

  delegate(view, 'click', '[data-act="back"]', () => {
    if (step > 0) {
      step -= 1;
      paint(view);
    }
  }, signal);

  delegate(view, 'click', '[data-status]', (e, el) => {
    draft.status = el.dataset.status;
    save();
    paint(view);
  }, signal);

  view.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.k) {
      draft[el.dataset.k] = el.value;
      touched.add(el.dataset.k);
      save();
      refreshDerived();
      refreshReadiness();
      const wrap = el.closest('.field');
      const { errors } = S.validate(draft, { all: allCycles(ctx.state) });
      const mine = errors.find((x) => x.key === el.dataset.k);
      el.classList.toggle('invalid', !!mine && touched.has(el.dataset.k));
      let node = wrap.querySelector('.err');
      if (mine && touched.has(el.dataset.k)) {
        if (!node) {
          node = document.createElement('p');
          node.className = 'err';
          wrap.appendChild(node);
        }
        node.textContent = mine.msg;
      } else if (node) node.remove();
    }
    if (el.id === 'spinelines') joinInput = el.value;
    if (el.id === 'org-secret') store.secret = el.value;
    if (el.id === 'pii-attest') {
      draft.join = { ...(draft.join || {}), attested: el.checked };
      save();
    }
  }, { signal });

  delegate(view, 'change', '#remember-secret', (e, el) => {
    if (!el.checked) store.secret = '';
  }, signal);

  delegate(view, 'click', '[data-act="generate"]', async () => {
    try {
      await deriveTokens();
      paint(view);
      toast(`${draft.join.tokens.length} tokens attached`, 'good');
    } catch (err) {
      toast(err.message, 'bad');
    }
  }, signal);

  delegate(view, 'click', '[data-act="example"]', () => {
    joinInput = ['A1029384,completed', 'A1029385,completed', 'A1029386,completed', 'A1029387,did_not_complete'].join('\n');
    paint(view);
  }, signal);

  delegate(view, 'click', '[data-act="clear-tokens"]', () => {
    draft.join.tokens = [];
    joinInput = '';
    save();
    paint(view);
  }, signal);

  // ---- publish channels ---------------------------------------------------
  delegate(view, 'click', '[data-act="issue"]', async () => {
    const cycle = await finalize();
    if (!cycle) return;
    const url = T.issueUrl(cycle, S.state.config);
    if (url.length > 7500) {
      toast('This spine is large enough that the issue body may be truncated by the browser. Use the token or file route instead.', 'bad');
      return;
    }
    enqueue(cycle, { channel: 'issue', url });
    window.open(url, '_blank', 'noopener');
    finish(cycle, { channel: 'issue', url });
  }, signal);

  delegate(view, 'click', '[data-act="token"]', async () => {
    const cycle = await finalize();
    if (!cycle) return;
    openTokenModal(cycle);
  }, signal);

  delegate(view, 'click', '[data-act="export"]', async () => {
    const cycle = await finalize();
    if (!cycle) return;
    download(`${cycle.id}.json`, JSON.stringify(cycle, null, 2) + '\n');
    enqueue(cycle, { channel: 'file' });
    finish(cycle, { channel: 'file' });
  }, signal);

  delegate(view, 'click', '[data-act="local"]', async () => {
    const cycle = await finalize();
    if (!cycle) return;
    enqueue(cycle, { channel: 'local' });
    toast('Saved to this device. It is in the ledger but not yet in git.', 'good');
    finish(cycle, { channel: 'local' });
  }, signal);

  delegate(view, 'click', '[data-act="apply-handoff"]', () => {
    draft = S.blankCycle(handoff.values);
    store.draft = draft;
    prefilled = draft.org || null;
    handoff = null;
    done = null;
    step = 0;
    paint(root);
    toast(`New cycle for ${draft.org} — details on file filled in`, 'good');
  }, signal);

  delegate(view, 'click', '[data-act="discard-handoff"]', () => {
    handoff = null;
    paint(root);
  }, signal);

  delegate(view, 'click', '[data-act="another"]', () => {
    // The next cycle from this organization repeats most of this one. Keeping
    // the identity is the whole point; the dates and numbers are what is new.
    draft = S.blankCycle(S.carryOver(draft));
    store.draft = draft;
    prefilled = draft.org || null;
    handoff = null;
    done = null;
    step = 0;
    paint(root);
  }, signal);

  delegate(view, 'click', '[data-act="copy-json"]', async () => {
    const cycle = await finalize();
    if (cycle) copy(JSON.stringify(cycle, null, 2), 'Cycle JSON copied');
  }, signal);
}

function markTouched(stepDef) {
  for (const k of stepDef.fields) if (draft[k]) touched.add(k);
}

function save() {
  store.draft = draft;
  const bit = document.getElementById('savebit');
  if (bit) bit.textContent = 'Draft saved on this device';
}

function refreshDerived() {
  const d = S.derive(draft);
  const host = document.getElementById('derived');
  if (host) {
    host.innerHTML = `
      <div><dt>Total participant hours</dt><dd>${d.total_participant_hours == null ? '—' : num(d.total_participant_hours)}<span>hrs</span></dd></div>
      <div><dt>Completion rate</dt><dd>${d.completion_rate == null ? '—' : pct(d.completion_rate)}</dd></div>
      <div><dt>Program year</dt><dd>${d.program_year ?? '—'}</dd></div>
      <div><dt>Cycle length</dt><dd>${d.duration_days == null ? '—' : num(d.duration_days)}<span>days</span></dd></div>`;
  }
  const cover = document.getElementById('tok-cover');
  if (cover) {
    const n = (draft.join?.tokens || []).length;
    cover.textContent = draft.participants_completed ? pct(n / Number(draft.participants_completed)) : '—';
  }
  const cnt = document.getElementById('tok-count');
  if (cnt) cnt.textContent = num((draft.join?.tokens || []).length);
}

/* ------------------------------------------------------------ token tool */

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveTokens() {
  const secret = store.secret;
  if (!secret || secret.length < 8) throw new Error('Set an organization key of at least 8 characters first.');

  const box = document.getElementById('spinelines');
  const raw = (box ? box.value : joinInput) || '';
  joinInput = raw;
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Add at least one participant identifier.');

  const events = new Set(S.state.schema.join.events);
  const tokens = [];
  for (const line of lines) {
    const [idRaw, evRaw] = line.split(',').map((s) => s.trim());
    if (!idRaw) continue;
    if (/^[0-9a-f]{32}$/.test(idRaw)) {
      const event = evRaw && events.has(evRaw) ? evRaw : 'completed';
      tokens.push({ token: idRaw, event });
      continue;
    }
    const event = evRaw && events.has(evRaw) ? evRaw : 'completed';
    const full = await hmac(secret, idRaw.toUpperCase());
    tokens.push({ token: full.slice(0, 32), event });
  }
  if (!tokens.length) throw new Error('No usable identifiers found.');
  draft.join = { ...(draft.join || {}), spine_version: S.state.schema.join.spine_version, tokens };
  save();
}

/* -------------------------------------------------------------- finalize */

function normalize(c) {
  const out = {
    ...c,
    source: 'intake',
    schema: 'tpw.intake/1',
    submitted_at: new Date().toISOString(),
    submitted_by: {
      name: c.submitter_name,
      email: c.submitter_email,
      role: c.submitter_role || null,
    },
    facility_code: S.facilityCode(c.facility),
    flags: [],
    join: {
      spine_version: c.join?.tokens?.length ? S.state.schema.join.spine_version : null,
      attested: !!c.join?.attested,
      tokens: (c.join?.tokens || []).map((t) => ({ token: t.token, event: t.event })),
    },
  };
  for (const f of S.fields()) {
    if (f.type === 'number' || f.type === 'integer') {
      out[f.key] = c[f.key] === '' || c[f.key] == null ? null : Number(c[f.key]);
    }
    if (typeof out[f.key] === 'string') out[f.key] = out[f.key].trim() || null;
  }
  return out;
}

async function finalize() {
  const all = allCycles(ctx.state);
  const { errors } = S.validate(draft, { all });
  if (errors.length) {
    S.fields().forEach((f) => draft[f.key] && touched.add(f.key));
    toast(`${errors.length} field${errors.length > 1 ? 's' : ''} still need attention — review the list below.`, 'bad');
    return null;
  }
  const cycle = normalize(draft);
  cycle.id = await S.makeId(cycle);
  return cycle;
}

function finish(cycle, meta) {
  done = { cycle, meta };
  paint(document.getElementById('view'));
}

/* ---------------------------------------------------------------- review */

function stepReview() {
  const all = allCycles(ctx.state);
  const { errors, warnings } = S.validate(draft, { all });
  const d = S.derive(draft);
  const tokens = draft.join?.tokens || [];
  const ready = errors.length === 0;
  const f = (k) => S.fieldByKey(k);

  return `
    <div class="grid2" style="margin-bottom:26px">
      <div class="card">
        <h3>${esc(draft.program || 'Untitled program')}</h3>
        <p style="margin-bottom:12px">${esc(draft.org || 'Organization not set')} · ${esc(draft.facility || 'Facility not set')}${
    draft.yard ? ` · ${esc(draft.yard)}` : ''
  }</p>
        <dl class="kv">
          <dt>Status</dt><dd>${esc(draft.status)}</dd>
          <dt>Dates</dt><dd>${shortDate(draft.start_date)} → ${shortDate(draft.end_date)}</dd>
          <dt>Course hours</dt><dd>${draft.course_hours || '—'} per participant</dd>
          <dt>Participants</dt><dd>${num(Number(draft.participants_started) || 0)} began · ${num(
    Number(draft.participants_completed) || 0
  )} completed</dd>
          <dt>Participant hours</dt><dd>${d.total_participant_hours == null ? '—' : num(d.total_participant_hours)}</dd>
          <dt>Program year</dt><dd>${d.program_year ?? '—'}</dd>
          <dt>Join spine</dt><dd>${tokens.length ? `${num(tokens.length)} tokens` : '<span class="tag">activity only</span>'}</dd>
        </dl>
        ${draft.notes ? `<p style="margin-top:14px;border-top:1px solid var(--rule);padding-top:12px">${esc(draft.notes)}</p>` : ''}
      </div>
      <div class="card">
        <h3>Validation</h3>
        <div id="validation-body">${validationBlock(errors, warnings)}</div>
      </div>
    </div>

    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);border-bottom:1px solid var(--rule);padding-bottom:9px;margin:0 0 16px">Who is filing this</h2>
    <div class="row2">
      ${field(f('submitter_name'))}
      ${field(f('submitter_email'))}
    </div>
    ${field(f('submitter_role'))}

    <div class="card" style="margin-top:24px">
      <h3 style="margin-bottom:12px">Publish</h3>
      <p style="margin-bottom:16px">Every cycle becomes a file in <code>${esc(S.state.config.paths?.cycles || 'data/intake/cycles')}</code>
        with a git commit behind it. Choose how it gets there.</p>
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn primary" data-act="issue" ${ready ? '' : 'disabled'}>Submit via GitHub issue</button>
        <button class="btn" data-act="token" ${ready ? '' : 'disabled'}>Commit with access token</button>
        <button class="btn" data-act="export" ${ready ? '' : 'disabled'}>Download JSON</button>
        <button class="btn ghost" data-act="local" ${ready ? '' : 'disabled'}>Keep on this device</button>
      </div>
      <p class="hint" style="margin-top:14px">Issue is the zero-setup route: it opens a prefilled
        GitHub issue and the workflow at <code>.github/workflows/intake.yml</code> validates it and
        commits the cycle. The token route skips the issue. Download gives you the exact file a
        committer would receive.</p>
    </div>

    <div class="wizard-foot">
      <div class="savebit">${ready ? 'Ready' : `${errors.length} to fix`}</div>
      <div class="right">
        <button class="btn" data-act="back">Back</button>
      </div>
    </div>`;
}

const labelFor = (key) => S.fieldByKey(key)?.label || key;

function validationBlock(errors, warnings) {
  if (!errors.length && !warnings.length) {
    return '<p style="color:var(--good)">Clean. Nothing to resolve.</p>';
  }
  return `<ul style="margin:0;padding-left:18px;font-size:13.5px">
    ${errors
      .map((e) => `<li style="color:var(--bad);margin-bottom:6px"><b>${esc(labelFor(e.key))}</b> — ${esc(e.msg)}</li>`)
      .join('')}
    ${warnings.map((w) => `<li style="color:var(--muted);margin-bottom:6px">${esc(w.msg)}</li>`).join('')}
  </ul>`;
}

/** Review-step affordances have to follow the draft without a repaint, or the
 *  publish buttons stay disabled while the submitter fills in their own name. */
function refreshReadiness() {
  if (step !== 4) return;
  const { errors, warnings } = S.validate(draft, { all: allCycles(ctx.state) });
  for (const sel of ['issue', 'token', 'export', 'local']) {
    const b = document.querySelector(`[data-act="${sel}"]`);
    if (b) b.disabled = errors.length > 0;
  }
  const body = document.getElementById('validation-body');
  if (body) body.innerHTML = validationBlock(errors, warnings);
  const foot = document.querySelector('.wizard-foot .savebit');
  if (foot) foot.textContent = errors.length ? `${errors.length} to fix` : 'Ready';
}

/* ------------------------------------------------------------------ done */

function paintDone(root) {
  const { cycle, meta } = done;
  const where =
    meta.channel === 'issue'
      ? 'Your browser opened a GitHub issue. Submitting that issue is what puts the cycle on the record — the workflow does the rest.'
      : meta.channel === 'commit'
      ? 'The cycle is committed to the repository and will appear on the public ledger after GitHub Pages rebuilds.'
      : meta.channel === 'file'
      ? 'The cycle JSON is in your downloads. Send it to the coordinator, or attach it to a pull request.'
      : 'The cycle is saved on this device only. It is visible in your ledger but is not in git yet.';

  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">${meta.channel === 'issue' ? 'Awaiting the issue' : 'Recorded'}</p>
        <h1>Cycle queued</h1>
        <p>${esc(where)}</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <h3>${esc(cycle.org)} — ${esc(cycle.program)}</h3>
      <p>${esc(cycle.facility)}${cycle.yard ? ` · ${esc(cycle.yard)}` : ''} · ${shortDate(cycle.start_date)} → ${shortDate(cycle.end_date)}</p>
      <dl class="kv" style="margin-top:16px">
        <dt>Cycle id</dt><dd class="mono">${esc(cycle.id)}</dd>
        <dt>Participant hours</dt><dd>${num((cycle.course_hours || 0) * (cycle.participants_completed || 0))}</dd>
        <dt>Join spine</dt><dd>${cycle.join.tokens.length ? `${num(cycle.join.tokens.length)} tokens` : 'none'}</dd>
      </dl>
      ${meta.url ? `<p style="margin-top:16px"><a href="${esc(meta.url)}" target="_blank" rel="noopener">Open the ${meta.channel === 'issue' ? 'issue' : 'commit'} →</a></p>` : ''}
    </div>

    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn primary" data-act="another">Report another cycle</button>
      <button class="btn" data-act="copy-json">Copy cycle JSON</button>
      <a class="btn" href="#/ledger">See the ledger</a>
    </div>`;
}

/* ------------------------------------------------------------ token modal */

function openTokenModal(cycle) {
  const saved = store.github;
  modal({
    title: 'Commit with an access token',
    sub: 'A fine-grained personal access token with Contents: read and write on this repository. It is stored in this browser only.',
    body: `
      <div class="field">
        <label for="gh-token">Token</label>
        <input id="gh-token" type="password" placeholder="github_pat_…" value="${esc(saved?.token || '')}" autocomplete="off">
        <p class="hint">github.com → Settings → Developer settings → Fine-grained tokens. Scope it to
          <code>${esc(S.state.config.repo)}</code> and nothing else.</p>
      </div>
      <label class="check">
        <input type="checkbox" id="gh-remember" ${saved ? 'checked' : ''}>
        <span>Remember on this device</span>
      </label>
      <p class="hint" id="gh-status"></p>`,
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: (close) => close() },
      {
        label: 'Commit',
        kind: 'primary',
        onClick: async (close) => {
          const token = document.getElementById('gh-token').value.trim();
          const remember = document.getElementById('gh-remember').checked;
          const status = document.getElementById('gh-status');
          if (!token) return toast('Paste a token first.', 'bad');
          status.textContent = 'Committing…';
          try {
            const res = await T.commitCycle(cycle, S.state.config, token);
            store.github = remember ? { token } : null;
            store.markPublished(cycle.id);
            enqueue(cycle, { channel: 'commit', url: res.url });
            close();
            finish(cycle, res);
            ctx.refresh();
            toast('Committed to the repository.', 'good');
          } catch (e) {
            status.textContent = '';
            status.className = 'err';
            status.textContent = `Failed: ${e.message}`;
          }
        },
      },
    ],
  });
}
