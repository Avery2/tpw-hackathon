'use client';

import Link from 'next/link';
import { LuArrowLeft, LuArrowRight, LuChevronRight, LuFileText, LuTable2 } from 'react-icons/lu';
import { useEffect, useState } from 'react';
import { recentQuarterStatus } from '../../../lib/reporting/submission-tracker.js';
import { useWorkspaceAccount } from './workspace.jsx';

const heading = period => `Q${period.quarter} ${period.year}`;
const orgLink = org => `/team-dashboard/organizations/?org=${encodeURIComponent(org.id)}#tpw`;
const defaults = { search: '', quarter: 'all', status: 'all', size: 10 };

export default function Submissions() {
  const account = useWorkspaceAccount();
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Submissions</h1></div></section>
    {account === 'tpw' ? <SubmissionTracker /> : account ? <section className="submission-choices" aria-labelledby="submission-choice-heading">
      <h2 id="submission-choice-heading">What would you like to do?</h2>
      <p>Explore what you’ve submitted or turn it into a report.</p>
      <div className="submission-choice-grid">
        <Link className="submission-choice" href={`/team-dashboard/submission-data/#${account}`}>
          <ChoiceIcon /><strong>View your data</strong><span>Browse your submissions and program details.</span>
          <span className="choice-next" aria-hidden="true">Explore data <LuArrowRight size={14} /></span>
        </Link>
        <button type="button" className="submission-choice"><ChoiceIcon report /><strong>Generate a report</strong>
          <span>Bring your program activity and impact together.</span><span className="choice-next" aria-hidden="true">Create report <LuArrowRight size={14} /></span>
        </button>
      </div>
    </section> : <Link href="/sign-in/">Choose an account</Link>}
  </div></main>;
}

export function ChoiceIcon({ report }) {
  const Icon = report ? LuFileText : LuTable2;
  return <span className={report ? 'choice-icon report-icon' : 'choice-icon'} aria-hidden="true">
    <Icon />
  </span>;
}

export function SubmissionTracker() {
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/submission-tracking', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Tracking request failed');
      return response.json();
    }).then(data => {
      if (!controller.signal.aborted) setResult({ attempt, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ attempt, error: true });
    });
    return () => controller.abort();
  }, [attempt]);
  const current = result?.attempt === attempt ? result : null;
  return <section id="submission-tracker" className="submission-tracker" aria-busy={!current}>
    {!current && <p role="status">Loading submission tracking…</p>}
    {current?.error && <p role="alert">Could not load submission tracking. <button onClick={() => retry(attempt + 1)}>Try again</button></p>}
    {current?.data && <TrackingResults data={current.data} />}
  </section>;
}

function TrackingResults({ data }) {
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const periods = recentQuarterStatus(data.orgs, data.submissions);
  const flags = periods.map(period => new Map(period.statuses.map(({ org, submitted }) => [org.id, submitted])));
  const selected = filters.quarter === 'all' ? flags : [flags[Number(filters.quarter)]];
  const orgs = data.orgs.filter(org => org.name?.trim());
  const filtered = orgs.filter(org => org.name.toLowerCase().includes(filters.search.trim().toLowerCase()) &&
    (filters.status === 'all' || (filters.status === 'missing' ? selected.some(flag => !flag.get(org.id)) :
      selected.every(flag => flag.get(org.id))))).sort((a, b) => a.name.localeCompare(b.name));
  const size = Number(filters.size);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const start = (page - 1) * size;
  const visible = filtered.slice(start, start + size);
  const change = key => event => { setFilters({ ...filters, [key]: event.target.value }); setPage(1); };
  return <>
    <h2>Quarterly submission tracking</h2>
    <p className="tracker-description">The two most recently completed quarters. Counts include registered organizations; older records without a reporting quarter use their submission date.</p>
    <div className="tracker-quarter-grid">{periods.map(period => {
      const missing = period.statuses.filter(status => !status.submitted);
      return <article key={heading(period)} className="tracker-quarter"><h3>{heading(period)}</h3>
        <div className="tracker-counts">
          <div className="tracker-submitted-count"><strong>{period.submitted}</strong><span>Submitted</span></div>
          <div className="tracker-missing-count"><strong>{period.missing}</strong><span>Not submitted</span></div>
        </div>
        <details><summary className="dashboard-disclosure"><LuChevronRight aria-hidden="true" />{missing.length ? 'Organizations that haven’t submitted' : 'All organizations submitted'}</summary>
          {!!missing.length && <ul className="followup-grid">{missing.map(({ org }) =>
            <li key={org.id}><Link href={orgLink(org)}>{org.name}</Link></li>)}</ul>}
        </details>
      </article>;
    })}</div>
    <div className="tracker-toolbar">
      <label>Search organizations<input type="search" placeholder="Organization name" value={filters.search} onChange={change('search')} /></label>
      <label>Quarter<select value={filters.quarter} onChange={change('quarter')}><option value="all">Both quarters</option>
        {periods.map((period, index) => <option key={heading(period)} value={index}>{heading(period)}</option>)}</select></label>
      <label>Submission status<select value={filters.status} onChange={change('status')}>
        <option value="all">All statuses</option><option value="missing">Missing submission</option><option value="submitted">Submitted</option>
      </select></label>
      <label>Rows per page<select value={filters.size} onChange={change('size')}>{[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={() => { setFilters({ ...defaults, size }); setPage(1); }}>Clear filters</button>
    </div>
    <div aria-live="polite">
      <p className="tracker-result-count">{filtered.length ? `Showing ${start + 1}–${start + visible.length} of ${filtered.length} organizations` : 'No organizations match these filters.'}</p>
      {!!filtered.length && <>
        <div className="tracker-table-wrap"><table className="tracker-table">
          <thead><tr><th scope="col">Organization</th>{periods.map(period => <th scope="col" key={heading(period)}>{heading(period)}</th>)}</tr></thead>
          <tbody>{visible.map(org => <tr key={org.id}><th scope="row"><Link href={orgLink(org)}>{org.name}</Link></th>
            {flags.map((flag, index) => <td key={heading(periods[index])}><span className={flag.get(org.id) ? 'tracker-status submitted' : 'tracker-status missing'}>
              {flag.get(org.id) ? 'Submitted' : 'Needs follow-up'}</span></td>)}
          </tr>)}</tbody>
        </table></div>
        <nav className="tracker-pagination" aria-label="Organization status pages">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><LuArrowLeft size={14} aria-hidden="true" /> Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>Next <LuArrowRight size={14} aria-hidden="true" /></button>
        </nav>
      </>}
    </div>
    {!orgs.length && <p>No registered organizations yet.</p>}
  </>;
}
