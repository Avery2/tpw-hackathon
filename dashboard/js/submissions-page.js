import { loadDashboard } from './data.js?v=valid-orgs-1';
import { loadingSkeleton } from './loading.js';
import { renderSubmissionTracker } from './submission-tracker.js?v=paginated-1';
let revision = 0;
import { updateWorkspace } from './layout.js?v=shared-nav-2';
async function render() {
  const token = ++revision;
  const account = location.hash.slice(1);
  if (!['org-1', 'org-2', 'tpw'].includes(account)) { location.replace('./'); return; }
  updateWorkspace(account, 'submissions');
  document.querySelector('.submission-choices').hidden = account === 'tpw';
  document.querySelector('#view-submission-data').href = `./submission-data.html#${account}`;
  const tracker = document.querySelector('#submission-tracker');
  tracker.hidden = account !== 'tpw';
  if (account !== 'tpw') return;
  tracker.setAttribute('aria-busy', 'true'); tracker.replaceChildren(loadingSkeleton('cards'));
  try {
    const data = await loadDashboard(null);
    if (token === revision) renderSubmissionTracker(tracker, data);
  } catch (error) {
    if (token !== revision) return;
    tracker.textContent = 'Could not load submission tracking. ';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again'; retry.onclick = render; tracker.append(retry);
  } finally { if (token === revision) tracker.removeAttribute('aria-busy'); }

}
window.addEventListener('hashchange', render);
render();
