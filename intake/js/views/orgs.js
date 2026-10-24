// The registry: the recurring half of every submission, kept once.
//
// Nine of the intake form's fifteen fields are the same on an organization's
// second cycle as its first — its name, its program, the facility, the yard, the
// course hours, who signs for it. Asking again is not diligence, it is just a way
// to collect three spellings of the same organization.
//
// This page is therefore read-only by design. Profiles are derived from the
// ledger by scripts/intake_profiles.py and rebuilt on every push, so nothing here
// can disagree with what was actually reported. The only write path is the one
// that matters: starting a cycle with these values already in it.

import { esc, num, shortDate, toast, delegate, copy, download, bindFresh } from '../ui.js';
import * as S from '../schema.js';
import { allCycles } from '../store.js';

const filters = { q: '' };

const href = (orgId, programId, siteId) => {
  const p = new URLSearchParams({ org: orgId });
  if (programId) p.set('program', programId);
  if (siteId) p.set('site', siteId);
  return `#/submit?${p.toString()}`;
};

const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export function render(root) {
  const orgs = S.orgs();
  const sites = orgs.reduce((n, o) => n + o.programs.reduce((m, p) => m + p.sites.length, 0), 0);
  const programs = orgs.reduce((n, o) => n + o.programs.length, 0);
  const pending = localOnly(orgs);

  root.className = '';
  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Registry</p>
        <h1>Organization profiles</h1>
        <p>${plural(orgs.length, 'organization')} · ${plural(programs, 'program')} ·
           ${plural(sites, 'site')}. What each organization has already told us, so the form can ask
           once instead of every cycle.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small ghost" data-act="copy">Copy JSON</button>
        <button class="btn small ghost" data-act="download">Download</button>
      </div>
    </div>

    ${
      orgs.length
        ? `<div class="caveat" style="margin-bottom:22px">
             <strong>Derived, not entered.</strong> These profiles are rebuilt from
             <code>data/intake/seed.json</code> plus every committed cycle by
             <code>scripts/intake_profiles.py</code> on each push. Editing them by hand would be
             editing a cache — correct a cycle instead and the profile follows.
           </div>
           <div class="toolbar">
             <input type="text" id="q" placeholder="Filter by organization, program, or facility…" value="${esc(filters.q)}">
             <div class="spacer"></div>
             <span class="savebit" id="qcount">${orgs.length} shown</span>
           </div>
           <div id="orglist">${orgs.map((o) => card(o)).join('')}</div>`
        : empty()
    }

    ${pending.length ? pendingSection(pending) : ''}

    <details class="why" style="margin-top:30px">
      <summary>How the prefilled values are chosen</summary>
      <p>Course hours and funding source are the <em>mode</em> of past cycles — the value you have used
         most often — so a single odd cycle cannot rewrite the profile. The contact is whoever signed
         the most recent submission. Nothing is guessed: if an organization has twenty-five sites, no
         facility is filled in, because a wrong yard is worse than an empty one.</p>
    </details>`;

  bind(root);
  applyFilter();
}

function card(org) {
  const flags = [];
  if (org.sample_only) flags.push('<span class="tag warn">sample rows only</span>');
  flags.push(`<span class="tag">${plural(org.programs.length, 'program')}</span>`);

  return `
    <details class="org" data-org="${esc(org.id)}"
             data-search="${esc([org.org, ...org.programs.map((p) => p.name),
               ...org.programs.flatMap((p) => p.sites.map((s) => `${s.facility} ${s.yard || ''}`))]
               .join(' ').toLowerCase())}">
      <summary>
        <span class="org-name">${esc(org.org)}</span>
        <span class="org-meta">
          ${org.sample_only ? 'no reportable cycles' : plural(org.real_cycles, 'cycle')}
          ${org.last_activity ? `· last ${shortDate(org.last_activity)}` : ''}
        </span>
        <span class="org-tags">${flags.join('')}</span>
      </summary>
      <div class="org-body">
        ${org.contact?.email ? `<p class="hint" style="margin:0 0 14px">
          Contact of record: <strong>${esc(org.contact.name || org.contact.email)}</strong>
          ${org.contact.role ? `, ${esc(org.contact.role)}` : ''} · ${esc(org.contact.email)}
        </p>` : ''}
        ${org.programs.map((p) => program(org, p)).join('')}
      </div>
    </details>`;
}

function program(org, p) {
  const known = [];
  if (p.course_hours != null) known.push(`<span class="tag">${num(p.course_hours)} hrs</span>`);
  if (p.funded_by) known.push(`<span class="tag">${esc(p.funded_by)}</span>`);
  if (p.last_cycle) known.push(`<span class="tag">last ${shortDate(p.last_cycle)}</span>`);

  return `
    <div class="prog">
      <div class="prog-head">
        <strong>${esc(p.name || 'Unnamed program')}</strong>
        ${known.join('')}
        <span class="spacer"></span>
        <a class="btn small" href="${href(org.id, p.id)}">New cycle</a>
      </div>
      ${
        p.sites.length
          ? `<div class="sites">${p.sites
              .map(
                (s) => `<a class="site" href="${href(org.id, p.id, s.id)}">
                  <span>${esc(s.facility)}${s.yard ? ` · ${esc(s.yard)}` : ''}</span>
                  <em>${num(s.cycles)}</em>
                </a>`
              )
              .join('')}</div>`
          : '<p class="hint">No facility recorded for this program yet.</p>'
      }
    </div>`;
}

/** Organizations that exist only in this browser's queue — not yet evidence. */
function localOnly(orgs) {
  const known = new Set(orgs.map((o) => o.org.toLowerCase()));
  const seen = new Map();
  for (const c of allCycles(S.state)) {
    if (!c.org || c._source !== 'local') continue;
    if (known.has(String(c.org).toLowerCase())) continue;
    if (!seen.has(c.org)) seen.set(c.org, { org: c.org, cycles: 0 });
    seen.get(c.org).cycles += 1;
  }
  return [...seen.values()];
}

function pendingSection(pending) {
  return `
    <div class="section" style="margin-top:34px">
      <h2>On this device only</h2>
      <p class="hint" style="margin:-6px 0 16px">
        Filed here but not yet committed, so there is no profile to derive. They join the registry
        once the cycles reach git.
      </p>
      ${pending
        .map(
          (p) => `<div class="card tight" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px">
            <strong>${esc(p.org)}</strong>
            <span class="tag warn">${plural(p.cycles, 'cycle')} local</span>
          </div>`
        )
        .join('')}
    </div>`;
}

function empty() {
  return `<div class="empty">
    <p style="margin:0 0 10px">No organizations to derive yet.</p>
    <p class="hint" style="margin:0">Profiles appear once cycles exist in
      <code>data/intake/seed.json</code> or <code>data/intake/cycles/</code>. Rebuild with:</p>
    <pre class="mono" style="white-space:pre-wrap;margin-top:12px">python3 scripts/intake_profiles.py</pre>
  </div>`;
}

/* -------------------------------------------------------------------- wiring */

function applyFilter() {
  const q = filters.q.trim().toLowerCase();
  let shown = 0;
  for (const el of document.querySelectorAll('#orglist .org')) {
    const hit = !q || el.dataset.search.includes(q);
    el.hidden = !hit;
    if (hit) shown += 1;
  }
  const count = document.getElementById('qcount');
  if (count) count.textContent = `${shown} shown`;
  const list = document.getElementById('orglist');
  if (list && q && !shown) list.innerHTML = '<div class="empty">No organization matches that filter.</div>';
}

function bind(root) {
  const signal = bindFresh(root);

  delegate(root, 'input', '#q', (e) => {
    filters.q = e.target.value;
    applyFilter();
  }, signal);

  // Opening one profile closes the others: at 120 organizations the page is a
  // list until you pick one, and reading two at once is not what it is for.
  delegate(root, 'toggle', '.org', (e, el) => {
    if (!el.open) return;
    for (const other of document.querySelectorAll('.org[open]')) if (other !== el) other.open = false;
  }, signal);

  delegate(root, 'click', '[data-act="copy"]', () => {
    copy(JSON.stringify(S.orgs(), null, 2), 'Registry copied');
  }, signal);

  delegate(root, 'click', '[data-act="download"]', () => {
    const payload = {
      schema: 'tpw.intake.orgs/1',
      generated_at: new Date().toISOString(),
      orgs: S.orgs(),
    };
    download('orgs.index.json', JSON.stringify(payload, null, 2) + '\n');
    toast('Registry downloaded', 'good');
  }, signal);

  delegate(root, 'click', '.site', (e, el) => {
    // Let the hash route; just confirm the handoff happened.
    const name = el.querySelector('span')?.textContent || 'that site';
    setTimeout(() => toast(`Cycle started at ${name.trim()}`, 'good'), 60);
  }, signal);
}
