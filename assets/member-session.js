// A demo view preference, NOT authentication or an authorization boundary.
// Store only the fictional account key, never credentials or form contents.
import { isSandboxMode } from './neon-config.js?v=sandbox-1';
import { isNeonMode, getCachedContext } from './neon-auth-client.js?v=sandbox-1';

// Profiles are a display convenience, not authority; RPCs enforce membership in PostgreSQL.
export function accountProfile(account = getDemoAccount()) {
  if (isNeonMode()) {
    const context = getCachedContext();
    if (!context?.ok || !context.userId) return null;
    if (account === 'tpw') return context.isStaff ? { id: 'tpw', name: 'TPW View', admin: true } : null;
    return context.orgs?.find(org => org.id === account) || null;
  }
  return Object.hasOwn(demoAccounts, account) ? { id: account, name: demoAccounts[account], admin: account === 'tpw' } : null;
}

export const demoAccounts = Object.freeze({ 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' });
const KEY = 'tpw.member.demo.v1';
let current = null;
if (typeof window !== 'undefined') window.addEventListener?.('tpw:neon-change', () => { current = null; });
export function getDemoAccount() {
  if (isNeonMode()) {
    const context = getCachedContext();
    return context?.ok && context.userId ? context.accountKey : null;
  }
  try { current = sessionStorage.getItem(KEY) || current; } catch { /* Storage may be disabled. */ }
  return Object.hasOwn(demoAccounts, current) ? current : isSandboxMode() ? 'org-1' : null;
}
export function setDemoAccount(account) {
  if (isNeonMode()) return false; // A demo selector must never establish authenticated identity.
  if (!Object.hasOwn(demoAccounts, account)) return false;
  current = account;
  try { sessionStorage.setItem(KEY, account); } catch { /* Links also carry the demo account. */ }
  return true;
}
// Direct destination used by the account drawer's Intake link and legacy entries.
// Signed out, it carries no account: following a link must never sign anyone in as Org 1.
export function demoEntryPath(account = getDemoAccount()) {
  if (isNeonMode()) return 'intake/simple.html?backend=neon';
  if (isSandboxMode()) return `intake/simple.html?backend=demo&account=${Object.hasOwn(demoAccounts, account) ? account : 'org-1'}`;
  return Object.hasOwn(demoAccounts, account) ? `intake/simple.html?account=${account}` : 'intake/simple.html';
}
// Links for a signed-in member; signed out there are none. assets/site-shell.js shows them in the
// member bar under the top menu (Log data, Dashboard, Annual report); the top menu stays TPW's own.
const REPORTS = Object.freeze({
  'org-1': 'report/organizations/org-1-annual-report-2026.pdf',
  'org-2': 'report/organizations/org-2-annual-report-2026.pdf',
  tpw: 'report/TPW-Collective-Impact-Report-2026.pdf'
});
export function memberMenu(account = getDemoAccount()) {
  if (isNeonMode()) return accountProfile(account) ? [
    { label: 'Log data', path: demoEntryPath(account) },
    { label: 'Dashboard', path: `team-dashboard/?backend=neon#${encodeURIComponent(account)}` }
  ] : [];
  if (!Object.hasOwn(demoAccounts, account)) return [];
  return [
    { label: 'Log data', path: demoEntryPath(account) },
    { label: 'Dashboard', path: `team-dashboard/${isSandboxMode() ? '?backend=demo' : ''}#${account}` },
    { label: 'Annual report', path: REPORTS[account], newTab: true }
  ];
}
export function clearDemoAccount() {
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* No credentials are stored. */ }
}
