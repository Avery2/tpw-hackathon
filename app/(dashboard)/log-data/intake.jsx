'use client';

import { LuCheck, LuChevronRight, LuCircleAlert, LuPlus, LuX } from 'react-icons/lu';

import { useEffect, useRef, useState } from 'react';
import { currentReportingPeriod } from '../../../lib/reporting/reporting-period.js';

function SuccessMetric({ value, label, roll }) {
  const amount = useRef(null);
  useEffect(() => {
    if (!roll || !value) return;
    let active = true;
    import('../../../lib/animations/rolling-number.js').then(({ rollNumber, rollCurrency }) => {
      if (active) (roll === 'currency' ? rollCurrency : rollNumber)(amount.current, value);
    }).catch(console.error);
    return () => { active = false; };
  }, [roll, value]);
  return <div className="success-metric">
    <strong ref={amount}>{roll === 'currency' ? '$' : ''}{value.toLocaleString()}</strong>
    <span>{label}</span>
  </div>;
}

const facilityColors = [
  ['#157a45', '#e3f6ea'],
  ['#1d4ed8', '#e7efff'],
  ['#b45309', '#fff4d8'],
  ['#be185d', '#fde7f0'],
  ['#6d28d9', '#f3e8ff'],
  ['#c2410c', '#ffedd5'],
  ['#0f766e', '#e6f7f5'],
  ['#b91c1c', '#fee2e2'],
  ['#4d7c0f', '#ecfccb'],
  ['#3730a3', '#e0e7ff'],
  ['#a21caf', '#fae8ff'],
  ['#0e7490', '#e0f2fe']
];
function facilityStyle(index) {
  const [border, background] = facilityColors[Math.max(0, index) % facilityColors.length];
  return { '--prison': border, '--prison-bg': background };
}

const newProgram = () => ({ id: crypto.randomUUID(), name: '', status: '', startDate: '', endDate: '', courseHours: 0, sites: [] });
const counts = sites => sites.reduce((total, site) => ({
  participants: total.participants + Number(site.participants || 0),
  participantsCompleted: total.participantsCompleted + Number(site.completed || 0)
}), { participants: 0, participantsCompleted: 0 });
const isReady = program => Boolean(program.status) && program.sites.length > 0;

export default function Intake(props) {
  const [hashAccount, setHashAccount] = useState('');
  useEffect(() => {
    if (!props.allowHashAccount || new URLSearchParams(location.search).has('account')) return;
    const account = location.hash.slice(1);
    if (['org-1', 'org-2', 'tpw'].includes(account)) setHashAccount(account);
  }, [props.allowHashAccount]);
  const account = hashAccount || props.account;
  return <IntakeForm key={account} {...props} account={account} />;
}

