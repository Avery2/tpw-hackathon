'use client';

import { useEffect, useRef, useState } from 'react';
import { LuExternalLink, LuX } from 'react-icons/lu';
import { authClient } from '../../../lib/server/auth-client.js';

export function AccountDrawer({ account, dialog, organizations, annualReport }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [user, setUser] = useState(null);

  useEffect(() => {
    const drawer = dialog.current;
    if (!drawer) return;
    let active = true;
    const observer = new MutationObserver(() => {
      if (!drawer.open) return;
      setUser(null);
      authClient.getSession().then(({ data }) => {
        if (active && drawer.open) setUser(data?.user || null);
      }).catch(() => {});
    });
    observer.observe(drawer, { attributes: true, attributeFilter: ['open'] });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [dialog]);

  async function signOut() {
    setError('');
    setBusy(true);
    try {
      const session = await authClient.getSession();
      if (session.error && session.error.status !== 503) throw session.error;
      if (session.data) {
        const { error } = await authClient.signOut();
        if (error) throw error;
      }
      try {
        sessionStorage.removeItem('tpw.member.demo.v1');
      } catch {
        // Sign-out still works when browser storage is disabled.
      }
      location.replace('/sign-in/');
    } catch {
      setError('Sign-out could not be confirmed. Please try again.');
      setBusy(false);
    }
  }

  const portalLinks = [
    ['Member Portal home', `/team-dashboard/member-portal/#${account}`],
    ['Log data', `/log-data/?account=${account}`],
    ['Overview', `/team-dashboard/#${account}`],
    ['Programs', `/team-dashboard/programs/#${account}`],
    ['Submissions', `/team-dashboard/submissions/#${account}`],
    ['Annual report', annualReport]
  ];
  return <dialog ref={dialog} className="tpw-account-drawer" aria-labelledby="tpw-account-title"
    onClose={() => document.documentElement.classList.remove('tpw-account-open')}
    onClick={event => {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) event.currentTarget.close();
    }}>
    <header className="tpw-account-header"><h2 id="tpw-account-title">Member Portal</h2>
      <button autoFocus className="tpw-account-close" onClick={() => dialog.current.close()}><LuX aria-hidden="true" size={16} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />Close</button>
    </header>
    <div className="tpw-account-body">
      <section className="tpw-account-greeting"><h3>{user?.name ? `Hi, ${user.name}` : organizations.find(org => org.id === account)?.name || 'Welcome'}</h3>
        <button className="tpw-account-signout" disabled={busy} onClick={signOut}>Sign out</button>
      </section>
      <nav className="tpw-account-row" aria-label="Member portal">
        <h3>Your tools</h3>
        <ul className="tpw-account-organizations">{portalLinks.map(([label, href]) => <li key={label}>
          <a href={href} onClick={() => dialog.current.close()}>{label}<span aria-hidden="true">→</span></a>
        </li>)}</ul>
      </nav>
      {organizations.length > 0 && <section className="tpw-account-row">
        <h3>Your organizations</h3>
        <ul className="tpw-account-organizations">{organizations.map(org => <li key={org.id}>
          <a href={`/team-dashboard/#${encodeURIComponent(org.id)}`} aria-current={org.id === account ? 'true' : undefined}
            onClick={() => dialog.current.close()}>{org.name}
            {org.id === account && <span>Currently viewing</span>}
          </a>
        </li>)}</ul>
      </section>}
      <section className="tpw-account-row"><h3>Profile</h3><p>{user?.email || 'Member'}</p></section>
      <section className="tpw-account-row"><h3>Need help?</h3>
        <p>Questions about reporting, grants or the portal? <a href="mailto:membership@thetpw.org">membership@thetpw.org</a> · <a href="tel:+18332438135">833-243-8135</a>, weekdays 9am–5pm.</p>
      </section>
      <p className="tpw-account-preview" role="alert">{error}</p>
    </div>
  </dialog>;
}

export function DashboardExports({ account }) {
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const container = useRef(null);

  async function download(format) {
    setBusy(format);
    setStatus('Preparing download…');
    try {
      const scope = account === 'tpw' ? '' : '?' + new URLSearchParams({ org: account });
      const response = await fetch('/api/dashboard' + scope);
      if (!response.ok) throw new Error('Download failed');
      const history = await response.json();
      const submissions = history.submissions.filter(record => !scope || record.orgId === account);
      const { programHistoryCsv } = await import('../../../lib/reporting/exports.js');
      if (!container.current?.isConnected || location.hash !== '#' + account) return;
      const content = format === 'csv' ? programHistoryCsv(submissions) : JSON.stringify({
        coverage: 'Submission history, not latest-only; all submissions in the selected organization scope.',
        orgs: history.orgs, submissions
      }, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `tpw-program-history-${account}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Downloaded a history snapshot. Repeated filings are not additive totals.');
    } catch {
      setStatus('Could not download reporting data. Please try again.');
    } finally {
      setBusy('');
    }
  }

  return <div ref={container} id="dashboard-exports" className="tpw-data-exports" aria-label="Download reporting data">
    <button disabled={!!busy} onClick={() => download('csv')}>Export program history (CSV)</button>
    <button disabled={!!busy} onClick={() => download('json')}>Export JSON</button>
    <a className="sheets-link" href="https://sheets.new" target="_blank" rel="noopener noreferrer">New Google Sheet <LuExternalLink aria-hidden="true" focusable="false" size={14} /></a>
    <small>Download CSV, then File → Import → Upload in the new Sheet. Turn off conversion to formulas. This creates a copy, not a sync.</small>
    <span role="status">{status}</span>
  </div>;
}
