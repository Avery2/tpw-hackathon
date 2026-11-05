import { loadDashboard } from './data.js?v=sandbox-1';
import { loadingSkeleton } from './loading.js?v=tip-20261025';
import { renderSubmissionTracker } from './submission-tracker.js?v=tip-20261025';
let revision = 0;
import { updateWorkspace, resolveAccount, dashboardHref, showLoadError } from './layout.js?v=sandbox-1';
import { accountProfile } from '../../assets/member-session.js?v=sandbox-1';
import { isNeonMode } from '../../assets/neon-auth-client.js?v=sandbox-1';
async function render() {
  const token = ++revision;
  const tracker = document.querySelector('#submission-tracker');
  document.querySelector('.submission-choices').hidden = true;
  try {
  const account = await resolveAccount(); if (token !== revision) return;
  const profile = accountProfile(account);
  if (!profile) { if (isNeonMode()) updateWorkspace(account, 'submissions'); else location.replace('./'); return; }
  const admin = Boolean(profile.admin);
  updateWorkspace(account, 'submissions');
  document.querySelector('.submission-choices').hidden = admin;
  document.querySelector('#view-submission-data').href = dashboardHref('./submission-data.html', account);
  tracker.hidden = !admin;
  if (!admin) return;
  tracker.setAttribute('aria-busy', 'true'); tracker.replaceChildren(loadingSkeleton('cards'));
    const data = await loadDashboard(null);
    if (token === revision) renderSubmissionTracker(tracker, data);
  } catch (error) {
    if (token !== revision) return;
    tracker.hidden = false;
    showLoadError(tracker, error, 'Could not load submission tracking. ');
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again'; retry.onclick = render; tracker.append(retry);
  } finally { if (token === revision) tracker.removeAttribute('aria-busy'); }

}
window.addEventListener('hashchange', render);
render();
