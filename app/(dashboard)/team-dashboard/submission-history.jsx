'use client';

import { LuArrowLeft, LuChevronRight } from 'react-icons/lu';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWorkspaceAccount } from './workspace.jsx';

const empty = { from: '', to: '', quarter: '', year: '' };
const format = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const period = ({ reportingPeriod: p }) => p?.quarter ? `Q${p.quarter} ${p.year}` : 'Submission';
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not recorded';

async function request(query, signal) {
  const response = await fetch('/api/submissions?' + query, { signal });
  if (!response.ok) throw new Error('Submission request failed');
  return response.json();
}

export default function SubmissionHistory() {
  const account = useWorkspaceAccount();
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Your submissions</h1></div></section>
    {account ? <History key={account} account={account} /> : <Link href="/sign-in/">Choose an account</Link>}
  </div></main>;
}

// Shared by /team-dashboard/submissions/ (inline, under the Submissions heading) and the legacy
// /team-dashboard/submission-data/ route.
export function History({ account, inline = false }) {
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState('cards');
  const [result, setResult] = useState(null);
  const [attempt, retry] = useState(0);
  const invalid = filters.from && filters.to && filters.from > filters.to;
  const query = new URLSearchParams({ ...filters, page });
  if (account !== 'tpw') query.set('org', account);
  const key = query.toString();
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    request(key, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, attempt, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, attempt, error: true });
    });
    return () => controller.abort();
  }, [key, attempt, invalid]);
  const current = !invalid && result?.key === key && result.attempt === attempt ? result : null;
  const data = current?.data;
  const years = [...new Set([...(result?.data?.years || []).map(String), ...(filters.year ? [filters.year] : [])])];
  const change = name => event => {
    setFilters({ ...filters, [name]: event.target.value });
    setPage(1);
  };
  const active = Boolean(filters.from || filters.to || filters.quarter || filters.year);
  return <div className="shell">
    {inline && <h2 className="submission-history-heading">Your submission history</h2>}
    <div className="history-toolbar">
      <p id="submission-status" role="status">
        {invalid ? 'The end date must be on or after the start date.' : current?.error ? 'Could not load submissions.' :
          data ? `${data.count} of ${data.total} submissions` : 'Loading submissions…'}
      </p>
      <div className="view-toggle" role="group" aria-label="Submission display">
        {['cards', 'table'].map(view => <button key={view} aria-pressed={mode === view} onClick={() => setMode(view)}>{view === 'cards' ? 'Card view' : 'Table view'}</button>)}
      </div>
      {!inline && <Link id="submission-back" className="action" href={`/team-dashboard/submissions/#${account}`}><LuArrowLeft aria-hidden="true" size={16} /> Submissions</Link>}
    </div>
    <details className="history-filters">
      <summary>Filter submissions{active ? ' (filters applied)' : ''}</summary>
      <section className="submission-filters" aria-label="Filter submissions">
        <label>From<input type="date" value={filters.from} onChange={change('from')} /></label>
        <label>To<input type="date" value={filters.to} onChange={change('to')} /></label>
        <label>Quarter<select value={filters.quarter} onChange={change('quarter')}><option value="">All quarters</option>
          {[1, 2, 3, 4].map(quarter => <option key={quarter} value={quarter}>Q{quarter}</option>)}</select></label>
        <label>Year<select value={filters.year} onChange={change('year')}><option value="">All years</option>
          {years.map(year => <option key={year}>{year}</option>)}</select></label>
        <button type="button" onClick={() => { setFilters(empty); setPage(1); }}>Clear filters</button>
      </section>
    </details>
    <div id="submission-summary" className="submission-summary">{data && [['Submissions', data.count], ['Programs', data.totals.programs], ['Participants', data.totals.participants], ['Hours completed', data.totals.hours]].map(([label, value]) =>
      <div key={label}><strong>{format(value)}</strong><span>{label}</span></div>)}</div>
    <div id="submission-results" aria-live="polite" aria-busy={!invalid && !current}>
      {!invalid && !current && <HistorySkeleton mode={mode} />}
      {current?.error && <button onClick={() => retry(attempt + 1)}>Try again</button>}
      {data && <>
        <p className="data-totals-note">Program totals use the latest version of each program within your filters. One entry per organization per quarter.</p>
        {!data.items.length ? <p className="table-empty">No submissions match these filters.</p> : mode === 'table' ?
          <SubmissionTable records={data.items} /> : <div className="submission-data-grid">{data.items.map(record =>
            <SubmissionCard key={record.key} record={record} account={account} />)}</div>}
        {data.pages > 1 && <nav className="tracker-pagination" aria-label="Results pages">
          <button disabled={data.page === 1} onClick={() => setPage(data.page - 1)}>Previous</button>
          <span>Page {data.page} of {data.pages}</span>
          <button disabled={data.page === data.pages} onClick={() => setPage(data.page + 1)}>Next</button>
        </nav>}
      </>}
    </div>
  </div>;
}

