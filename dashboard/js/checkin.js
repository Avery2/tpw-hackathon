import { loadingSkeleton } from './loading.js';
import { updateWorkspace } from './layout.js?v=submissions-1';
function render() {
  const org = location.hash.slice(1);
  if (!['org-1','org-2'].includes(org)) { location.replace('./'); return; }
  updateWorkspace(org, 'checkin');
  const frame = document.querySelector('#checkin-form');
  const status = document.querySelector('#checkin-status');
  status.hidden = false; status.replaceChildren(loadingSkeleton('form'));
  frame.hidden = true;
  frame.onload = () => { status.hidden = true; frame.hidden = false; };
  frame.src = `../form-demo/?embed=1&checkin=${encodeURIComponent(org)}`;

}
window.addEventListener('hashchange', render);
render();
