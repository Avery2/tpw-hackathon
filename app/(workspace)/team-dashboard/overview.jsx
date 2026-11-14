'use client';

import { DashboardExports } from './controls.jsx';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceAccount } from './workspace.jsx';

const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const modes = [['participants', 'Participants'], ['completionRate', 'Completion rate'], ['racDays', 'RAC credits']];

export function Trends({ points }) {
  const [metric, setMetric] = useState('participants');
  const color = metric === 'completionRate' ? '#aa741d' : '#5d8d67';
  const fill = metric === 'completionRate' ? '#faf2e3' : '#edf5e9';
  const max = metric === 'completionRate' ? 100 : 4 * Math.max(1, Math.ceil(Math.max(1, ...points.map(point => point[metric] || 0)) / 4));
  const first = Date.parse(points[0]?.day), last = Date.parse(points.at(-1)?.day);
  const x = point => first === last ? 500 : 64 + (Date.parse(point.day) - first) / (last - first) * 872;
  const baseline = 252;
  const y = value => baseline - value / max * 228;
  const plotted = points.flatMap(point => point[metric] == null ? [] : [{ point, x: x(point), y: y(point[metric]) }]);
  const line = plotted.map(dot => `${dot.x},${dot.y}`).join(' ');
  const format = value => value == null ? 'N/A' : metric === 'completionRate' ? `${value.toFixed(1)}%` : number(value);
  return <section className="participants-chart">
    <div className="chart-heading"><h3>Program trends</h3><div className="chart-pills" role="group" aria-label="Chart metric">
      {modes.map(([key, label]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}
    </div></div>
    <strong className="chart-current">{points.length ? format(points.at(-1)[metric]) : 'No history yet'}</strong>
    <p className="chart-caption">Latest reported program data for each quarter. Select a metric to explore its trend.</p>
    {plotted.length > 0 && <svg key={metric} viewBox="0 0 960 300" width="100%" role="img" aria-label={modes.find(([key]) => key === metric)[1]}>
      {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="64" x2="936" y1={y(max * index / 4)} y2={y(max * index / 4)} stroke="#e3e9df" /><text x="52" y={y(max * index / 4) + 4} textAnchor="end" className="chart-axis">{format(max * index / 4)}</text></g>)}
      <path d={`M ${line} L ${plotted.at(-1).x},${baseline} L ${plotted[0].x},${baseline} Z`} className="chart-area-enter" fill={fill} />
      <polyline points={line} className="chart-line-enter" fill="none" stroke={color} strokeWidth="3" />
      {plotted.map((dot, index) => <circle key={dot.point.day} className="chart-dot-enter" style={{ animationDelay: `${120 + index * Math.min(35, 450 / plotted.length)}ms` }} cx={dot.x} cy={dot.y} r="5" fill={color} tabIndex={0}><title>{dot.point.quarterLabel}: {format(dot.point[metric])}</title></circle>)}
      {points.map((point,index) => (index % Math.ceil(points.length / 5) === 0) && <text key={point.day} x={x(point)} y="284" textAnchor="middle" className="chart-axis">{point.quarterLabel}</text>)}
    </svg>}
    {points.length > 0 && <details><summary>View chart data</summary><table><thead><tr><th>Quarter</th><th>{modes.find(([key]) => key === metric)[1]}</th></tr></thead><tbody>
      {points.map(point => <tr key={point.day}><td>{point.quarterLabel}</td><td>{format(point[metric])}</td></tr>)}
    </tbody></table></details>}
  </section>;
}

export function Savings({ value }) {
  const amount = useRef(null);
  useEffect(() => {
    let active = true;
    import(/* turbopackIgnore: true */ '/dashboard/js/rolling-number.js').then(({ rollCurrency }) => {
      if (active) rollCurrency(amount.current, value);
    });
    return () => { active = false; };
  }, [value]);
  return <strong className="rac-total" ref={amount}>${number(value)}</strong>;
}

export default function Overview() {
  const account = useWorkspaceAccount();
  const [result, setResult] = useState(null);
  const [attempt, retry] = useState(0);
  const admin = account === 'tpw';
  useEffect(() => {
    if (!account) return;
    let active = true;
    async function load() {
      const { loadDashboard, existingPrograms, participantHistory } = await import(/* turbopackIgnore: true */ '/team-dashboard/js/data.js');
      if (admin) {
        const response = await fetch('/api/overview');
        if (!response.ok) throw new Error('Overview request failed');
        return response.json();
      }
      const data = await loadDashboard(account);
      const programs = existingPrograms(data.submissions);
      const quarters = new Map();
      for (const point of participantHistory(data.submissions)) {
        const [year, month] = point.day.split('-');
        const quarterLabel = `Q${Math.ceil(Number(month) / 3)} ${year}`;
        quarters.set(quarterLabel, { ...point, quarterLabel });
      }
      return {
        name: data.org.name, programCount: programs.length, submissionCount: data.submissions.length,
        facilityCount: new Set(programs.flatMap(program => program.assignments.map(assignment => assignment.code))).size,
        participants: programs.reduce((sum, program) => sum + Number(program.participants || 0), 0),
        hours: programs.reduce((sum, program) => sum + Number(program.courseHours || 0) * Number(program.participantsCompleted || 0), 0),
        racDays: programs.reduce((sum, program) => sum + Math.min(40, Math.floor(Number(program.courseHours || 0) / 52) * 10) * Number(program.participantsCompleted || 0), 0),
        breakdown: programs.map(program => {
          const hours = Math.max(0, Number(program.courseHours) || 0);
          const completed = Math.max(0, Math.floor(Number(program.participantsCompleted) || 0));
          const daysPerEnrollment = Math.min(40, Math.floor(hours / 52) * 10);
          return { name: program.name, hours, completed, daysPerEnrollment };
        }),
        points: [...quarters.values()]
      };
    }
    load().then(data => { if (active) setResult({ account, attempt, data }); })
      .catch(() => { if (active) setResult({ account, attempt, error: true }); });
    return () => { active = false; };
  }, [account, admin, attempt]);
  const current = result?.account === account && result.attempt === attempt ? result : null;
  const data = current?.data;
  const metrics = data ? [
    ...(admin ? [['Registered organizations', data.organizationCount, '/team-dashboard/organizations.html#tpw']] : []),
    ['Programs', data.programCount, `/team-dashboard/programs.html#${account}`],
    ['Facilities', data.facilityCount], ['Submissions', data.submissionCount], ['Total participants', data.participants],
    ...(admin ? [['Participants completed', data.completed], ['Completion rate', data.completionRate == null ? '—' : `${data.completionRate.toFixed(1)}%`]] : []),
    ['Total hours completed', data.hours]
  ] : [];
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Overview</h1>{account && <DashboardExports key={account} account={account} />}</div></section>
    {account && <div className="shell dashboard-content"><div className="view-heading"><div>
      <span className="account-label">{admin ? 'TPW overview' : 'Organization'}</span>
      <h2 id="profile-heading">{admin ? 'Collective overview' : data?.name || (account === 'org-1' ? 'Org 1' : 'Org 2')}</h2>
    </div><Link className="action switch" href="/dashboard/?entry=team">Switch view ↗</Link></div></div>}
    {!account ? <Link href="/dashboard/?entry=team">Choose an account</Link> : current?.error ?
      <p role="alert">Could not load Overview. <button onClick={() => retry(attempt + 1)}>Try again</button></p> :
      !data ? <div aria-busy="true" className="dashboard-overview"><div className="program-stats">{Array.from({length: admin ? 8 : 5}, (_, index) => <div className="program-stat" key={index}><span className="skeleton-block" style={{height: 30}} /></div>)}</div><div className="participants-chart skeleton-plot" aria-label="Loading overview" /></div> :
      <>
        <div className="dashboard-overview"><div className="program-stats">{metrics.map(([label, value, href]) => {
          const content = <><strong>{typeof value === 'string' ? value : number(value)}</strong><span>{label}</span></>;
          return href ? <Link key={label} className="program-stat" href={href}>{content}</Link> : <div key={label} className="program-stat">{content}</div>;
        })}</div><Trends points={data.points} /></div>
        <section className="rac-panel">
          <div className="rac-heading"><h3>Estimated RAC credit days</h3><span className="rac-label">Standard activity · Scenario estimate</span></div>
          <div className="rac-orgs">{data.programCount ? <div className="rac-pair">
            <article className="rac-org"><h4>{admin ? 'Total RAC credits' : data.name}</h4>
              <strong className="rac-total">{number(data.racDays)}</strong><span className="rac-unit">estimated calendar days of credit</span>
              {!admin && <details><summary>See calculation</summary>{data.breakdown.map(({name, hours, completed, daysPerEnrollment}, index) =>
                <div className="rac-calculation" key={index}><strong>{name}</strong><span>{hours} hours → {daysPerEnrollment} days × {completed} completed enrollments = {number(daysPerEnrollment * completed)} days</span></div>
              )}</details>}
            </article>
            <article className="rac-org savings-card"><h4>Estimated taxpayer savings</h4>
              <Savings key={account} value={data.racDays * 59} />
              <span className="rac-unit">{number(data.racDays)} estimated RAC days × daily cost</span>
              <a className="savings-source" href="https://www.lao.ca.gov/PolicyAreas/CJ/6_cj_inmatecost">Rate: LAO marginal cost, $21,534/year ÷ 365 (rounded)</a>
            </article>
          </div> : <p>No program data available to estimate credits.</p>}</div>
          <a href="https://www.cdcr.ca.gov/proposition57/">CDCR credit-earning rules</a>
        </section>
      </>}
  </div></main>;
}
