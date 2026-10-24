// What the ledger can actually claim. Activity is measured from cycles; outcomes
// exist only where a participant token reaches a release date and a conviction
// window. The point of this view is to keep those two things visibly different.

import { esc, num, pct, delegate, bindFresh } from '../ui.js';
import * as S from '../schema.js';
import { allCycles } from '../store.js';

const WINDOWS = [
  { months: 12, days: 365, label: '12 mo' },
  { months: 24, days: 730, label: '24 mo' },
  { months: 36, days: 1095, label: '36 mo' },
];

let windowMonths = 12;
const TODAY = new Date().toISOString().slice(0, 10);

const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function render(root, ctx) {
  const all = allCycles(ctx.state).filter((c) => !(c.flags || []).includes('sample-data'));
  root.className = '';
  root.innerHTML = view(all, ctx);

  const signal = bindFresh(root);
  delegate(
    root,
    'click',
    '[data-window]',
    (e, el) => {
      windowMonths = Number(el.dataset.window);
      render(root, ctx);
    },
    signal
  );
  delegate(
    root,
    'click',
    '[data-act="download-joined"]',
    () => {
      const byId = new Map(all.map((c) => [c.id, c]));
      const rows = (ctx.state.join.participants || [])
        .filter((p) => byId.has(p.cycle_id))
        .map((p) => {
          const c = byId.get(p.cycle_id);
          return [p.token, p.cycle_id, q(c.program), q(c.facility), p.event, p.release_date || '', p.new_conviction_after_days ?? ''];
        });
      const head = 'token,cycle_id,program,facility,event,release_date,new_conviction_after_days\n';
      const blob = new Blob([head + rows.map((r) => r.join(',')).join('\n') + '\n'], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tpw-joined-participants.csv';
      a.click();
    },
    signal
  );
}

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Maturity and conviction counts for one window, split by completion status. */
function cohort(people, days) {
  const matured = people.filter((p) => p.release_date && addDays(p.release_date, days) <= TODAY);
  const group = (event) => {
    const g = matured.filter((p) => p.event === event);
    const hit = g.filter((p) => p.new_conviction_after_days != null && p.new_conviction_after_days <= days);
    return { n: g.length, hit: hit.length, rate: g.length ? hit.length / g.length : null };
  };
  return { matured, done: group('completed'), drop: group('did_not_complete') };
}

function view(all, ctx) {
  const records = ctx.state.records || [];
  const aggregates = records.filter((r) => r.kind === 'aggregate');
  const weekly = records.filter((r) => r.kind === 'weekly');
  const followups = records.filter((r) => r.kind === 'followup' && r.status !== 'unknown');

  const completed = all.filter((c) => c.status === 'Completed');
  const analysable = completed.filter((c) => c.participants_completed != null && c.course_hours != null);
  const enrollees = sum(analysable, (c) => c.participants_started) + sum(aggregates, (r) => r.served);
  const completions = sum(analysable, (c) => c.participants_completed) + sum(aggregates, (r) => r.completed);
  const hours = sum(analysable, (c) => c.participants_completed * c.course_hours);
  const orgs = new Set([...all.map((c) => c.org), ...aggregates.map((r) => r.org)].filter(Boolean)).size;
  const facilities = new Set([...all.map((c) => c.facility), ...aggregates.map((r) => r.facility)].filter(Boolean)).size;

  const byId = new Map(all.map((c) => [c.id, c]));
  // Self-reported follow-ups outrank the synthetic spine for the same token.
  const reported = followups.map((r) => ({
    token: r.token,
    cycle_id: null,
    event: 'completed',
    release_date: r.release_date,
    new_conviction_after_days: r.status === 'new_conviction' ? (r.days ?? 0) : null,
    self_reported: true,
  }));
  const seen = new Set(reported.map((r) => r.token));
  const people = [
    ...(ctx.state.join.participants || []).filter((p) => byId.has(p.cycle_id) && !seen.has(p.token)),
    ...reported,
  ];
  const released = people.filter((p) => p.release_date);

  const win = WINDOWS.find((w) => w.months === windowMonths) || WINDOWS[0];
  const now = cohort(people, win.days);
  const coverage = enrollees ? people.length / enrollees : null;

  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">Impact</p>
        <h1>From activity to outcome</h1>
        <p>Two columns that have never met: what organizations delivered, and what happened to the
           people afterward. Every figure below is computed in this browser from the JSON in this
           repository — there is no warehouse behind it.</p>
      </div>
      <span class="tag synthetic">spine: synthetic</span>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="v">${num(completed.length)}</span><span class="l">completed cycles on record</span></div>
      <div class="kpi"><span class="v">${num(enrollees)}</span><span class="l">participants enrolled</span></div>
      <div class="kpi"><span class="v">${num(completions)}</span><span class="l">participants completed</span></div>
      <div class="kpi"><span class="v">${num(hours)}</span><span class="l">rehabilitative hours delivered</span></div>
      <div class="kpi"><span class="v">${num(orgs)}</span><span class="l">organizations · ${num(facilities)} facilities</span></div>
      <div class="kpi accent"><span class="v">${pct(coverage)}</span><span class="l">of enrollees carry a join token</span></div>
    </div>

    <p class="hint" style="margin:-18px 0 30px">
      Activity totals combine ${num(analysable.length)} cycle records with
      ${aggregates.length ? `${num(aggregates.length)} self-reported totals ${aggregates.length === 1 ? 'entry' : 'entries'}` : 'no self-reported totals yet'}${weekly.length ? `; ${num(weekly.length)} weekly ${weekly.length === 1 ? 'log' : 'logs'} feed the cadence line below` : ''}.
      ${reported.length ? `${num(reported.length)} of the ${num(people.length)} joined participants came from self-reported follow-ups.` : ''}
    </p>

    <div class="section">
      <h2>The join, step by step</h2>
      <div class="grid2">
        <div>
          <div class="funnel">
            ${stage('Participants enrolled', enrollees, null)}
            ${stage('Joined to a token', people.length, enrollees - people.length)}
            ${stage('Released from custody', released.length, people.length - released.length)}
            ${stage(`Observation window reached (${win.label})`, now.matured.length, released.length - now.matured.length)}
            ${stage('New conviction inside the window', now.matured.filter((p) => p.new_conviction_after_days != null && p.new_conviction_after_days <= win.days).length, null)}
          </div>
          <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="eyebrow" style="margin:0">Window</span>
            <div class="seg">
              ${WINDOWS.map(
                (w) => `<button data-window="${w.months}" aria-pressed="${w.months === windowMonths}">${w.label}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Where the funnel leaks</h3>
          <p style="margin-bottom:12px"><b style="color:var(--ink)">Enrolled → token.</b> Cycles filed before
            the spine existed have no identifier and can never be joined retroactively. They stay in the
            activity total forever.</p>
          <p style="margin-bottom:12px"><b style="color:var(--ink)">Release → window.</b> A 36-month outcome
            cannot be known until three years after release. Most of this ledger is too young, which is a
            fact about the cohort, not a missing-data problem.</p>
          <p><b style="color:var(--ink)">Window reached → conviction.</b> Absence of a record is not proof of
            no conviction. Anyone still in custody, transferred, or out of state is unobserved.</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Completion and recidivism, at every window</h2>
      <div class="grid2">
        <div class="card">
          <table>
            <thead><tr>
              <th>Window after release</th>
              <th class="num">Completed</th><th class="num">Did not complete</th><th class="num">Gap</th>
            </tr></thead>
            <tbody>
              ${WINDOWS.map((w) => {
                const c = cohort(people, w.days);
                const gap = c.done.rate != null && c.drop.rate != null ? c.drop.rate - c.done.rate : null;
                const thin = c.matured.length < 50;
                return `<tr class="${thin ? 'dimrow' : ''}" style="${w.months === windowMonths ? 'background:var(--card-2);opacity:1' : ''}">
                  <td><b>${w.label}</b>${w.months === windowMonths ? ' <span class="tag info">viewing</span>' : ''}
                    <div class="dim">${num(c.matured.length)} matured</div></td>
                  <td class="num" style="color:var(--good)">${c.done.n ? `${pct(c.done.rate)}<div class="dim">n=${c.done.n}</div>` : '<span class="dim">not yet</span>'}</td>
                  <td class="num" style="color:var(--bad)">${c.drop.n ? `${pct(c.drop.rate)}<div class="dim">n=${c.drop.n}</div>` : '<span class="dim">not yet</span>'}</td>
                  <td class="num">${gap == null ? '—' : `${(gap * 100).toFixed(0)} pts`}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <p class="hint" style="margin-top:14px">“Matured” means the observation window has actually closed
            for that person. Rates are computed only over matured records, so a young cohort shrinks the
            denominator instead of quietly counting as success. Dimmed rows have fewer than 50 matured
            records — shown for completeness, not for inference.</p>
        </div>
        <div class="caveat">
          <p style="margin:0 0 10px"><b>Read this before quoting a number.</b></p>
          <p style="margin:0 0 8px">The participant spine here is
            <code>data/intake/demo/join.json</code> and is <b>synthetic</b> — generated to exercise the
            join, not to describe any real program or person. Any follow-ups submitted through the quick
            form are real entries and take precedence for their token, but they are self-reported by the
            organization, not matched against CDPS records.</p>
          <p style="margin:0">What it does show is structural. A stable, non-identifying key travels from
            intake to outcome, and a static repository computes the comparison without ever holding a name.</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Delivery</h2>
      <div class="grid2">
        ${barBlock('Participant hours by program year', byYear(analysable))}
        ${barBlock('Completions by program', byKey(analysable, 'program'))}
      </div>
      ${weekly.length ? `<div style="margin-top:18px">${cadence(weekly)}</div>` : ''}
      <div style="margin-top:18px">
        ${barBlock('Participant hours by facility', byKey(analysable, 'facility', (c) => c.participants_completed * c.course_hours), 10)}
      </div>
    </div>

    <div class="section">
      <h2>Spine coverage by organization</h2>
      <div class="card">
        <table>
          <thead><tr><th>Organization</th><th class="num">Cycles</th><th class="num">Enrollees</th><th class="num">Tokens</th><th class="num">Coverage</th></tr></thead>
          <tbody>
            ${[...new Set(all.map((c) => c.org).filter(Boolean))]
              .sort()
              .map((org) => {
                const mine = analysable.filter((c) => c.org === org);
                const enr = sum(mine, (c) => c.participants_started);
                const tk = people.filter((p) => byId.get(p.cycle_id)?.org === org).length;
                return `<tr><td>${esc(org)}</td><td class="num">${num(mine.length)}</td>
                  <td class="num">${num(enr)}</td><td class="num">${num(tk)}</td>
                  <td class="num" style="color:${tk ? 'var(--good)' : 'var(--muted)'}">${enr ? pct(tk / enr) : '—'}</td></tr>`;
              })
              .join('')}
          </tbody>
        </table>
        <p class="hint" style="margin-top:14px">Coverage is the one number to move. Every cycle filed
          through this form from now on can carry a spine; nothing imported from the sheet can.</p>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn small" data-act="download-joined">Download joined participant CSV</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>What TPW can say with this</h2>
      <div class="grid2">
        ${claim(
          'Activity — to CDCR, today',
          `${num(hours)} participant-hours across ${num(completed.length)} cycles at ${num(facilities)} institutions, ${num(orgs)} organizations.`,
          'This is exactly what the RIGHT 4.0 annual report asks for, and it is already defensible from the sheet.'
        )}
        ${claim(
          'Outcome — only with the join',
          'Completions tracked through release and re-conviction over a declared window.',
          'The grant does not ask for this and cannot be shown without it. It is the only evidence that rehabilitation works.'
        )}
      </div>
      <p class="hint" style="margin-top:16px">${esc(S.state.schema.join.note)}</p>
    </div>`;
}

const weekLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Weekly logs are a leading indicator, not a count of people. Keep the unit clear. */
function cadence(weekly) {
  const recent = [...weekly]
    .filter((r) => r.week_ending)
    .sort((a, b) => b.week_ending.localeCompare(a.week_ending))
    .slice(0, 8)
    .reverse();
  const sessions = sum(recent, (r) => r.sessions);
  const attendance = sum(recent, (r) => r.attendance);
  const max = Math.max(...recent.map((r) => r.attendance || 0), 1);
  return `<div class="card">
    <h3 style="margin-bottom:6px">Weekly delivery, last ${recent.length} logged ${recent.length === 1 ? 'week' : 'weeks'}</h3>
    <p style="margin-bottom:14px">${num(sessions)} sessions · ${num(attendance)} attendances. Self-reported, one line per week.</p>
    <div class="bars">
      ${recent
        .map(
          (r) => `<div class="bar">
            <span class="lab" title="${esc(r.program || '')}">${esc(weekLabel(r.week_ending))}</span>
            <span class="track"><span class="fill" style="width:${Math.max(2, ((r.attendance || 0) / max) * 100)}%"></span></span>
            <span class="val">${num(r.attendance)}</span>
          </div>`
        )
        .join('')}
    </div>
    <p class="hint" style="margin-top:12px">Attendance counts a person once per session attended, so it is a
      volume measure, not a headcount.</p>
  </div>`;
}

const stage = (label, value, drop) => `<div class="stage">
    <span>${esc(label)}</span>
    <span><b>${num(value)}</b>${drop > 0 ? ` <span class="drop">−${num(drop)}</span>` : ''}</span>
  </div>`;

const claim = (title, claimText, support) => `<div class="card">
    <h3>${esc(title)}</h3>
    <p style="color:var(--ink);font-size:15px;margin:6px 0 8px">${esc(claimText)}</p>
    <p>${esc(support)}</p>
  </div>`;

function byYear(cycles) {
  const map = new Map();
  for (const c of cycles) {
    const y = c.start_date ? c.start_date.slice(0, 4) : 'unknown';
    map.set(y, (map.get(y) || 0) + c.participants_completed * c.course_hours);
  }
  return [...map.entries()].sort();
}

function byKey(cycles, key, valueFn = (c) => c.participants_completed) {
  const map = new Map();
  for (const c of cycles) {
    const k = c[key] || 'unassigned';
    map.set(k, (map.get(k) || 0) + valueFn(c));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function barBlock(title, entries, limit = 6) {
  const shown = entries.slice(0, limit);
  const max = Math.max(...shown.map((e) => e[1]), 1);
  return `<div class="card">
    <h3 style="margin-bottom:14px">${esc(title)}</h3>
    <div class="bars">
      ${shown
        .map(
          ([label, v], i) => `<div class="bar">
            <span class="lab" title="${esc(label)}">${esc(short(label))}</span>
            <span class="track"><span class="fill ${i === 0 ? 'a' : ''}" style="width:${Math.max(2, (v / max) * 100)}%"></span></span>
            <span class="val">${num(Math.round(v))}</span>
          </div>`
        )
        .join('')}
    </div>
    ${entries.length > limit ? `<p class="hint" style="margin-top:12px">+${entries.length - limit} more</p>` : ''}
  </div>`;
}

const short = (s) => {
  const clean = String(s)
    .replace(/\s*\([A-Z]+\)$/, '')
    .replace(/^California /, 'CA ')
    .replace(/^Correctional /, 'Corr. ');
  return clean.length > 22 ? `${clean.slice(0, 21)}…` : clean;
};
