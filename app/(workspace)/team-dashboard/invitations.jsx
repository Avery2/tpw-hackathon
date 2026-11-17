'use client';

import { useEffect, useState } from 'react';

export default function Invitations({ account }) {
  const endpoint = '/api/pilot-invitations/' + (account ? '?org=' + encodeURIComponent(account) : '');
  const [invitations, setInvitations] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(endpoint).then(async response => {
      if (!response.ok) throw new Error();
      setInvitations((await response.json()).invitations);
    }).catch(() => setMessage('Could not load pending invitations.'));
  }, [endpoint]);

  async function change(body) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setInvitations(list => body.action === 'create' ? [data, ...list] : list.filter(item => item.id !== body.id));
      setMessage(body.action === 'create' ? 'Invitation created.' : 'Invitation revoked.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="pilot-invitations">
    <div className="view-heading"><h2>Invitations</h2></div>
    <form onSubmit={event => {
      event.preventDefault();
      change({ action: 'create', email: new FormData(event.currentTarget).get('email') });
    }}>
      <label>Invitee email <input type="email" name="email" required maxLength={254} /></label>
      <button disabled={busy}>Create invite</button>
    </form>
    <p role="status">{message}</p>
    {invitations.length > 0 && <div className="table-wrap members-table"><table className="program-table">
      <thead><tr><th>Email</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
      <tbody>{invitations.map(invite => <tr key={invite.id}>
        <td>{invite.email}</td><td>Pending</td><td>{new Date(invite.expiresAt).toLocaleDateString()}</td>
        <td><button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL('/accept-invite/?id=' + invite.id, location.origin).href);
            setMessage('Invite link copied.');
          } catch {
            setMessage('Could not copy the invite link.');
          }
        }}>Copy invite link</button>{' '}
        <button type="button" disabled={busy} onClick={() => change({ action: 'revoke', id: invite.id })}>Revoke</button></td>
      </tr>)}</tbody>
    </table></div>}
    <style>{`
      .pilot-invitations { margin-bottom: 32px; }
      .pilot-invitations form { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
      .pilot-invitations label { display: grid; gap: 6px; font-weight: 700; }
      .pilot-invitations input { padding: 8px 12px; border: 1px solid #aaa; border-radius: 8px; font: inherit; }
      .pilot-invitations form button { border: 0; border-radius: 999px; padding: 9px 16px; background: #111; color: white; font: inherit; cursor: pointer; }
    `}</style>
  </section>;
}
