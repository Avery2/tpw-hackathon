'use client';

import Link from 'next/link';
import { LuArrowLeft, LuArrowRight, LuChevronRight } from 'react-icons/lu';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChoiceIcon } from './submissions.jsx';
import { ProgramCard } from './programs.jsx';
import { Savings, Trends } from './overview.jsx';
import { useWorkspaceAccount } from './workspace.jsx';

const directory = '/team-dashboard/organizations/';
const format = value => Number(value || 0).toLocaleString();
const metrics = [['programs', 'Programs'], ['facilities', 'Facilities'], ['participants', 'Participants'], ['hours', 'Hours completed']];
const date = value => value ? new Date(value).toLocaleDateString() : 'No submissions yet';

function Metrics({ totals, fields = metrics }) {
  return fields.map(([key, label]) => <div key={key}><strong>{format(totals[key])}</strong><span>{label}</span></div>);
}

export default function Organizations() {
  const account = useWorkspaceAccount();
  const id = useSearchParams().get('org');
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Organizations</h1></div></section>
    {account === 'tpw' ? <Directory key={id || 'directory'} id={id} /> : <Link href="/sign-in/">Choose TPW View</Link>}
  </div></main>;
}

function CreateOrganization({ mode, setMode, onCreate }) {
  const [staff, setStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/pilot-account/', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => setStaff(Boolean(data?.staff)))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/staff-organizations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setInvite(new URL('/accept-invite/?id=' + data.invitationId, location.origin).href);
      setMessage('Organization created. Share this link with its first admin.');
      form.reset();
      onCreate();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'directory') return null;
  if (mode === 'choices') return <section className="submission-choices" aria-labelledby="submission-choice-heading">
    <h2 id="submission-choice-heading">What would you like to do?</h2>
    <div className="submission-choice-grid" style={{ marginBlockStart: 28 }}>
      {staff && <button type="button" className="submission-choice" onClick={() => {
        setMessage('');
        setInvite('');
        setMode('create');
      }}>
        <ChoiceIcon report /><strong>Create New Org</strong><span>Set up an organization and invite its first admin.</span>
      </button>}
      <button type="button" className="submission-choice" onClick={() => setMode('directory')}>
        <ChoiceIcon /><strong>View Orgs</strong><span>Browse organizations and their reporting data.</span>
      </button>
    </div>
  </section>;
  if (!staff) return null;
  return <section className="organization-onboarding" aria-labelledby="organization-onboarding-heading">
    <div className="view-heading">
      <h2 id="organization-onboarding-heading">Create an organization</h2>
      <button type="button" className="action switch" disabled={busy} onClick={() => setMode('choices')}><LuArrowLeft size={16} aria-hidden="true" /> Back</button>
    </div>
    <form onSubmit={submit}>
      <label>Organization name<input name="name" autoFocus required maxLength={200} /></label>
      <label>First admin email<input name="email" type="email" required maxLength={254} /></label>
      <button type="submit" className="action" disabled={busy}>{busy ? 'Creating…' : 'Create organization'}</button>
    </form>
    <p role="status">{message}</p>
    {invite && <div className="organization-invite">
      <label>First admin invite link<input value={invite} readOnly /></label>
      <button type="button" className="action switch" onClick={async () => {
        try {
          await navigator.clipboard.writeText(invite);
          setMessage('Invite link copied.');
        } catch {
          setMessage('Select the invite link to copy it.');
        }
      }}>Copy invite link</button>
    </div>}
    <style>{`
      .organization-onboarding { margin: 0 0 24px; padding: 20px; border: 1px solid #dce3da; border-radius: 12px; background: #f5f8f4; }
      .organization-onboarding { animation: organization-slide-in 280ms ease-out both; }
      .dashboard-layout .organization-onboarding .view-heading .action.switch { display: inline-flex; }
      @keyframes organization-slide-in { from { opacity: 0; transform: translateX(24px); } }
      @media (prefers-reduced-motion: reduce) { .organization-onboarding { animation: none; } }
      .dashboard-layout .organization-onboarding .view-heading .action.switch { display: inline-flex; }
      .organization-onboarding form, .organization-invite { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
      .organization-onboarding label { display: grid; flex: 1 1 200px; gap: 6px; font-weight: 700; }
      .organization-onboarding input { min-width: 0; border: 1px solid #b7c5b4; border-radius: 8px; padding: 8px 12px; font: inherit; background: white; }
      .organization-onboarding [role="status"]:empty { display: none; }
    `}</style>
  </section>;
}

