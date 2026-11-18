import { demoApi } from '../../assets/neon-api.js';
import { loadingSkeleton } from './loading.js';
import { renderSubmissionTracker } from './submission-tracker.js?v=paginated-1';
import { updateWorkspace } from './workspace-adapter.js?v=history-download-1';

export function mountDashboardView(root = document) {
  let revision = 0;
  async function render() {
    const token = ++revision;
    const account = location.hash.slice(1);
    if (!['org-1', 'org-2', 'tpw'].includes(account)) { location.replace('/team-dashboard/'); return; }
    updateWorkspace(account, 'submissions');
    root.querySelector('.submission-choices').hidden = account === 'tpw';
    root.querySelector('#view-submission-data').href = `./submission-data.html#${account}`;
    const tracker = root.querySelector('#submission-tracker');
    tracker.hidden = account !== 'tpw';
    if (account !== 'tpw') return;
    const history = document.createElement('a');
    history.className = 'action switch';
    history.href = `./submission-data.html#${account}`;
    history.textContent = 'View submission history';
    tracker.setAttribute('aria-busy', 'true'); tracker.replaceChildren(loadingSkeleton('cards'));
    try {
      const data = await demoApi('submission-tracking');
      if (token === revision) {
        renderSubmissionTracker(tracker, data);
        tracker.prepend(history);
      }
    } catch (error) {
      if (token !== revision) return;
      tracker.textContent = 'Could not load submission tracking. ';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again'; retry.onclick = render; tracker.append(retry);
    } finally { if (token === revision) tracker.removeAttribute('aria-busy'); }

  }
  const onHashChange = render;
  window.addEventListener('hashchange', onHashChange);
  render();
  return () => {
    revision++;
    window.removeEventListener('hashchange', onHashChange);
    root.replaceChildren();
  };
}

if (!document.body.hasAttribute("data-next-workspace")) mountDashboardView();
