/* TPW outcome feasibility simulator.
 *
 * Answers one question: given the completers TPW actually has, what effect size
 * can be detected, under which matching design, and how far is that from a
 * claim worth making?
 *
 * Method — two-proportion test, unpooled variance, unequal allocation:
 *   n1 = ( z(1-a/2)*sqrt(pbar(1-pbar)(1+1/k)) + z(1-b)*sqrt(p1q1 + p0q0/k) )^2 / (p0-p1)^2
 * with pbar = (p1 + k*p0)/(1+k), k = n2/n1, alpha=.05 two-sided, power=.80.
 * Where the comparison group is a fixed population (CDCR's own group), k is
 * solved by iteration so n1 and k are mutually consistent.
 *
 * Inputs are the real numbers from data/tpw-collective-impact.csv:
 *   36 real program cycles, 1,441 enrollees, 739 completers, 14 institutions,
 *   104,039 participant-hours. The 739 excludes the row marked SAMPLE DATA.
 */

const Z_A = 1.959963985; // z(1 - .05/2), two-sided
const Z_B = 0.841621234; // z(.80) power

const FACTS = {
  completers: 739,
  enrollees: 1441,
  cycles: 36,
  institutions: 14,
  hours: 104039,
  // Public CDCR figures used as the comparison arm
  releasesPerYear: 26812,
  institutionsStatewide: 30,
  cdcrComparisonGroup: 27328,
};

const BASELINES = [
  { id: 'nocbp', label: '40.6% — no-achievement group', p: 0.406,
    note: 'CDCR FY2020-21 3-year conviction rate for people with no rehabilitative program achievement. The fairest comparison for an unevaluated program.' },
  { id: 'statewide', label: '44.0% — statewide recidivism', p: 0.44,
    note: 'The figure TPW quotes on its own site. Broadest possible baseline.' },
  { id: 'cbt', label: '28.6% — cognitive behavioural', p: 0.286,
    note: 'CDCR participants with cognitive behavioural program achievement. A hard baseline: it is the state\'s best-performing category.' },
  { id: 'edu', label: '22.4% — education programmes', p: 0.224,
    note: 'CDCR participants with education achievement — the lowest published rate.' },
];

/* ---------- math ---------- */

function requiredN1(p0, p1, k) {
  if (p0 === p1) return Infinity;
  const pbar = (p1 + k * p0) / (1 + k);
  const term1 = Z_A * Math.sqrt(pbar * (1 - pbar) * (1 + 1 / k));
  const term2 = Z_B * Math.sqrt(p1 * (1 - p1) + (p0 * (1 - p0)) / k);
  return ((term1 + term2) ** 2) / (p0 - p1) ** 2;
}

/** n1 needed when the comparison arm is a fixed size (not proportional to n1). */
function requiredN1FixedComparison(p0, p1, n2) {
  if (!isFinite(n2)) return requiredN1(p0, p1, 1e9);
  let n1 = requiredN1(p0, p1, 1);
  for (let i = 0; i < 200; i++) {
    const next = requiredN1(p0, p1, n2 / n1);
    if (Math.abs(next - n1) < 0.01) return next;
    n1 = next;
  }
  return n1;
}

/**
 * Smallest detectable reduction (in proportion points) for a given design.
 * design: {n1, n2} where n2 may be Infinity or 'n1' (matched).
 */