function Directory({ id }) {
  const [mode, setMode] = useState('choices');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('cards');
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState(null);
  const query = id ? new URLSearchParams({ org: id }) : new URLSearchParams({ search, view, page });
  const url = `/api/${id ? 'dashboard' : 'organizations'}?${query}`;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Organization request failed');
        let data = await response.json();
        if (id) {
          const { existingPrograms, participantHistory } = await import(/* turbopackIgnore: true */ '/team-dashboard/js/data.js');
          const programs = existingPrograms(data.submissions);
          const points = new Map();
          for (const point of participantHistory(data.submissions)) {
            const [year, month] = point.day.split('-');
            const quarterLabel = `Q${Math.ceil(Number(month) / 3)} ${year}`;
            points.set(quarterLabel, { ...point, quarterLabel });
          }
          data = { ...data, programs, points: [...points.values()] };
        }
        if (!controller.signal.aborted) setResult({ url, attempt, data });
      } catch {
        if (!controller.signal.aborted) setResult({ url, attempt, error: true });
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, url, attempt]);
  const current = result?.url === url && result.attempt === attempt ? result : null;
  const data = current?.data;
  return <>
    {!id && <CreateOrganization mode={mode} setMode={setMode} onCreate={() => {
      setPage(1);
      setSearch('');
      retry(n => n + 1);
    }} />}
    <div hidden={!id && mode !== 'directory'}>
    <div className="view-heading"><div>
      <h2 id="org-page-heading">{id && data ? data.org.name : 'Organization directory'}</h2>
      <p id="org-status" role="status">{current?.error ? 'Could not load organization data.' : !data ? 'Loading organizations…' :
        id ? 'Organization overview' : data.count ? `Showing ${data.offset + 1}–${data.offset + data.items.length} of ${data.count} organizations` : '0 organizations'}</p>
    </div>{id && <Link id="org-back" className="action switch" href={directory + '#tpw'}><LuArrowLeft size={16} aria-hidden="true" /> All organizations</Link>}
    {!id && <button type="button" className="action switch" style={{ display: 'inline-flex' }} onClick={() => setMode('choices')}><LuArrowLeft size={16} aria-hidden="true" /> Back</button>}</div>
    {!id && <>
      <label id="org-search-label" className="org-search">Find an organization<input id="org-search" type="search" placeholder="Search by organization name" value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <div id="org-view-toggle" className="view-toggle" role="group" aria-label="Organization display" style={{ marginBottom: 24 }}>
        {['cards', 'table'].map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); setPage(1); }}>
          {mode === 'cards' ? 'Card view' : 'Table view'}
        </button>)}
      </div>
    </>}
    <div id="org-results" aria-live="polite" aria-busy={!current}>
      {!current && <div className="skeleton-block" style={{ minHeight: 160 }} />}
      {current?.error && <button type="button" onClick={() => retry(attempt + 1)}>Try again</button>}
      {data && (id ? <OrganizationDetail data={data} /> : <Results data={data} view={view} setPage={setPage} />)}
    </div>
    </div>
  </>;
}

