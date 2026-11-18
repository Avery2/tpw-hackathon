'use client';

import { useState } from 'react';
import { authClient } from '../../../lib/server/auth-client.js';

export default function Login({ configured, inviteId }) {
  const [register, setRegister] = useState(Boolean(inviteId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function signIn(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      if (register) {
        const response = await fetch('/api/pilot-invitations/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'register', id: inviteId, ...Object.fromEntries(fields) }),
        });
        if (!response.ok) {
          setMessage((await response.json()).error);
          return;
        }
        setRegister(false);
      }
      const { error } = await authClient.signIn.email({
        email: fields.get('email'),
        password: fields.get('password'),
      });
      if (error) {
        setMessage('Could not sign in. Check your email and password and try again.');
        return;
      }
      if (inviteId) {
        await acceptInvitation();
        return;
      }
      const response = await fetch('/api/pilot-account/');
      if (response.status === 403) {
        setMessage('Your account has no pilot organization.');
        return;
      }
      if (!response.ok) throw new Error('Could not load membership');
      const { orgId } = await response.json();
      location.replace('/team-dashboard/#' + encodeURIComponent(orgId));
    } catch {
      setMessage('Sign-in is temporarily unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/pilot-invitations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', id: inviteId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      sessionStorage.setItem('tpw-invite-accepted', data.orgId);
      location.replace('/team-dashboard/#' + encodeURIComponent(data.orgId));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="dashboard-login" aria-labelledby="login-heading">
    <h2 id="login-heading">{inviteId ? 'Accept invitation' : 'Log in'}</h2>
    {inviteId && <p>Enter the email address your admin invited to join the organization.</p>}
    <form onSubmit={signIn}>
      {register && <label>Name<input name="name" autoComplete="name" maxLength={120} required /></label>}
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} maxLength={128} required /></label>
      <button type="submit" disabled={!configured || busy}>{busy ? 'Working…' : register ? 'Create account and join' : inviteId ? 'Log in and accept' : 'Log in'}</button>
      {inviteId && <button type="button" disabled={busy} onClick={() => {
        setRegister(!register);
        setMessage('');
      }}>{register ? 'I already have an account' : 'Create an account'}</button>}
      {!configured && <p>Login is unavailable in this environment.</p>}
      <span role="status">{message}</span>
    </form>
  </section>;
}