// One scrolling report instead of a wizard: every section is on the page from the start, the
// organisation is resolved by the server for signed-in members, and prefill from the last report
// happens automatically. The only choice left is "start blank", which is a link, not a screen.
function IntakeForm({ account, blank, organizationName, facilities = [] }) {
  const [period, setPeriod] = useState(null);
  const [organization, setOrganization] = useState(organizationName ?? (account === 'tpw' ? '' : account === 'org-2' ? 'Org 2' : 'Org 1'));
  const [locations, setLocations] = useState([]);
  // Set as soon as the member edits anything, so a slow prefill response cannot overwrite it.
  const userChanged = useRef(false);
  const [programs, setPrograms] = useState([]);
  const [editing, setEditing] = useState(null);
  const [problems, setProblems] = useState([]);
  const [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [prefilling, setPrefilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [prefilledFrom, setPrefilledFrom] = useState(null);
  const [prefillAttempt, setPrefillAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const key = 'tpw.react.submission:' + account;

  useEffect(() => {
    const controller = new AbortController();
    setPeriod(currentReportingPeriod());
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) {
        setPending(saved);
        setPeriod(saved.submission.reportingPeriod);
        setOrganization(saved.submission.organization);
        setLocations(saved.submission.prisons);
        setPrograms(saved.submission.programs);
        setReceipt(saved.receipt || '');
        setDone(Boolean(saved.receipt));
        return;
      }
    } catch { setError('Could not read the saved attempt.'); }
    if (!blank && account !== 'tpw') {
      setPrefilling(true);
      setPrefillFailed(false);
      fetch('/api/dashboard/?org=' + account, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      }).then(data => {
        const submittedTime = entry => Date.parse(entry.receivedAt || entry.submittedAt || '') || 0;
        const [latest] = [...data.submissions].sort((first, second) =>
          submittedTime(second) - submittedTime(first));
        const locations = new Map((latest?.prisons || []).map(facility => [facility.code, { ...facility, yards: [...(facility.yards ?? [])] }]));
        const previous = (latest?.programs || []).map(program => {
          const sites = (program.assignments ?? []).flatMap(({ code, yards }) => {
            const entry = locations.get(code) || { code, name: code, yards: [] };
            entry.yards = [...new Set([...entry.yards, ...yards])];
            locations.set(code, entry);
            return yards.map(yard => ({ facilityCode: code, yard, participants: '', completed: '' }));
          });
          return { ...newProgram(), id: program.id || crypto.randomUUID(), name: program.name, courseHours: program.courseHours ?? 0, sites };
        });
        if (userChanged.current) return;
        setOrganization(data.org.name);
        setLocations([...locations.values()]);
        setPrograms(previous);
        if (latest?.reportingPeriod?.quarter) setPrefilledFrom(latest.reportingPeriod);

      }).catch(() => { if (!controller.signal.aborted) setPrefillFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setPrefilling(false); });
    }
    return () => controller.abort();
  }, [account, blank, key, prefillAttempt]);

  // Open a first program only once loading has finished. Running this before prefill or a
  // recovered attempt arrives left a stray blank editor that blocked "Retry submission".
  useEffect(() => {
    if (prefilling || prefillFailed || done || pending || editing || programs.length) return;
    setEditing(newProgram());
  }, [prefilling, prefillFailed, done, pending, editing, programs.length]);

  function retryPrefill() {
    setPrefillFailed(false);
    setPrefilling(true);
    setPrefillAttempt(attempt => attempt + 1);
  }

  async function submit() {
    setError('');
    if (!organization.trim()) { setError('Enter an organization name.'); return; }
    setSubmitting(true);
    const attempt = pending || {
      id: crypto.randomUUID(),
      submission: {
        organization, orgId: account === 'tpw' ? undefined : account,
        source: 'team-form', schemaVersion: 1, reportingPeriod: { quarter: period.quarter, year: Number(period.year) },
        submittedAt: new Date().toISOString(), prisons: locations,
        programs: programs.map(program => ({
          ...program, courseHours: Number(program.courseHours), ...counts(program.sites),
          sites: program.sites.map(site => ({ ...site, participants: Number(site.participants || 0), completed: Number(site.completed || 0) })),
          assignments: [...new Set(program.sites.map(site => site.facilityCode))].map(code => ({
            code, yards: program.sites.filter(site => site.facilityCode === code).map(site => site.yard)
          }))
        }))
      }
    };
    try {
      localStorage.setItem(key, JSON.stringify(attempt));
      setPending(attempt);
      const response = await fetch('/api/submissions/?org=' + encodeURIComponent(account), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
      const result = await response.json();
      if ([400, 413].includes(response.status)) {
        localStorage.removeItem(key);
        setPending(null);
        throw new Error(result.error);
      }
      if (!response.ok || result.id !== attempt.id) throw new Error('Could not confirm the submission. Retry to check the same attempt.');
      setReceipt(result.id);
      setDone(true);
      localStorage.setItem(key, JSON.stringify({ ...attempt, receipt: result.id }));
    } catch (error) { setError(error.message || 'Could not save the submission.'); }
    finally { setSubmitting(false); }
  }

  const submittedPrograms = pending?.submission.programs || programs;
  const totals = counts(submittedPrograms.flatMap(program => program.sites));
  const racDays = submittedPrograms.reduce((sum, program) => sum +
    Math.min(40, Math.floor(Number(program.courseHours) / 52) * 10) * counts(program.sites).participantsCompleted, 0);

  function cancelProgramEdit() {
    setError('');
    setProblems([]);
    setEditing(programs.length ? null : newProgram());
  }

  function removeLocation(location) {
    userChanged.current = true;
    setLocations(list => list.filter(item => item.code !== location.code));
    setPrograms(list => list.map(program => ({ ...program, sites: program.sites.filter(site => site.facilityCode !== location.code) })));
    setEditing(current => current ? {
      ...current,
      selectedFacilityCodes: (current.selectedFacilityCodes ?? [...new Set(current.sites.map(site => site.facilityCode))]).filter(code => code !== location.code),
      sites: current.sites.filter(site => site.facilityCode !== location.code)
    } : current);
  }

  function toggleYard(location, yard, checked) {
    userChanged.current = true;
    setLocations(list => list.map(item => item === location
      ? { ...item, yards: checked ? [...item.yards, yard] : item.yards.filter(value => value !== yard) }
      : item));
    if (checked) return;
    const drop = site => !(site.facilityCode === location.code && site.yard === yard);
    setPrograms(list => list.map(program => ({ ...program, sites: program.sites.filter(drop) })));
    setEditing(current => current ? { ...current, sites: current.sites.filter(drop) } : current);
  }

  // Every problem is listed in one place at the top of the editor, in the order the fields appear,
  // and each line moves focus to the field it is about. Native validation bubbles are off, so
  // nothing is reported in a place a member has already scrolled past.
  function collectProblems(program) {
    const found = [];
    if (!program.name.trim()) found.push({ id: 'program-name', text: 'Enter the program’s name.' });
    if (!program.status) found.push({ id: 'program-status', text: 'Choose a schedule status.' });
    if (program.status !== 'Planned' && !program.startDate) found.push({ id: 'program-start', text: 'Enter the date the program started.' });
    if (program.status === 'Completed' && !program.endDate) found.push({ id: 'program-end', text: 'Enter the date the program ended.' });
    if (program.startDate && program.endDate && program.endDate < program.startDate) {
      found.push({ id: 'program-end', text: 'The end date is before the start date.' });
    }
    if (!program.sites.length) found.push({ id: 'program-facilities', text: 'Tick at least one yard where this program runs.' });
    for (const site of program.sites) {
      const where = site.facilityCode + ' ' + site.yard;
      const enrolledId = 'count-' + site.facilityCode + '-' + site.yard + '-participants';
      const completedId = 'count-' + site.facilityCode + '-' + site.yard + '-completed';
      if (String(site.participants).trim() === '') found.push({ id: enrolledId, text: 'Enter how many were enrolled at ' + where + '.' });
      if (String(site.completed).trim() === '') found.push({ id: completedId, text: 'Enter how many completed at ' + where + '.' });
      if (String(site.participants).trim() !== '' && Number(site.completed) > Number(site.participants)) {
        found.push({ id: completedId, text: 'At ' + where + ', completed is more than enrolled.' });
      }
    }
    return found;
  }

  function saveProgram(event) {
    event.preventDefault();
    userChanged.current = true;
    const found = collectProblems(editing);
    setProblems(found);
    if (found.length) { setError(''); return; }
    const { selectedFacilityCodes, ...program } = editing;
    setPrograms(list => list.some(item => item.id === program.id)
      ? list.map(item => item.id === program.id ? program : item) : [...list, program]);
    setEditing(null);
    setError('');
    setProblems([]);
  }

  const missing = [
    ...(locations.length ? [] : ['Add at least one facility']),
    ...(locations.length && locations.some(location => !location.yards.length) ? ['Choose at least one yard at each facility'] : []),
    ...(programs.length ? [] : ['Add at least one program']),
    ...(programs.some(program => !isReady(program)) ? ['Finish each program’s status and yards'] : [])
  ];
  const canSubmit = !prefilling && !submitting && !editing && !missing.length;

  return <main className="tpw-workspace"><div className="tpw-workspace-content">
    <h1 className="tpw-page-title" id="report-top">Log data</h1>
    <div className="quarter-preview">
      <div className="demo-form">
      {done ? <section id="submission-result" aria-labelledby="submission-heading">
        <div className="success-check" aria-hidden="true"><LuCheck /></div>
        <h2 className="form-title" id="submission-heading">You’re all set!</h2>
        <p className="submission-context">{organization} · Q{period.quarter} {period.year}</p>
        <p id="submission-receipt" className="submit-status" role="status">Submitted to TPW. Reference {receipt}.</p>
        <div id="submission-totals" className="success-totals">
          <SuccessMetric value={submittedPrograms.length} label={submittedPrograms.length === 1 ? 'Program' : 'Programs'} />
          <SuccessMetric value={totals.participants} label="Participant enrollments" />
          <SuccessMetric value={totals.participantsCompleted} label="Participants completed" />
          <SuccessMetric value={submittedPrograms.reduce((sum, program) => sum + Number(program.courseHours) * counts(program.sites).participantsCompleted, 0)} label="Estimated completer-hours" />
        </div>
        <button type="button" id="start-over" className="continue-button start-over" onClick={() => { localStorage.removeItem(key); location.replace(`?account=${account}`); }}>Start a new submission</button>
        {racDays > 1 && <section className="mock-impact" aria-labelledby="mock-impact-heading">
          <span className="mock-label">Estimate</span>
          <h3 id="mock-impact-heading">A glimpse of your impact</h3>
          <div id="mock-totals" className="success-totals">
            <SuccessMetric value={racDays} label="RAC credits estimate" roll="number" />
            <SuccessMetric value={racDays * 59} label="Total taxpayer savings" roll="currency" />
          </div>
          <p>Estimated RAC days × $59 per day, using the same calculation as the dashboard.</p>
        </section>}
        <details className="full-report">
          <summary className="intake-disclosure"><LuChevronRight aria-hidden="true" />Expand full submission</summary>
          <p className="report-note">Program totals are counted once, even when a program serves multiple facilities. Participants are program enrollments, not unique people. Per-facility cards show assignments; totals are not allocated across facilities.</p>
          <div id="report-prisons" className="report-grid">
            {locations.map((location, index) => {
              const matches = submittedPrograms.filter(program => program.sites.some(site => site.facilityCode === location.code));
              return <article key={location.code} className="report-prison" style={facilityStyle(index)}>
                <header className="report-card-header">
                  <span className="report-code">{location.code}</span>
                  <h3>{location.name}</h3>
                  <span className="report-program-count">{matches.length} {matches.length === 1 ? 'program' : 'programs'}</span>
                </header>
                <div className="report-yard-section">
                  <span className="report-label">Operating yards</span>
                  <div className="report-chips">{location.yards.map(yard => <span key={yard}>{yard}</span>)}</div>
                </div>
                <div className="report-card-body">
                  {matches.map(program => {
                    const sites = program.sites.filter(site => site.facilityCode === location.code);
                    const { participants, participantsCompleted } = counts(sites);
                    return <section key={program.id} className="report-program">
                      <div className="report-program-heading">
                        <h4>{program.name}</h4>
                        <span className="report-status" data-status={program.status}>{program.status || 'No status'}</span>
                      </div>
                      <p className="report-program-yards">Yards · {sites.map(site => `${site.yard} (${site.participants || 0} enrolled, ${site.completed || 0} completed)`).join(', ')}</p>
                      <dl className="report-dates">
                        {[['Start date', program.startDate], ['End date', program.endDate]].map(([label, date]) =>
                          <div key={label}><dt>{label}</dt><dd>{date ? new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not specified'}</dd></div>)}
                      </dl>
                      <dl className="report-program-metrics">
                        {[['Course hours', Number(program.courseHours)], ['Participants enrolled', participants], ['Completed', participantsCompleted]].map(([label, count]) =>
                          <div key={label}><dd>{count.toLocaleString()}</dd><dt>{label}</dt></div>)}
                      </dl>
                    </section>;
                  })}
                  {!matches.length && <p className="report-empty">No programs assigned yet.</p>}
                </div>
              </article>;
            })}
          </div>
        </details>
      </section> : <>
        <nav className="report-jump" aria-label="Report sections">
          <a href="#reporting-period">Reporting period</a>
          <a href="#facilities">Facilities and yards</a>
          <a href="#programs">Programs</a>
          <a href="#submit">Submit</a>
        </nav>
        <div className="report-summary">
          <div className="report-summary-item">
            <span className="report-summary-label">Organization</span>
            {account === 'tpw'
              ? <input id="organization" autoComplete="organization" maxLength={120} aria-label="Organization"
                placeholder="Organization name" value={organization} onChange={event => setOrganization(event.target.value)} />
              : <strong id="report-organization">{organization || 'Not set'}</strong>}
          </div>
          <div className="report-summary-item">
            <span className="report-summary-label">Reporting period</span>
            <strong id="report-period">{period ? `Q${period.quarter} ${period.year}` : '—'}</strong>
          </div>
        </div>
        {!pending && (prefilling || prefilledFrom || prefillFailed) && <div className="report-banner" role={prefillFailed ? 'alert' : 'status'}>
          {prefilling && <span>Loading your last report…</span>}
          {!prefilling && prefilledFrom && <>
            <span>Filled in from your last report (Q{prefilledFrom.quarter} {prefilledFrom.year}).</span>
            <a href={`?account=${account}&blank=1`}>Start blank</a>
          </>}
          {!prefilling && prefillFailed && <>
            <span>Could not load previous entries. Try again or start blank.</span>
            <button type="button" onClick={retryPrefill}>Retry loading</button>
            <a href={`?account=${account}&blank=1`}>Start blank</a>
          </>}
        </div>}

        <section id="reporting-period" className="report-section" aria-labelledby="reporting-period-heading">
          <h2 id="reporting-period-heading" className="report-heading">Reporting period</h2>
          {period ? <>
            <p className="form-hint">We’ve selected the current quarter. Change it to report for a different period.</p>
            <fieldset className="quarter-options"><legend className="sr-only">Reporting quarter</legend>
              {['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'].map((months, index) => <label key={months}>
                <input type="radio" name="quarter" checked={period.quarter === index + 1} onChange={() => setPeriod({ ...period, quarter: index + 1 })} />
                <span><strong>Q{index + 1}</strong><small>{months}</small></span>
              </label>)}
            </fieldset>
            <div className="form-field"><label htmlFor="reporting-year">Year</label><input id="reporting-year" type="number" required min="2000" max="2200" value={period.year} onChange={event => setPeriod({ ...period, year: event.target.value })} /></div>
          </> : <p className="form-hint">Loading the reporting period…</p>}
        </section>

        <section id="facilities" className="report-section" aria-labelledby="facilities-heading">
          <h2 id="facilities-heading" className="report-heading">Facilities and yards</h2>
          <p className="form-hint">Select each facility where you operate, then check all the yards you work in at that facility.</p>
          <div id="facility-rows" className="facility-rows">
            {locations.map(location => <div className="facility-row" key={location.code}>
              <div className="facility-row-header">
                <strong>{location.name}</strong>
                <button type="button" className="facility-remove" aria-label={`Remove ${location.name}`} onClick={() => removeLocation(location)}><LuX aria-hidden="true" /></button>
              </div>
              <fieldset className="yard-choices"><legend>Yards you operate in</legend><p className="yard-hint">Select all that apply.</p>
                {[...new Set(['A Yard', 'B Yard', 'C Yard', 'D Yard', 'E Yard', 'F Yard', 'North', 'South', 'Reception', 'Ad Seg', ...location.yards])].map(yard =>
                  <label key={yard}><input type="checkbox" checked={location.yards.includes(yard)}
                    onChange={event => toggleYard(location, yard, event.target.checked)} />{yard}</label>)}
              </fieldset>
              <form className="yard-add" onSubmit={event => {
                event.preventDefault();
                const yard = new FormData(event.currentTarget).get('yard').trim();
                if (yard && !location.yards.includes(yard)) { userChanged.current = true; }
                if (yard && !location.yards.includes(yard)) setLocations(list => list.map(item => item === location ? { ...item, yards: [...item.yards, yard] } : item));
                event.currentTarget.reset();
              }}><label htmlFor={`yard-${location.code}`}>Yard not listed?</label><div className="yard-add-row"><input id={`yard-${location.code}`} name="yard" required maxLength={100} /><button aria-label="Add yard">Add</button></div></form>
            </div>)}
          </div>
          {!locations.length && <p className="form-hint">No facilities yet. Add one below.</p>}
          <label className="form-field"><span className="field-label">Add a facility</span> <select value="" onChange={event => {
            userChanged.current = true;
            const code = event.target.value;
            const facility = facilities.find(item => item.code === code);
            if (facility) setLocations([...locations, { ...facility, yards: [] }]);
          }}><option value="">Select a facility</option>{facilities.filter(item => !locations.some(location => location.code === item.code)).map(item =>
            <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
        </section>

        <section id="programs" className="report-section" aria-labelledby="programs-heading">
          <h2 id="programs-heading" className="report-heading">Programs</h2>
          <p className="form-hint">Add each program, then choose the yards where it runs and how many people attended.</p>
          {!!programs.length && <ol className="added-programs" role="list" aria-label="Programs this quarter">
            {programs.map(program => {
              const { participants, participantsCompleted } = counts(program.sites);
              return <li key={program.id}>
                <div className="program-row">
                  <div className="program-toggle" style={{ cursor: 'inherit' }}>
                    <span className="added-name">{program.name}</span>
                    <span className={`program-state${isReady(program) ? ' is-ready' : ''}`}>
                      {!program.status ? 'Needs review' : program.sites.length ? <><LuCheck aria-hidden="true" />{`Ready · ${participants} enrolled · ${participantsCompleted} completed`}</> : 'Choose facilities & yards'}
                    </span>
                  </div>
                  {!pending &&
                    <button type="button" className={`continue-button program-review${program.status ? ' program-edit' : ''}`} aria-label={`${program.status ? 'Edit' : 'Review'} ${program.name}`} onClick={() => { setProblems([]); setEditing(program); }}>{program.status ? 'Edit' : 'Review'}</button>}
                  {!pending && <button type="button" disabled={!!editing && editing.id !== program.id} className="continue-button program-delete" aria-label={`Remove ${program.name}`} onClick={() => {
                    setPrograms(programs.filter(item => item.id !== program.id));
                    if (programs.length === 1) setEditing(newProgram());
                  }}>Remove</button>}
                </div>
              </li>;
            })}
          </ol>}
          {editing ? <form className="program-card" onSubmit={saveProgram} noValidate onChange={() => { setError(''); setProblems([]); }}>
            <div className="organization-summary"><h3 className="form-title">{editing.name || 'New program'}</h3>
              <button className="program-remove" type="button" onClick={cancelProgramEdit}>{programs.some(program => program.id === editing.id) ? 'Cancel editing' : 'Remove'}</button></div>
            {problems.length > 0 && <div className="error-summary" id="program-problems" role="alert" tabIndex={-1}>
              <h4><LuCircleAlert aria-hidden="true" /> Check {problems.length === 1 ? 'this answer' : `these ${problems.length} answers`}</h4>
              <ol>{problems.map(problem => <li key={problem.id}>
                <button type="button" onClick={() => document.getElementById(problem.id)?.focus()}>{problem.text}</button>
              </li>)}</ol>
            </div>}

            <fieldset className="editor-section">
              <legend>1. The program</legend>
              <label className="form-field"><span className="field-label">Program name</span>
                <input id="program-name" maxLength={120} placeholder="Enter your program name" aria-required="true"
                  value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
              <label className="form-field"><span className="field-label">Schedule status</span>
                <select id="program-status" aria-required="true" value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}>
                  <option value="" disabled>Select a status</option>
                  {['Planned', 'In Progress', 'Completed'].map(status => <option key={status}>{status}</option>)}</select></label>
              <div className="date-row">{[[ 'startDate', 'Start date', 'program-start'], ['endDate', 'End date', 'program-end']].map(([key, label, id]) =>
                <label className="form-field" key={key}><span className="field-label">{label}</span>
                  <input id={id} type="date" min={key === 'endDate' ? editing.startDate : undefined}
                    value={editing[key]} onChange={event => setEditing({ ...editing, [key]: event.target.value })} /></label>)}</div>
              <label className="form-field"><span className="field-label">Course hours <span className="label-note">(per participant)</span></span>
                <NumberStepper id="program-hours" value={editing.courseHours} onChange={courseHours => setEditing({ ...editing, courseHours })} fractional /></label>
            </fieldset>

            <fieldset className="editor-section" id="program-facilities" tabIndex={-1}>
              <legend>2. Where it ran</legend>
              <p className="form-hint">Tick each facility, then tick the yards where this program runs.</p>
              <div className="program-assignments">{locations.map(location => {
                const selectedCodes = editing.selectedFacilityCodes ?? [...new Set(editing.sites.map(site => site.facilityCode))];
                const selected = selectedCodes.includes(location.code);
                const siteFor = yard => ({ facilityCode: location.code, yard, participants: '', completed: '' });
                return <div className="assignment-row" key={location.code}>
                  <label><input type="checkbox" checked={selected} onChange={() => setEditing({
                    ...editing,
                    selectedFacilityCodes: selected ? selectedCodes.filter(code => code !== location.code) : [...selectedCodes, location.code],
                    sites: selected ? editing.sites.filter(site => site.facilityCode !== location.code) : editing.sites
                  })} />{location.name}</label>
                  {selected && <fieldset className="program-yards"><legend>Yards for this program</legend>
                    <p className="yard-hint">Choose the yards where this program runs.</p>
                    {location.yards.map(yard => {
                      const site = editing.sites.find(item => item.facilityCode === location.code && item.yard === yard);
                      return <label key={yard}><input type="checkbox" checked={!!site} onChange={() => setEditing({
                        ...editing, sites: site ? editing.sites.filter(item => item !== site) : [...editing.sites, siteFor(yard)]
                      })} />{yard}</label>;
                    })}
                  </fieldset>}
                </div>;
              })}</div>
              {!locations.length && <p className="yard-hint">Add a facility in the section above first.</p>}
            </fieldset>

            <fieldset className="editor-section">
              <legend>3. How many people</legend>
              <p className="form-hint">One row per yard. Type the numbers; use 0 if nobody attended.</p>
              <div className="yard-number-rows">{editing.sites.map(site =>
                <div className={`yard-number-row${Number(site.completed) > Number(site.participants || 0) && site.participants !== '' ? ' yard-number-invalid' : ''}`} key={JSON.stringify([site.facilityCode, site.yard])}>
                  <strong className="yard-number-place">{site.facilityCode} · {site.yard}</strong>
                  {[['participants', 'Participants enrolled'], ['completed', 'Completed']].map(([key, label]) =>
                    <label className="yard-count" key={key}><span className="yard-count-label">{label}</span>
                      <NumberStepper id={'count-' + site.facilityCode + '-' + site.yard + '-' + key} value={site[key]} onChange={value => setEditing({
                        ...editing, sites: editing.sites.map(item => item === site ? { ...item, [key]: value } : item)
                      })} />
                    </label>)}
                  {Number(site.completed) > Number(site.participants || 0) && site.participants !== '' &&
                    <>
                      <LuCircleAlert className="yard-warning-icon" aria-hidden="true" />
                      <p className="yard-count-error">Completed cannot exceed enrollment at this yard.</p>
                    </>}
                </div>)}</div>
              {!editing.sites.length && <p className="yard-hint">Tick a facility and yard in section 2 first.</p>}
            </fieldset>
            <div className="next-actions">
              <button type="submit" className="continue-button">Done with program</button>
              {programs.some(program => program.id === editing.id) &&
                <button className="program-remove" type="button" onClick={cancelProgramEdit}>Cancel editing</button>}
            </div>
          </form> : !pending && <div className="next-actions">
            <button type="button" id="another-program" className="continue-button secondary" onClick={() => { setProblems([]); setEditing(newProgram()); }}><LuPlus aria-hidden="true" /> Add another program</button>
          </div>}
        </section>

        <section id="submit" className="report-section" aria-labelledby="submit-heading">
          <h2 id="submit-heading" className="report-heading">Submit</h2>
          <div className="submit-totals">
            <span><strong>{programs.length}</strong> {programs.length === 1 ? 'program' : 'programs'}</span>
            <span><strong>{counts(programs.flatMap(program => program.sites)).participants}</strong> enrolled</span>
            <span><strong>{counts(programs.flatMap(program => program.sites)).participantsCompleted}</strong> completed</span>
          </div>
          {!!missing.length && <ul className="submit-requirements">{missing.map(item => <li key={item}>{item}</li>)}</ul>}
          {error && <p className="program-error" role="alert">{error}</p>}
          <div className="next-actions">
            <button type="button" id="finish-form" className="continue-button" disabled={!canSubmit} onClick={submit}>
              {submitting ? <><span className="submit-spinner" aria-hidden="true" />Submitting…</> : pending ? 'Retry submission' : 'Finish and submit'}
            </button>
            <span className="sr-only" role="status">{submitting ? 'Submitting your report' : ''}</span>
          </div>
        </section>
      </>}
      </div>
    </div>
  </div></main>;
}

// One plain number box instead of a −/+ spinner: typing is what people already do, the box is
// large enough to hit, and its size does not change between courses and participant counts.
function NumberStepper({ value, onChange, fractional = false, id }) {
  return <input id={id} className="count-input" type="number" inputMode={fractional ? 'decimal' : 'numeric'}
    min="0" max="10000000" step={fractional ? 'any' : '1'} placeholder="0" value={value}
    onChange={event => onChange(event.target.value)} />;
}