function detectableEffect(p0, n1, n2) {
  // Monotone: bigger effect -> smaller required n. Bisect on the effect.
  let lo = 0.0005, hi = p0 - 0.0005;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const need = isFinite(n2)
      ? requiredN1FixedComparison(p0, p0 - mid, n2)
      : requiredN1(p0, p0 - mid, Math.max(n2 / n1, 1e-6));
    if (need > n1) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- aggregate (facility-year) matching ---------- */

const AGG = (() => {
  const releasesPerInstitutionYear = FACTS.releasesPerYear / FACTS.institutionsStatewide; // ~894
  const cells = FACTS.institutions * 3; // 14 institutions x 3 program years
  return { releasesPerInstitutionYear, cells };
})();

/**
 * Facility-year aggregate matching: compare a whole institution-year's
 * recidivism rate against the statewide baseline. The program covers only a
 * fraction f of that institution-year's release flow, so the individual-level
 * effect must be 1/f times the cell-level difference.
 */
function aggregateDetectableEffect(p0, completers) {
  const perCell = completers / AGG.cells;
  const f = Math.min(perCell / AGG.releasesPerInstitutionYear, 1);
  const cellMdd = (Z_A + Z_B) * Math.sqrt((p0 * (1 - p0)) / AGG.releasesPerInstitutionYear);
  if (f <= 0) return Infinity;
  return cellMdd / f;
}

/* ---------- state ---------- */

const state = {
  completers: FACTS.completers,
  baselineId: 'nocbp',
  target: 0.05,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const pp = (x, d = 1) => `${(x * 100).toFixed(d)} pp`;
const int = (x) => Math.round(x).toLocaleString('en-US');

function baseline() {
  return BASELINES.find((b) => b.id === state.baselineId);
}

/* ---------- derived model ---------- */

function model() {
  const b = baseline();
  const p0 = b.p;
  const n = state.completers;

  const design = {
    full: { n1: n, n2: FACTS.cdcrComparisonGroup },
    matched: { n1: n, n2: n },
  };

  const mddFull = detectableEffect(p0, design.full.n1, design.full.n2);
  const mddMatched = detectableEffect(p0, design.matched.n1, design.matched.n2);
  const mddAgg = aggregateDetectableEffect(p0, n);

  const reqFull = requiredN1FixedComparison(p0, p0 - state.target, FACTS.cdcrComparisonGroup);
  const reqMatched = requiredN1(p0, p0 - state.target, 1);
  // Completers at which aggregate matching would detect the target effect.
  const cellMdd = (Z_A + Z_B) * Math.sqrt((p0 * (1 - p0)) / AGG.releasesPerInstitutionYear);
  const aggShareNeeded = cellMdd / state.target;
  const reqAgg = aggShareNeeded * AGG.cells * AGG.releasesPerInstitutionYear;

  return { p0, n, mddFull, mddMatched, mddAgg, reqFull, reqMatched, reqAgg, aggShareNeeded };
}

/* ---------- chart ---------- */

const CH = { w: 760, h: 360, l: 46, r: 26, t: 26, b: 40 };
const X_MIN = 100, X_MAX = 3000, Y_MIN = 1, Y_MAX = 60;

const xScale = (v) => CH.l + ((Math.log10(Math.max(v, X_MIN)) - Math.log10(X_MIN)) /
                              (Math.log10(X_MAX) - Math.log10(X_MIN))) * (CH.w - CH.l - CH.r);
const yScale = (v) => CH.t + (1 - (Math.log10(Math.min(Math.max(v, Y_MIN), Y_MAX)) - Math.log10(Y_MIN)) /
                                  (Math.log10(Y_MAX) - Math.log10(Y_MIN))) * (CH.h - CH.t - CH.b);

function curve(fn, p0) {
  const pts = [];
  for (let i = 0; i <= 140; i++) {
    const n = X_MIN * Math.pow(X_MAX / X_MIN, i / 140);
    const v = fn(n) * 100; // scale functions work in pp, not proportions
    pts.push([xScale(n), yScale(v), n, v]);
  }
  return pts;
}

function pathFrom(pts) {
  let d = '';
  let pen = false;
  for (const [x, y, , val] of pts) {
    if (val > Y_MAX) { pen = false; continue; } // clip: off the top of the chart
    d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    pen = true;
  }
  return d || 'M0 0';
}

function drawChart(m) {
  const svg = $('#chart');
  const p0 = m.p0;
  const W = CH.w, H = CH.h;

  const grid = [1, 2, 5, 10, 20, 40];
  const ys = grid.map((g) => `
    <line x1="${CH.l}" y1="${yScale(g)}" x2="${W - CH.r}" y2="${yScale(g)}"
          stroke="#eceae5" stroke-width="1"/>
    <text x="${CH.l - 10}" y="${yScale(g) + 4}" text-anchor="end"
          font-family="ui-monospace,monospace" font-size="11" fill="#9a958e">${g}</text>`).join('');

  const xs = [100, 200, 500, 1000, 2000, 3000].map((v) => `
    <line x1="${xScale(v)}" y1="${CH.t}" x2="${xScale(v)}" y2="${H - CH.b}" stroke="#f4f2ee" stroke-width="1"/>
    <text x="${xScale(v)}" y="${H - CH.b + 16}" text-anchor="middle"
          font-family="ui-monospace,monospace" font-size="11" fill="#9a958e">${v.toLocaleString()}</text>`).join('');

  const agg = curve((n) => aggregateDetectableEffect(p0, n), p0);
  const full = curve((n) => detectableEffect(p0, n, FACTS.cdcrComparisonGroup), p0);
  const matched = curve((n) => detectableEffect(p0, n, n), p0);

  const refLines = [
    { v: p0, label: `zero recidivism — the ceiling (${pct(p0, 1)})`, color: '#a8432f', dash: '2 4', w: 1.25 },
    { v: 0.182, label: 'largest effect any CDCR program publishes (18.2 pp)', color: '#8a6a12', dash: '5 4', w: 1.25 },
    { v: state.target, label: `target ${pp(state.target, 1)}`, color: '#5d8d67', dash: '0', w: 2 },
  ].map((r) => `
    <line x1="${CH.l}" y1="${yScale(r.v * 100)}" x2="${W - CH.r}" y2="${yScale(r.v * 100)}"
          stroke="${r.color}" stroke-width="${r.w}"
          stroke-dasharray="${r.dash === '0' ? '0' : r.dash}" opacity=".9"/>
    <text x="${CH.l + 8}" y="${yScale(r.v * 100) - 6}" font-size="11" fill="${r.color}"
          font-family="'Degular',sans-serif" font-weight="700"
          paint-order="stroke" stroke="#fff" stroke-width="3">${r.label}</text>`).join('');

  const nowX = xScale(m.n);
  const clippedNote = m.mddAgg * 100 > Y_MAX
    ? `<text x="${nowX + 8}" y="${CH.t + 12}" font-size="11" fill="#a8a29a" font-family="'Degular',sans-serif">
         aggregate design off the chart: ${Math.round(m.mddAgg * 100)} pp</text>`
    : '';

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <clipPath id="plot"><rect x="${CH.l}" y="${CH.t}" width="${W - CH.l - CH.r}" height="${H - CH.t - CH.b}"/></clipPath>
    </defs>
    ${grid.map((g) => '').join('')}${xs}
    <g clip-path="url(#plot)">
      ${refLines}
      <path d="${pathFrom(agg)}" fill="none" stroke="#c4bfb6" stroke-width="2.5" stroke-dasharray="7 5"/>
      <path d="${pathFrom(matched)}" fill="none" stroke="#9a958e" stroke-width="2.5"/>
      <path d="${pathFrom(full)}" fill="none" stroke="#5d8d67" stroke-width="3"/>
      <line x1="${nowX}" y1="${CH.t}" x2="${nowX}" y2="${H - CH.b}" stroke="#101010" stroke-width="1.5" stroke-dasharray="3 3" opacity=".5"/>
    </g>
    ${ys}
    ${clippedNote}
    <circle cx="${nowX}" cy="${yScale(m.mddFull * 100)}" r="5.5" fill="#5d8d67" stroke="#fff" stroke-width="2"/>
    <circle cx="${nowX}" cy="${yScale(m.mddMatched * 100)}" r="5.5" fill="#9a958e" stroke="#fff" stroke-width="2"/>
    <text x="${nowX}" y="${CH.t - 8}" text-anchor="middle" font-family="'Degular',sans-serif"
          font-size="11.5" font-weight="700" fill="#101010">${int(m.n)} today</text>
    <text x="${(CH.l + W - CH.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="11.5"
          fill="#9a958e" font-family="'Degular',sans-serif">total completers pooled for the analysis (log scale)</text>
    <text x="12" y="${(CH.t + H - CH.b) / 2}" transform="rotate(-90 12 ${(CH.t + H - CH.b) / 2})"
          text-anchor="middle" font-size="11.5" fill="#9a958e" font-family="'Degular',sans-serif">
          smallest detectable reduction, pp (log scale)</text>`;
}

/* ---------- render ---------- */

function verdictText(m) {
  const t = state.target;
  const clears = m.n >= m.reqFull;
  const gap = Math.abs(m.reqFull - m.n);
  if (clears) {
    return {
      html: `At <span class="num">${int(m.n)}</span> completers, TPW can claim a <span class="num">${pp(t, 1)}</span> difference today.`,
      sub: `Against CDCR's own comparison group that clears the ${pp(t, 1)} bar (${int(m.reqFull)} needed). It still needs ${int(m.reqMatched)} to make the same claim against a 1:1 matched comparison.`,
    };
  }
  return {
    html: `At <span class="num">${int(m.n)}</span> completers, TPW is <span class="short">${int(gap)} short</span> of a ${pp(t, 1)} claim.`,
    sub: `A ${pp(t, 1)} difference against CDCR's comparison group needs ${int(m.reqFull)} completers; against a 1:1 matched comparison, ${int(m.reqMatched)}. Today's data can detect a ${pp(m.mddFull, 1)} drop — ${int(gap)} more completers buys the ${pp(t, 1)} claim.`,
  };
}

