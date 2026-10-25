// Node built-ins only. No network, credentials, or real user data.
import assert from 'node:assert/strict';
const values = new Map([['unrelated-draft', 'keep me']]);
globalThis.sessionStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const session = await import('../../assets/member-session.js');
assert.equal(session.getDemoAccount(), null);
// Signed out, the entry carries no account: a link must never sign anyone in as Org 1.
assert.equal(session.demoEntryPath(), 'intake/simple.html');
for (const invalid of ['', null, undefined, '__proto__', 'constructor', 'someone@example.invalid']) {
  assert.equal(session.setDemoAccount(invalid), false);
  assert.equal(session.demoEntryPath(invalid), 'intake/simple.html');
}
for (const account of Object.keys(session.demoAccounts)) {
  assert.equal(session.setDemoAccount(account), true);
  assert.equal(session.getDemoAccount(), account);
  assert.equal(session.demoEntryPath(), `intake/simple.html?account=${account}`);
}
assert.deepEqual([...values.keys()].sort(), ['tpw.member.demo.v1', 'unrelated-draft']);
session.clearDemoAccount();
assert.equal(session.getDemoAccount(), null);
assert.equal(values.get('unrelated-draft'), 'keep me');
values.set('tpw.member.demo.v1', 'unknown');
assert.equal(session.getDemoAccount(), null);
// Private browsing / blocked storage degrades to an in-document view preference.
globalThis.sessionStorage = new Proxy({}, { get() { throw new Error('Storage blocked'); } });
assert.equal(session.setDemoAccount('org-1'), true);
assert.equal(session.getDemoAccount(), 'org-1');
session.clearDemoAccount();
assert.equal(session.getDemoAccount(), null);
console.log('PASS demo account allowlist, persistence, sign-out isolation and blocked-storage fallback. No authentication is implied.');
