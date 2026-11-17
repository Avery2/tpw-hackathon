'use client';

import { useEffect, useRef, useState } from 'react';
import { authClient } from '../../../server/auth-client.js';

export function AccountDrawer({ account, dialog }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');

  useEffect(() => {
    const drawer = dialog.current;
    if (!drawer) return;
    let active = true;
    const observer = new MutationObserver(() => {
      if (!drawer.open) return;
      setEmail('');
      authClient.getSession().then(({ data }) => {
        if (active && drawer.open) setEmail(data?.user.email || '');
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
      const { clearDemoAccount } = await import(/* turbopackIgnore: true */ '/assets/member-session.js?v=reporting-1');
      clearDemoAccount();
      location.replace('/dashboard/?entry=team');
    } catch {
      setError('Sign-out could not be confirmed. Please try again.');
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="tpw-account-drawer" aria-labelledby="tpw-account-title"
    onClose={() => document.documentElement.classList.remove('tpw-account-open')}
    onClick={event => {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) event.currentTarget.close();
    }}>
    <header className="tpw-account-header"><h2 id="tpw-account-title">Account</h2>
      <button autoFocus className="tpw-account-close" onClick={() => dialog.current.close()}>Close</button>
    </header>
    <div className="tpw-account-body">
      <section className="tpw-account-greeting"><h3>Hi, {{ 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' }[account]}</h3>
        <button className="tpw-account-signout" disabled={busy} onClick={signOut}>Sign out</button>
      </section>
      <section className="tpw-account-row"><h3>Profile</h3><p>{email || 'Member'}</p></section>
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
      const { programHistoryCsv } = await import(/* turbopackIgnore: true */ '/assets/dashboard-exports.js');
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
    <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">New Google Sheet ↗</a>
    <small>Download CSV, then File → Import → Upload in the new Sheet. Turn off conversion to formulas. This creates a copy, not a sync.</small>
    <span role="status">{status}</span>
  </div>;
}
