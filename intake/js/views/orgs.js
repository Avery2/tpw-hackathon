// Who are you reporting for?
//
// This page exists for one person: a program coordinator who reports the same
// program at the same yard every quarter and should not have to spell her
// organization's name correctly for the fourth time.
//
// So it is written for someone who uses a computer occasionally, not daily. No
// JSON, no filters, no counters, no statistics, no words like "derived" or
// "registry". One question at the top, big things to click underneath, and no
// dead ends — an organization that is not listed yet gets a plain way forward
// rather than a shrug.

import { esc, num, shortDate, delegate, bindFresh } from '../ui.js';
import * as S from '../schema.js';
import { allCycles } from '../store.js';

const filters = { q: '' };

const link = (orgId, programId, siteId) => {
  const p = new URLSearchParams({ org: orgId });
  if (programId) p.set('program', programId);
  if (siteId) p.set('site', siteId);
  return `#/submit?${p.toString()}`;
};

const reports = (n) => (n === 1 ? '1 report' : `${num(n)} reports`);

export function render(root) {
  const orgs = S.orgs();
  const pending = localOnly(orgs);

  root.className = '';
  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Organizations</p>
        <h1>Which organization are you reporting for?</h1>
        <p>Pick your organization and where you ran the program. We will fill in the rest from
           your past reports — you only need to change what is different this time.</p>
      </div>
      <a class="btn" href="#/submit">Start a blank report</a>
    </div>

    ${
      orgs.length
        ? `<input type="text" id="q" class="search" autocomplete="off"
                  placeholder="Type your organization's name" aria-label="Type your organization's name"
                  value="${esc(filters.q)}">
           <div id="orglist">${orgs.map(card).join('')}</div>
           <p class="hint" id="none" hidden>Nothing matches that name.
             <a href="#/submit">Start a blank report instead</a>.</p>`
        : empty()
    }

    ${pending.length ? pendingSection(pending) : ''}`;

  bind(root);
  applyFilter();
}

function card(org) {
  const meta = [];
  meta.push(org.programs.length === 1 ? org.programs[0].name : `${org.programs.length} programs`);
  meta.push(org.sample_only ? 'no reports yet' : reports(org.real_cycles));
  if (org.last_activity) meta.push(`last ${shortDate(org.last_activity)}`);

  return `
    <details class="org" data-org="${esc(org.id)}" data-search="${esc(searchText(org))}">
      <summary>
        <span class="org-name">${esc(org.org)}</span>
        <span class="org-meta">${esc(meta.join(' · '))}</span>
      </summary>
      <div class="org-body">
        ${programs(org)}
        ${
          org.contact?.email
            ? `<p class="hint" style="margin-top:14px">Last report from
                 ${esc(org.contact.name || org.contact.email)}${org.contact.role ? `, ${esc(org.contact.role)}` : ''}.</p>`
            : ''
        }
      </div>
    </details>`;
}

function programs(org) {
  return org.programs
    .map((p) => {
      const hours = p.course_hours != null ? ` · ${num(p.course_hours)} hours` : '';
      return `
        <div class="prog">
          <p class="prog-name">${esc(p.name || 'Program')}<span>${esc(hours)}</span></p>
          ${p.sites.length > 1 ? '<p class="hint">Where did you run it?</p>' : ''}
          <div class="sites">
            ${p.sites
              .map(
                (s) => `<a class="site" href="${link(org.id, p.id, s.id)}">
                  <span class="fac">${esc(s.facility)}</span>
                  ${s.yard ? `<span class="yard">${esc(s.yard)}</span>` : ''}
                  <em>Start</em>
                </a>`
              )
              .join('')}
          </div>
        </div>`;
    })
    .join('');
}

function searchText(org) {
  return [org.org, ...org.programs.map((p) => p.name), ...org.programs.flatMap((p) => p.sites.map((s) => `${s.facility} ${s.yard || ''}`))]
    .join(' ')
    .toLowerCase();
}

/** Organizations that exist only in this browser — filed here, not yet sent. */
function localOnly(orgs) {
  const known = new Set(orgs.map((o) => o.org.toLowerCase()));
  const seen = new Map();
  for (const c of allCycles(S.state)) {
    if (!c.org || c._source !== 'local') continue;
    if (known.has(String(c.org).toLowerCase())) continue;
    if (!seen.has(c.org)) seen.set(c.org, { org: c.org, n: 0 });
    seen.get(c.org).n += 1;
  }
  return [...seen.values()];
}

function pendingSection(pending) {
  return `
    <div class="section" style="margin-top:34px">
      <h2>Saved on this computer</h2>
      <p class="hint" style="margin:-6px 0 14px">
        These reports have not been sent yet. Open the report and choose a way to send it.
      </p>
      ${pending
        .map(
          (p) => `<div class="card tight" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px">
            <strong>${esc(p.org)}</strong>
            <span class="tag warn">${reports(p.n)} not sent</span>
          </div>`
        )
        .join('')}
    </div>`;
}

function empty() {
  return `<div class="empty">
    <p style="margin:0 0 12px">No organizations have reported yet.</p>
    <a class="btn primary" href="#/submit">Start a blank report</a>
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
  const none = document.getElementById('none');
  if (none) none.hidden = shown > 0;
  if (q && shown === 0) for (const el of document.querySelectorAll('.org[open]')) el.open = false;
}

function bind(root) {
  const signal = bindFresh(root);

  delegate(root, 'input', '#q', (e) => {
    filters.q = e.target.value;
    applyFilter();
  }, signal);
}
