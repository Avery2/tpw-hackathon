// Dashboard pages and intake share the same website chrome and member sidebar.
import { updateMemberWorkspace } from '../../assets/site-shell.js?v=sandbox-1';
import { accountProfile, getDemoAccount, demoEntryPath } from '../../assets/member-session.js?v=sandbox-1';
import { authStateReady, isNeonMode, NEON_SIGN_IN_HREF } from '../../assets/neon-auth-client.js?v=sandbox-1';

export async function resolveAccount(fallback = false) {
  if (isNeonMode()) {
    await authStateReady();
    return getDemoAccount(); // Verified default context, never a URL identity.
  }
  return location.hash.slice(1) || (fallback ? getDemoAccount() : null);
}
export function dashboardHref(path, account) {
  return `${path}${isNeonMode() ? '?backend=neon' : ''}#${encodeURIComponent(account)}`;
}
export function showLoadError(container, error, fallback) {
  container.textContent = isNeonMode() ? (error.message || fallback) : fallback;
  if (isNeonMode() && (error.status === 401 || error.name === 'AuthRequiredError')) {
    const link = document.createElement('a'); link.href = NEON_SIGN_IN_HREF;
    link.textContent = 'Sign in'; container.append(' ', link);
  }
}

export function updateWorkspace(account, page) {
  if (!accountProfile(account)) {
    // A profile is only display metadata; the server enforces access on every request.
    location.replace(isNeonMode() ? NEON_SIGN_IN_HREF : new URL(demoEntryPath(getDemoAccount()), new URL('../../', import.meta.url)));
    return;
  }
  updateMemberWorkspace(account, page);
}
