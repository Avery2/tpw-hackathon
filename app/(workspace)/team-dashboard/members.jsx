'use client';

import { useEffect, useRef, useState } from 'react';
import Invitations from './invitations.jsx';

const url = '/api/pilot-members/';

export default function Members() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const removeDialog = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMembers(data.members);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, []);

  async function changeMember(member, method) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, canSubmit: !member.canSubmit }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMembers(list => method === 'DELETE' ? list.filter(item => item.id !== member.id) :
        list.map(item => item.id === member.id ? { ...item, canSubmit: !item.canSubmit } : item));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Members</h1></div></section>
    <div className="shell dashboard-content">
    {members && <Invitations />}
    <div className="view-heading"><div>
      <h2>Organization members</h2>
      {members && <p>{members.length} {members.length === 1 ? 'member' : 'members'}</p>}
    </div></div>
    {error && <p role="alert">{error}</p>}
    {!members && !error && <p role="status">Loading members…</p>}
    {members && <div className="table-wrap members-table" tabIndex={0} role="region" aria-label="Organization members"><table className="program-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Can submit reports</th><th scope="col">Actions</th></tr></thead>
      <tbody>{members.map(member => <tr key={member.id}>
        <td className="program-name">{member.name}</td><td>{member.email}</td><td>{member.role === 'member' ? 'Member' : 'Admin'}</td>
        <td>{member.role === 'member' ? <input type="checkbox" checked={member.canSubmit} disabled={busy}
          aria-label={`Can submit reports for ${member.name}`} onChange={() => changeMember(member, 'PATCH')} /> : 'Yes'}</td>
        <td>{member.role === 'member' && <button type="button" disabled={busy}
          aria-label={`Remove ${member.name}`} onClick={() => { setRemoveTarget(member); removeDialog.current.showModal(); }}>Remove</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    <dialog ref={removeDialog} className="member-confirm" aria-labelledby="remove-member-heading"
      onClose={() => setRemoveTarget(null)}>
      <h2 id="remove-member-heading">Remove {removeTarget?.name} from this organization?</h2>
      <p>They’ll lose access to this organization’s dashboard and reports.</p>
      <form method="dialog">
        <button autoFocus>Cancel</button>
        <button type="button" className="member-confirm-remove" onClick={() => {
          changeMember(removeTarget, 'DELETE');
          removeDialog.current.close();
        }}>Remove member</button>
      </form>
    </dialog>
    <style>{`
      .members-table .program-table { min-width: 620px; }
      .members-table input[type="checkbox"] { width: 18px; height: 18px; accent-color: #386741; vertical-align: middle; }
      .members-table button { font: inherit; font-weight: 700; color: #912018; border: 1px solid #d9a09c; border-radius: 999px; background: #fff; padding: 5px 12px; cursor: pointer; }
      .member-confirm { width: min(450px, calc(100% - 32px)); padding: 24px; border: 1px solid #dce3da; border-radius: 16px; color: #111; box-shadow: 0 12px 40px #0003; }
      .member-confirm::backdrop { background: #0006; }
      .member-confirm h2 { margin: 0; font-size: 24px; line-height: 1.2; }
      .member-confirm p { margin: 12px 0 20px; }
      .member-confirm form { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
      .member-confirm button { border: 1px solid #dce3da; border-radius: 999px; padding: 8px 16px; background: #fff; color: #111; font: inherit; font-weight: 700; cursor: pointer; }
      .member-confirm .member-confirm-remove { background: #b42318; color: #fff; border-color: #b42318; }
      .members-table button:hover { background: #fef3f2; }
    `}</style>
    </div>
  </div></main>;
}
