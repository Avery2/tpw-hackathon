'use client';

import { useState } from 'react';

const choices = [
  ['admin', 'Org 1 Admin', '01', ''],
  ['member', 'Org 1 Member', '01', 'org-two'],
  ['staff', 'TPW Staff', 'TPW', 'tpw-icon'],
];

export default function DevelopmentPicker() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function signIn(role) {
    setBusy(role);
    setError('');
    try {
      const login = await fetch('/api/development-login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (login.status === 429) {
        setError('Too many sign-in attempts. Wait a few seconds, then try again.');
        return;
      }
      if (!login.ok) throw new Error();
      const access = await fetch('/api/pilot-account/');
      if (!access.ok) throw new Error();
      const { orgId } = await access.json();
      location.replace('/team-dashboard/#' + encodeURIComponent(orgId));
    } catch {
      setError('Could not sign in with this test account. Try again.');
    } finally {
      setBusy('');
    }
  }

  return <div className="signin-grid">
    {choices.map(([role, label, badge, style]) => <button key={role} type="button" className="signin-option"
      style={{ fontFamily: 'inherit', width: '100%', cursor: 'pointer' }}
      disabled={!!busy} onClick={() => signIn(role)}>
      <span className={`option-icon ${style}`} aria-hidden="true">{badge}</span>
      <span>{busy === role ? 'Signing in…' : label}</span>
    </button>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
