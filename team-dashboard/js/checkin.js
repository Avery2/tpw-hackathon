import { updateWorkspace } from './layout.js';
function render() {
  const org = location.hash.slice(1);
  if (!['org-1','org-2'].includes(org)) { location.replace('./'); return; }
  updateWorkspace(org, 'checkin');
  const frame = document.querySelector('#checkin-form');
  frame.src = `../team-form/?embed=1&checkin=${encodeURIComponent(org)}`;
  frame.hidden = false; document.querySelector('#checkin-status').hidden = true;
}
window.addEventListener('hashchange', render);
render();
