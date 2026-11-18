'use client';

import { LuArrowDown, LuArrowLeft, LuArrowUp, LuArrowUpDown } from 'react-icons/lu';

import { useEffect, useState } from 'react';
import { DashboardExports } from './controls.jsx';
import Link from 'next/link';
import { useWorkspaceAccount } from './workspace.jsx';

const columns = [
  ['organization', 'Organization'], ['name', 'Program'], ['status', 'Status'],
  ['prison', 'Facility'], ['yards', 'Yards'], ['startDate', 'Start date'], ['endDate', 'End date'],
  ['courseHours', 'Course hours'], ['participants', 'Participants'], ['participantsCompleted', 'Completed']
];
const metrics = columns.slice(-3);
const number = value => Number(value || 0).toLocaleString();

export function ProgramCard({ program, staff }) {
  return <article className="existing-program">
    {staff && <span className="program-owner">{program.organization}</span>}
    <h3>{program.name}</h3>
    <span className="program-status" data-status={program.status}>{program.status || 'Not specified'}</span>
    <div className="program-locations">{program.assignments.map(({ code, yards }) =>
      <div key={code} className="program-location"><strong>{program.prisons.find(item => item.code === code)?.name || code}</strong><span>Yards: {yards.join(', ') || 'Not specified'}</span></div>
    )}</div>
    <div className="program-date-range">{columns.slice(5, 7).map(([key, label]) =>
      <div key={key}><span>{label}</span><strong>{program[key] || 'Not specified'}</strong></div>
    )}</div>
    <div className="program-card-metrics">{metrics.map(([key, label]) =>
      <div key={key}><strong>{number(program[key])}</strong><span>{label}</span></div>
    )}</div>
  </article>;
}

export default function ProgramsPage() {
  const account = useWorkspaceAccount();
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Programs</h1><p>All your program details in one place.</p>{account && <DashboardExports key={account} account={account} />}</div></section>
    {account ? <Register key={account} account={account} /> : <Link href="/sign-in/">Choose an account</Link>}
  </div></main>;
}

function Register({ account }) {
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams({ view, search, page, sort: sort.key, direction: sort.direction });
  if (account !== 'tpw') query.set('org', account);
  const requestKey = query.toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/programs?' + requestKey, { signal: controller.signal });
        if (!response.ok) throw new Error('Programs request failed');
        const data = await response.json();
        if (!controller.signal.aborted) setResult({ requestKey, attempt, data });
      } catch {
        if (!controller.signal.aborted) setResult({ requestKey, attempt, error: true });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, attempt]);
  const current = result?.requestKey === requestKey && result.attempt === attempt ? result : null;
  const data = current?.data;
  return <div className="shell program-page">
    <div className="view-heading">
      <div><span className="account-label">{{ 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' }[account]}</span>
        <h2 id="table-heading">Existing programs</h2>
        <p id="program-count" role="status">{data ? `${data.count} of ${data.total} ${view === 'table' ? 'facility assignments' : 'programs'}` : current?.error ? 'Could not load programs.' : 'Loading programs…'}</p>
      </div>
      <Link className="action switch" href={`/team-dashboard/#${account}`}><LuArrowLeft aria-hidden="true" size={16} /> Dashboard</Link>
    </div>
    <div className="program-toolbar">
      <div className="view-toggle" role="group" aria-label="Program display">{[['table', 'Table view'], ['cards', 'Card view']].map(([key, label]) =>
        <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setPage(1); }}>{label}</button>
      )}</div>
      <label className="table-search">Search programs<input type="search" placeholder="Search programs, facilities, or yards" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
    </div>
    {current?.error && <button onClick={() => retry(attempt + 1)}>Try again</button>}
    {!current && <div className="skeleton-block" style={{ minHeight: 160 }} aria-hidden="true" />}
    {data && (data.items.length === 0 ? <p>{data.total ? 'No programs match your search.' : 'No programs have been submitted yet.'}</p> :
      view === 'cards' ? <div className="existing-program-grid">{data.items.map(program =>
        <ProgramCard key={JSON.stringify([program.orgId || program.organization || program.submissionId, program.id || program.name.trim().toLowerCase()])} program={program} staff={account === 'tpw'} />)}</div> :
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable program register"><table className="program-table">
        <caption>One row per program and facility assignment. Program totals repeat across its facilities.</caption>
        <thead><tr><th scope="col" aria-label="Row number">#</th>{columns.map(([key, label]) => {
          const SortIcon = key !== sort.key ? LuArrowUpDown : sort.direction === 'asc' ? LuArrowUp : LuArrowDown;
          return <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
            <button onClick={() => { setSort({ key, direction: key === sort.key && sort.direction === 'asc' ? 'desc' : 'asc' }); setPage(1); }}>{label} <SortIcon size={14} aria-hidden="true" style={{ flexShrink: 0, alignSelf: 'center' }} /></button>
          </th>;
        })}</tr></thead>
        <tbody>{data.items.map((row, index) => <tr key={data.offset + index}><td className="row-number">{data.offset + index + 1}</td>{columns.map(([key]) =>
          <td key={key} className={metrics.some(([metric]) => metric === key) ? 'numeric' : key === 'name' ? 'program-name' : undefined}>{key === 'status' ? <span className="program-status" data-status={row.status}>{row.status || 'Not specified'}</span> :
            metrics.some(([metric]) => metric === key) ? number(row[key]) : row[key] || '—'}</td>)}</tr>)}</tbody>
      </table></div>)}
    {data?.pages > 1 && <nav className="tracker-pagination" aria-label="Results pages">
      <button disabled={data.page === 1} onClick={() => setPage(data.page - 1)}>Previous</button>
      <span>Page {data.page} of {data.pages}</span>
      <button disabled={data.page === data.pages} onClick={() => setPage(data.page + 1)}>Next</button>
    </nav>}
  </div>;
}