function Results({ data, view, setPage }) {
  if (!data.items.length) return <p className="table-empty">No organizations match your search.</p>;
  const href = id => `${directory}?org=${encodeURIComponent(id)}#tpw`;
  return <>
    {view === 'cards' ? <div className="org-directory">{data.items.map(({ org, totals, latest }) =>
      <Link href={href(org.id)} className="org-card" key={org.id}><h3>{org.name}</h3>
        <div className="org-metrics"><Metrics totals={totals} fields={metrics.slice(0, 3)} /></div>
        <p className="org-updated">{latest ? 'Latest submission · ' : ''}{date(latest)}</p>
        <span className="org-open">View organization <LuArrowRight size={14} aria-hidden="true" /></span>
      </Link>)}</div> :
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Organization directory table"><table className="program-table" style={{ minWidth: 800 }}>
        <thead><tr>{['Organization', ...metrics.map(([, label]) => label), 'Latest submission'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.items.map(({ org, totals, latest }) => <tr key={org.id}><td><Link href={href(org.id)}>{org.name}</Link></td>
          {metrics.map(([key]) => <td key={key}>{format(totals[key])}</td>)}<td>{date(latest)}</td></tr>)}</tbody>
      </table></div>}
    {data.pages > 1 && <nav className="tracker-pagination" aria-label="Organization pages">
      <button disabled={data.page === 1} onClick={() => setPage(data.page - 1)}><LuArrowLeft size={14} aria-hidden="true" /> Previous</button>
      <span>Page {data.page} of {data.pages}</span>
      <button disabled={data.page === data.pages} onClick={() => setPage(data.page + 1)}>Next <LuArrowRight size={14} aria-hidden="true" /></button>
    </nav>}
  </>;
}

function OrganizationDetail({ data }) {
  const { org, programs, points } = data;
  const breakdown = programs.map(program => {
    const hours = Math.max(0, Number(program.courseHours) || 0);
    const completed = Math.max(0, Math.floor(Number(program.participantsCompleted) || 0));
    const perEnrollment = Math.min(40, Math.floor(hours / 52) * 10);
    return { program, hours, completed, perEnrollment, days: perEnrollment * completed };
  });
  const days = breakdown.reduce((sum, item) => sum + item.days, 0);
  const totals = {
    programs: programs.length,
    facilities: new Set(programs.flatMap(program => program.assignments.map(assignment => assignment.code))).size,
    participants: programs.reduce((sum, program) => sum + Number(program.participants || 0), 0),
    hours: breakdown.reduce((sum, item) => sum + item.hours * item.completed, 0)
  };
  return <>
    <div className="org-detail-stats"><Metrics totals={totals} /></div>
    <Trends points={points} />
    <section className="rac-panel">
      <div className="rac-heading"><h3>Estimated RAC credit days</h3><span className="rac-label">Standard activity · Scenario estimate</span></div>
      <div className="rac-orgs">{programs.length ? <div className="rac-pair">
        <article className="rac-org"><h4>{org.name}</h4><strong className="rac-total">{format(days)}</strong>
          <span className="rac-unit">estimated calendar days of credit</span>
          <details><summary className="dashboard-disclosure"><LuChevronRight aria-hidden="true" />See calculation</summary>{breakdown.map(({ program, hours, completed, perEnrollment, days }, index) =>
            <div className="rac-calculation" key={index}><strong>{program.name}</strong><span>{hours} hours → {perEnrollment} days × {completed} completed enrollments = {format(days)} days</span></div>)}</details>
        </article>
        <article className="rac-org savings-card"><h4>Estimated taxpayer savings</h4><Savings value={days * 59} />
          <span className="rac-unit">{format(days)} estimated RAC days × daily cost</span>
          <a className="savings-source" href="https://www.lao.ca.gov/PolicyAreas/CJ/6_cj_inmatecost">Rate: LAO marginal cost, $21,534/year ÷ 365 (rounded)</a>
        </article>
      </div> : <p>No program data available to estimate credits.</p>}</div>
      <a href="https://www.cdcr.ca.gov/proposition57/">CDCR credit-earning rules</a>
    </section>
    <h3>Programs</h3>
    {programs.length ? <div className="existing-program-grid">{programs.map((program, index) => <ProgramCard key={program.id || index} program={program} />)}</div> :
      <p className="table-empty">No programs submitted yet.</p>}
  </>;
}
