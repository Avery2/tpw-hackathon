'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { currentReportingPeriod } from '../../../team-form/js/reporting-period.js';

function SuccessMetric({ value, label, roll }) {
  const amount = useRef(null);
  useEffect(() => {
    if (!roll || !value) return;
    let active = true;
    import(/* turbopackIgnore: true */ '/dashboard/js/rolling-number.js').then(({ rollNumber, rollCurrency }) => {
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

function IntakeForm({ account, blank, css, organizationName, facilities = [] }) {
  const [period, setPeriod] = useState(null);
  const [step, setStep] = useState(blank || account === 'tpw' ? 'organization' : 'choice');
  const [organization, setOrganization] = useState(organizationName ?? (account === 'tpw' ? '' : account === 'org-2' ? 'Org 2' : 'Org 1'));
  const [locations, setLocations] = useState([]);
  const [programs, setPrograms] = useState([]);
  const formRoot = useRef(null);
  const transitioning = useRef(false);
  const enteringStep = useRef(null);

  function waitForAnimation(element) {
    return Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  }

  async function goToStep(next) {
    if (transitioning.current) return;
    const outgoing = formRoot.current?.querySelector(':scope > .question-step');
    if (!outgoing) {
      setStep(next);
      return;
    }
    transitioning.current = true;
    outgoing.inert = true;
    outgoing.classList.add('leaving');
    await waitForAnimation(outgoing);
    if (!outgoing.isConnected) return;
    enteringStep.current = next;
    setStep(next);
  }

  useLayoutEffect(() => {
    if (enteringStep.current !== step) return;
    const incoming = formRoot.current.querySelector(':scope > .question-step');
    enteringStep.current = null;
    if (!incoming) {
      transitioning.current = false;
      return;
    }
    incoming.classList.add('entering');
    const heading = incoming.querySelector('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'nearest' });
    }
    waitForAnimation(incoming).then(() => {
      incoming.classList.remove('entering');
      transitioning.current = false;
    });
  }, [step]);

  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [usePrevious, setUsePrevious] = useState(false);
  const [prefillAttempt, setPrefillAttempt] = useState(0);
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
        setStep(saved.receipt ? 'done' : 'review');
        return;
      }
    } catch { setError('Could not read the saved attempt.'); }
    if (!blank && account !== 'tpw') {
      setBusy(true);
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
        setOrganization(data.org.name);
        setLocations([...locations.values()]);
        setPrograms(previous);

      }).catch(() => { if (!controller.signal.aborted) setPrefillFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }
    return () => controller.abort();
  }, [account, blank, key, prefillAttempt]);

  useEffect(() => {
    if (step === 'choice' && usePrevious && !busy && !prefillFailed) setStep('quarter');
  }, [step, usePrevious, busy, prefillFailed]);

  async function submit() {
    setError('');
    setBusy(true);
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
      goToStep('done');
      localStorage.setItem(key, JSON.stringify({ ...attempt, receipt: result.id }));
    } catch (error) { setError(error.message || 'Could not save the submission.'); }
    finally { setBusy(false); }
  }

  const submittedPrograms = pending?.submission.programs || programs;
  const totals = counts(submittedPrograms.flatMap(program => program.sites));
  const racDays = submittedPrograms.reduce((sum, program) => sum +
    Math.min(40, Math.floor(Number(program.courseHours) / 52) * 10) * counts(program.sites).participantsCompleted, 0);

  function cancelProgramEdit() {
    setError('');
    setEditing(programs.length ? null : newProgram());
  }

  function saveProgram(event) {
    event.preventDefault();
    if (!editing.name.trim()) { setError('Enter a program name.'); return; }
    if (!editing.sites.length) { setError('Select at least one yard.'); return; }
    if (editing.sites.some(site => Number(site.completed) > Number(site.participants))) {
      setError('Completed cannot exceed enrollment at a yard.'); return;
    }
    const { selectedFacilityCodes, ...program } = editing;
    setPrograms(list => list.some(item => item.id === program.id)
      ? list.map(item => item.id === program.id ? program : item) : [...list, program]);
    setEditing(null);
    setError('');
  }

  return <main className="tpw-workspace"><div className="tpw-workspace-content">
    <h1 className="tpw-page-title">Log data</h1>
    <div className="quarter-preview"><style>{css}</style><div className="demo-form" ref={formRoot}>
      {error && !editing && <p role="alert">{error}</p>}
      {step === 'choice' && <section className="question-step prefill-loading">
        <h2 className="form-title">How would you like to start?</h2>
        {prefillFailed && <p role="alert">Could not load previous entries. Try again or start blank.</p>}
        <button type="button" className="continue-button" onClick={() => {
          setUsePrevious(true);
          if (prefillFailed) {
            setPrefillFailed(false);
            setBusy(true);
            setPrefillAttempt(attempt => attempt + 1);
          }
        }}>{prefillFailed ? 'Retry loading' : 'Use previous entries'}</button>
        <span>or</span>
        <a href={`?account=${account}&blank=1`}>Start blank</a>
      </section>}
      {step === 'organization' && <form id="organization-step" className="question-step" onSubmit={event => {
        event.preventDefault();
        if (organization.trim()) goToStep('quarter');
      }}>
        <p className="step-label">Step 1 · Organization</p>
        <h2 className="form-title">What is your organization’s name?</h2>
        <div className="form-field">
          <label htmlFor="organization">Organization</label>
          <input id="organization" autoComplete="organization" maxLength={120} placeholder="Start typing to pick a TPW member"
            aria-describedby="organization-help" required readOnly={account !== 'tpw'} value={organization}
            onChange={event => setOrganization(event.target.value)} />
          <p className="yard-hint" id="organization-help">Pick your organization from the list so your numbers are filed under one name. If it isn’t listed, type it in full.</p>
        </div>
        <button className="continue-button" type="submit">Continue <span aria-hidden="true">→</span></button>
      </form>}
      {step === 'quarter' && period && !busy && !prefillFailed && <form className="question-step entering" onSubmit={event => { event.preventDefault(); goToStep('facilities'); }}>
        {usePrevious && <div className="prefill-note">
          This form is prefilled with your previous entries. <a href={`?account=${account}&blank=1`}>Start blank instead</a>.
        </div>}
        <p className="step-label">Reporting period</p><h2 className="form-title">Which quarter are you reporting for?</h2>
        <p className="form-hint">We’ve selected the current quarter. Change it to report for a different period.</p>
        <fieldset className="quarter-options"><legend className="sr-only">Reporting quarter</legend>
          {['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'].map((months, index) => <label key={months}>
            <input type="radio" name="quarter" checked={period.quarter === index + 1} onChange={() => setPeriod({ ...period, quarter: index + 1 })} />
            <span><strong>Q{index + 1}</strong><small>{months}</small></span>
          </label>)}
        </fieldset>
        <div className="form-field"><label htmlFor="reporting-year">Year</label><input id="reporting-year" type="number" required min="2000" max="2200" value={period.year} onChange={event => setPeriod({ ...period, year: event.target.value })} /></div>
        <div className="next-actions"><button className="continue-button" disabled={busy || prefillFailed}>Continue →</button></div>
      </form>}
      {step === 'facilities' && <section className="question-step" id="facilities-step">

        <div className="organization-summary"><span>Organization: <strong>{organization}</strong></span></div>
        <div className="organization-summary"><span>Reporting period: <strong>Q{period?.quarter} {period?.year}</strong></span>
        </div>
        <div className="form-step-header">
          <p className="step-label">Step 2 · Facilities</p>
          <button type="button" className="continue-button" onClick={() => goToStep('quarter')}>← Back</button>
        </div>
        <h2 className="form-title">Which facilities do you operate in?</h2>
        <p className="form-hint">Select each facility where you operate, then check all the yards you work in at that facility.</p>
        <div id="facility-cards" className="facility-cards">
        {locations.map((location, index) => <div className="facility-card active" style={facilityStyle(index)} key={location.code}><div className="prison-card-header"><strong className="choose">{location.name}</strong>
          <button type="button" className="remove" aria-label={`Remove ${location.name}`} onClick={() => setLocations(locations.filter(item => item.code !== location.code))}>×</button></div>
          <fieldset className="yard-choices"><legend>Yards you operate in</legend><p className="yard-hint">Select all that apply.</p>{[...new Set(['A Yard', 'B Yard', 'C Yard', 'D Yard', 'E Yard', 'F Yard', 'North', 'South', 'Reception', 'Ad Seg', ...location.yards])].map(yard =>
            <label key={yard}><input type="checkbox" checked={location.yards.includes(yard)}
              onChange={event => setLocations(locations.map(item => item === location ? { ...item, yards: event.target.checked ? [...item.yards, yard] : item.yards.filter(value => value !== yard) } : item))} />{yard}</label>)}
          </fieldset>
          <form className="yard-add" onSubmit={event => {
            event.preventDefault();
            const yard = new FormData(event.currentTarget).get('yard').trim();
            if (yard && !location.yards.includes(yard)) setLocations(locations.map(item => item === location ? { ...item, yards: [...item.yards, yard] } : item));
            event.currentTarget.reset();
          }}><label htmlFor={`yard-${location.code}`}>Yard not listed?</label><div className="yard-add-row"><input id={`yard-${location.code}`} name="yard" required maxLength={100} /><button aria-label="Add yard">Add</button></div></form>
        </div>)}
        </div>
        <label className="form-field"><span className="field-label">Add a facility</span> <select value="" onChange={event => {
          const code = event.target.value;
          const facility = facilities.find(item => item.code === code);
          if (facility) setLocations([...locations, { ...facility, yards: [] }]);
        }}><option value="">Select a facility</option>{facilities.filter(item => !locations.some(location => location.code === item.code)).map(item =>
          <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
        <div className="next-actions">
          <button className="continue-button" disabled={!locations.length || locations.some(item => !item.yards.length)} onClick={() => {
            setPrograms(programs.map(program => ({ ...program, sites: program.sites.filter(site => locations.some(item => item.code === site.facilityCode && item.yards.includes(site.yard))) })));
            if (!programs.length && !editing) setEditing(newProgram());
            goToStep('review');
          }}>Continue to programs →</button>
        </div>
      </section>}
      {step === 'review' && <section id="programs-step" className="question-step">
        <aside className="program-sidebar" aria-label="Facilities and yards">
          <div className="organization-summary"><span>Your facilities &amp; yards</span>{!pending && <button onClick={() => goToStep('facilities')}>Edit facilities</button>}</div>
          <ul id="prison-summary" className="prison-summary">{locations.map((location, index) => <li style={facilityStyle(index)} className="facility-card active" key={location.code}><details open={locations.length < 3}><summary><strong>{location.name}</strong> <span className="program-count">{programs.filter(program => program.sites.some(site => site.facilityCode === location.code)).length} programs</span></summary>
            {location.yards.map(yard => <div className="summary-yard" key={yard}><h4>{yard}</h4>{programs.filter(program => program.sites.some(site => site.facilityCode === location.code && site.yard === yard)).map(program => <p key={program.id}>{program.name}</p>)}{!programs.some(program => program.sites.some(site => site.facilityCode === location.code && site.yard === yard)) && <p className="yard-hint">No programs added yet</p>}</div>)}</details>
          </li>)}</ul>
        </aside>
        <div className="program-editor">
        <div className="form-step-header">
          <p className="step-label">Step 3 · Programs</p>
          {!pending && <button type="button" className="continue-button" onClick={() => goToStep('facilities')}>← Back</button>}
        </div>
        <h2 className="form-title">What programs do you run?</h2>
        <p className="form-hint">Add each program, select a facility, then choose the yards where that program runs.</p>
        {editing && <ol className="added-programs"><li className="is-open"><form className="program-card question-step" onSubmit={saveProgram} onChange={() => setError('')} onInvalid={event => {
          if (!event.target.form.querySelector('input:invalid, select:invalid, textarea:invalid')?.isSameNode(event.target)) return;
          const label = event.target.labels?.[0]?.querySelector('.field-label, .yard-count-label')?.textContent;
          setError(label ? `${label}: ${event.target.validationMessage}` : event.target.validationMessage);
        }}><div className="organization-summary"><h3 className="form-title">{editing.name || 'New program'}</h3>
          <button className="program-remove" type="button" onClick={cancelProgramEdit}>{programs.some(program => program.id === editing.id) ? 'Cancel editing' : 'Remove'}</button></div>
          <label className="form-field"><span className="field-label">Program Name</span> <input required maxLength={120} placeholder="Enter your program name" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
          <fieldset className="prison-options"><legend>Which facilities does this program apply to?</legend>
          <div className="program-assignments">{locations.map((location, index) => {
            const selectedCodes = editing.selectedFacilityCodes ?? [...new Set(editing.sites.map(site => site.facilityCode))];
            const selected = selectedCodes.includes(location.code);
            const siteFor = yard => ({ facilityCode: location.code, yard, participants: '', completed: '' });
            return <div className="assignment-row" style={facilityStyle(index)} key={location.code}>
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
          </fieldset>
          <div className="count-row"><label className="form-field">
            <span className="field-label">Course Hours <span className="label-note">(per participant)</span></span>
            <NumberStepper value={editing.courseHours} onChange={courseHours => setEditing({ ...editing, courseHours })} fractional />
          </label></div>
          <label className="form-field"><span className="field-label">Schedule Status</span> <select required value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}>
            <option value="" disabled>Select a status</option>
            {['Planned', 'In Progress', 'Completed'].map(status => <option key={status}>{status}</option>)}</select></label>
          <div className="date-row">{[[ 'startDate', 'Start Date'], ['endDate', 'End Date']].map(([key, label]) =>
            <label className="form-field" key={key}><span className="field-label">{label}</span> <input type={key === 'courseHours' ? 'number' : 'date'} min={key === 'courseHours' ? 0 : key === 'endDate' ? editing.startDate : undefined} step="any"
              required={key === 'startDate' ? ['In Progress', 'Completed'].includes(editing.status) : key === 'endDate' && editing.status === 'Completed'}
              value={editing[key]} onChange={event => setEditing({ ...editing, [key]: event.target.value })} /></label>)}</div>

          <fieldset className="yard-numbers"><legend>Participants at each yard</legend>
            <div className="yard-number-rows">{editing.sites.map(site =>
              <div className={`yard-number-row${Number(site.completed) > Number(site.participants || 0) ? ' yard-number-invalid' : ''}`} style={facilityStyle(locations.findIndex(location => location.code === site.facilityCode))} key={JSON.stringify([site.facilityCode, site.yard])}>
                <strong className="yard-number-place">{site.facilityCode} · {site.yard}</strong>
                {[['participants', 'Participants enrolled'], ['completed', 'Completed']].map(([key, label]) =>
                  <label className="yard-count" key={key}><span className="yard-count-label">{label}</span>
                    <NumberStepper value={site[key]} onChange={value => setEditing({
                      ...editing, sites: editing.sites.map(item => item === site ? { ...item, [key]: value } : item)
                    })} />
                  </label>)}
                {Number(site.completed) > Number(site.participants || 0) &&
                  <>
                    <span className="yard-warning-icon" aria-hidden="true">!</span>
                    <p className="yard-count-error">Completed cannot exceed enrollment at this yard.</p>
                  </>}
              </div>)}</div>
            {!editing.sites.length && <p className="yard-hint">Choose a facility and yard above first.</p>}
          </fieldset>
          {error && <p className="program-error" role="alert">{error}</p>}
          <div className="next-actions">
            <button type="submit" className="continue-button">Done with program</button>
            {programs.some(program => program.id === editing.id) &&
              <button className="program-remove" type="button" onClick={cancelProgramEdit}>Cancel editing</button>}
          </div>
        </form></li></ol>}
        <section id="program-next" className="question-step" aria-labelledby="program-next-heading" hidden={!!editing}>
          <h3 id="program-next-heading" className="form-title">Program added. What’s next?</h3>
          <ol className="added-programs" role="list" aria-label="Programs this quarter">
            {programs.map(program => {
              const { participants, participantsCompleted } = counts(program.sites);
              return <li key={program.id}>
                <div className="program-row">
                  <div className="program-toggle" style={{ cursor: 'inherit' }}>
                    <span className="added-name">{program.name}</span>
                    <span className={`program-state${program.status && program.sites.length ? ' is-ready' : ''}`}>
                      {!program.status ? 'Needs review' : program.sites.length ? `✓ Ready · ${participants} enrolled · ${participantsCompleted} completed` : 'Choose facilities & yards'}
                    </span>
                  </div>
                  {!pending &&
                    <button type="button" className={`continue-button program-review${program.status ? ' program-edit' : ''}`} aria-label={`${program.status ? 'Edit' : 'Review'} ${program.name}`} onClick={() => setEditing(program)}>{program.status ? 'Edit' : 'Review'}</button>}
                  {!pending && <button type="button" className="continue-button program-delete" aria-label={`Remove ${program.name}`} onClick={() => {
                    setPrograms(programs.filter(item => item.id !== program.id));
                    if (programs.length === 1) setEditing(newProgram());
                  }}>Remove</button>}
                </div>
              </li>;
            })}
          </ol>
          <div className="next-actions">
            {!pending && <button type="button" id="another-program" className="continue-button" onClick={() => setEditing(newProgram())}>+ Add another program</button>}
            <button type="button" id="finish-form" className="continue-button" disabled={busy || !!editing || !programs.length || programs.some(program => !program.status || !program.sites.length)} onClick={submit}>
              {busy ? <><span className="submit-spinner" aria-hidden="true" />Submitting…</> : pending ? 'Retry submission' : 'Finish and submit'}
            </button>
            <span className="sr-only" role="status">{busy ? 'Submitting your report' : ''}</span>
          </div>
        </section></div>
      </section>}
      {step === 'done' && <section id="submission-result" className="question-step" aria-labelledby="submission-heading">
        <div className="success-check" aria-hidden="true">✓</div>
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
          <summary>Expand full submission</summary>
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
      </section>}
    </div></div>
  </div></main>;
}

function NumberStepper({ value, onChange, fractional = false }) {
  return <span className="stepper">
    <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(0, Number(value) - 1))}>−</button>
    <input type="number" min="0" max="10000000" step={fractional ? 'any' : '1'} placeholder="0" value={value}
      onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label="Increase" onClick={() => onChange(Number(value) + 1)}>+</button>
  </span>;
}
