// Dashboard pages and intake share the same website chrome and member sidebar.
import { updateMemberWorkspace } from '../../assets/site-shell.js';
import { demoAccounts, getDemoAccount } from '../../assets/member-session.js';

export function updateWorkspace(account, page) {
  if (!Object.hasOwn(demoAccounts, account)) {
    const previous = getDemoAccount();
    location.replace(previous ? `./#${previous}` : '../members/');
    return;
  }
  updateMemberWorkspace(account, page);
}
