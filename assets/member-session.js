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
export function demoEntryPath(account = getDemoAccount()) {
  const key = Object.hasOwn(demoAccounts, account) ? account : 'org-1';
  return `intake/simple.html?account=${key}`;
}
export function clearDemoAccount() {
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* No credentials are stored. */ }
}