function renderTable(m) {
  const t = state.target;
  const rows = [
    {
      name: 'CDCR-provided cohort lists',
      desc: 'CDCR returns outcomes for TPW\'s cohort, compared with its own no-achievement group.',
      mdd: m.mddFull,
      req: m.reqFull,
      cls: '',
    },
    {
      name: '1:1 matched comparison',
      desc: 'Each completer matched to a released person with no program participation.',
      mdd: m.mddMatched,
      req: m.reqMatched,
      cls: '',
    },
    {
      name: 'Facility-year aggregates only',
      desc: 'No individual linkage: compare whole institution-years. The program covers a sliver of each release flow.',
      mdd: m.mddAgg,
      req: m.reqAgg,
      cls: m.mddAgg > m.p0 ? 'impossible' : '',
    },
  ];

  $('#designs tbody').innerHTML = rows.map((r) => {
    const ok = r.mdd <= t;
    const impossible = r.cls === 'impossible' || r.mdd > m.p0;
    const badge = impossible
      ? '<span class="badge no">impossible</span>'
      : ok ? '<span class="badge ok">clears</span>' : '<span class="badge warn">short</span>';
    return `<tr class="${r.cls}">
      <td><b>${r.name}</b><div style="color:#9a958e;font-size:13px;margin-top:2px">${r.desc}</div></td>
      <td class="num">${pp(r.mdd, r.mdd > 0.5 ? 0 : 1)}</td>
      <td class="num">${impossible ? 'not reachable' : int(r.req)}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function renderAsk(m) {
  const t = state.target;
  const targetYear = 2029;
  $('#ask-body').innerHTML = `
    <ol>
      <li><b>14 institutions</b>, cohort lists returned by CDCR — not TPW-held identifiers.</li>
      <li><b>${int(Math.ceil(m.reqFull))} tokenised completers</b> with real release dates, to claim a ${pp(t, 1)} difference against CDCR's own comparison group${m.reqMatched > m.reqFull ? ` (${int(Math.ceil(m.reqMatched))} if the comparison arm must be 1:1)` : ''}.</li>
      <li><b>3-year measurement windows</b> from each release date. Nothing is readable before ${targetYear}; the earliest mature cohort lands mid-${targetYear}.</li>
      <li><b>Independent analysis</b> under CDCR Office of Research review — RIGHT 4.0 bars grantees from self-evaluating for publication.</li>
    </ol>
    <div class="foot">Generated from ${int(FACTS.cycles)} real program cycles, ${int(FACTS.enrollees)} enrollees and ${int(FACTS.completers)} completers in TPW's collective impact data, at ${
      pct(baseline().p, 1)} baseline, α=.05 two-sided, 80% power.</div>`;
}

function renderTimeline(m) {
  const start = 2024, now = 2026, mature = 2029;
  const span = mature + 1 - start;
  const x = (y) => ((y - start) / span) * 100;
  $('#timeline-bars').innerHTML = `
    <div class="bar collect" style="left:${x(start)}%;width:${x(now) - x(start)}%;top:6px">
      cohorts run · 2024–2026
    </div>
    <div class="bar mature" style="left:${x(now)}%;width:${x(now + 3) - x(now)}%;top:40px">
      36-month window → first mature read
    </div>
    <div class="axisline"></div>
    ${[2024, 2025, 2026, 2027, 2028, 2029].map((y) =>
      `<span class="tick" style="left:${x(y)}%">${y}</span>`).join('')}`;
}

function render() {
  const m = model();
  const v = verdictText(m);
  $('#verdict').innerHTML = v.html;
  $('#verdict-sub').textContent = v.sub;
  $('#baseline-note').textContent = baseline().note;

  $('#out-n').textContent = int(m.n);
  drawChart(m);
  renderTable(m);
  renderAsk(m);
  renderTimeline(m);

  const aggEl = $('#agg-need');
  if (aggEl) aggEl.textContent = Math.round(m.mddAgg * 100);

  $$('#targets .chip').forEach((c) => {
    c.setAttribute('aria-pressed', String(Number(c.dataset.v) === state.target));
  });
}

/* ---------- wiring ---------- */

function init() {
  const slider = $('#in-n');
  slider.value = state.completers;
  slider.addEventListener('input', (e) => {
    state.completers = Number(e.target.value);
    render();
  });

  $('#in-baseline').innerHTML = BASELINES.map((b) =>
    `<option value="${b.id}"${b.id === state.baselineId ? ' selected' : ''}>${b.label}</option>`).join('');
  $('#in-baseline').addEventListener('change', (e) => {
    state.baselineId = e.target.value;
    render();
  });

  $$('#targets .chip').forEach((c) => {
    c.addEventListener('click', () => { state.target = Number(c.dataset.v); render(); });
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
