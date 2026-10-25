// Dashboard pages and intake share the same website chrome and member sidebar.
import { updateMemberWorkspace } from '../../assets/site-shell.js';
import { demoAccounts, getDemoAccount, demoEntryPath } from '../../assets/member-session.js';

export function updateWorkspace(account, page) {
  if (!Object.hasOwn(demoAccounts, account) || page === 'programs') {
    // Old entry points return to logging; the disconnected register is retired from navigation.
    const key = Object.hasOwn(demoAccounts, account) ? account : getDemoAccount();
    location.replace(new URL(demoEntryPath(key), new URL('../../', import.meta.url)));
    return;
  }
  updateMemberWorkspace(account, page);
}
