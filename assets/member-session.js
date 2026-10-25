// A demo view preference, NOT authentication or an authorization boundary.
// Store only the fictional account key, never credentials or form contents.
export const demoAccounts = Object.freeze({ 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' });
const KEY = 'tpw.member.demo.v1';
let current = null;
export function getDemoAccount() {
  try { current = sessionStorage.getItem(KEY) || current; } catch { /* Storage may be disabled. */ }
  return Object.hasOwn(demoAccounts, current) ? current : null;
}
export function setDemoAccount(account) {
  if (!Object.hasOwn(demoAccounts, account)) return false;
  current = account;
  try { sessionStorage.setItem(KEY, account); } catch { /* Links also carry the demo account. */ }
  return true;
}
// Direct destination used by the account drawer's Intake link and legacy entries.
// Signed out, it carries no account: following a link must never sign anyone in as Org 1.
export function demoEntryPath(account = getDemoAccount()) {
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
  if (!Object.hasOwn(demoAccounts, account)) return [];
  return [
    { label: 'Log data', path: demoEntryPath(account) },
    { label: 'Dashboard', path: `team-dashboard/#${account}` },
    { label: 'Annual report', path: REPORTS[account], newTab: true }
  ];
}
export function clearDemoAccount() {
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* No credentials are stored. */ }
}