function SubmissionTable({ records }) {
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Submission table">
    <table className="program-table submission-table"><thead><tr>
      {['Submitted', 'Organization', 'Reporting quarter', 'Programs', 'Facilities', 'Participants', 'Completed', 'Hours completed']
        .map(label => <th scope="col" key={label}>{label}</th>)}
    </tr></thead><tbody>{records.map(record => <tr key={record.key}>
      {[date(record.submittedAt), record.organization || '—', period(record) + (record.reportingPeriod?.inferred ? ' (by date)' : ''),
        ...[record.metrics.programs, record.facilities, record.metrics.participants, record.metrics.completed, record.metrics.hours].map(format)]
        .map((value, index) => <td key={index}>{value}</td>)}
    </tr>)}</tbody></table>
  </div>;
}

function SubmissionCard({ record, account }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  async function loadDetails(event) {
    if (!event.currentTarget.open || loading || Array.isArray(details)) return;
    setLoading(true);
    const query = new URLSearchParams({ detail: record.key });
    if (account !== 'tpw') query.set('org', account);
    try { setDetails((await request(query)).programs); }
    catch { setDetails('Could not load programs. Close and reopen to try again.'); }
    finally { setLoading(false); }
  }
  const { metrics, facilities } = record;
  return <article className="submission-data-card">
    <header><div><h3>{period(record)}</h3><span className="submission-date">Last updated {date(record.submittedAt)}</span>
      {account === 'tpw' && <div>{record.organization || 'Organization'}</div>}
    </div></header>
    <div className="submission-card-metrics">{[['Participants', metrics.participants], ['Completed', metrics.completed], ['Hours completed', metrics.hours]].map(([label, value]) =>
      <div key={label}><strong>{format(value)}</strong><span>{label}</span></div>)}</div>
    <details onToggle={loadDetails}>
      <summary className="dashboard-disclosure"><LuChevronRight aria-hidden="true" />{metrics.programs} {metrics.programs === 1 ? 'program' : 'programs'} · {facilities} {facilities === 1 ? 'facility' : 'facilities'}</summary>
      {loading ? <p>Loading programs…</p> : Array.isArray(details) ? <ul>{details.map((program, index) =>
        <li key={index}><strong>{program.name}</strong><div>{program.assignments.map(({ code, yards }) =>
          `${program.prisons.find(facility => facility.code === code)?.name || code}: ${yards.join(', ')}`).join(' · ')}</div>
          <div>{program.status || 'No status'} · {format(program.participants)} participants · {format(program.participantsCompleted)} completed</div>
        </li>)}</ul> : <p>{details}</p>}
    </details>
  </article>;
}

function HistorySkeleton({ mode }) {
  const table = mode === 'table';
  return <div className={`page-skeleton page-skeleton-${mode}`} aria-hidden="true">
    {table ? <div className="skeleton-table">
      {Array.from({ length: 7 }, (_, row) => <div className="skeleton-table-row" key={row}>
        {Array.from({ length: 6 }, (_, column) => <div className="skeleton-block skeleton-cell" key={column} />)}
      </div>)}
    </div> : <div className="existing-program-grid">
      {Array.from({ length: 4 }, (_, index) => <div className="existing-program" key={index}>
        {['title', 'label', 'field', 'description', 'field'].map((part, position) =>
          <div className={`skeleton-block skeleton-${part}`} key={position} />)}
      </div>)}
    </div>}
  </div>;
}
