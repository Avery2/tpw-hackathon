import { updateWorkspace } from './layout.js?v=submissions-1';
function render() {
  const account = location.hash.slice(1);
  if (!['org-1', 'org-2', 'tpw'].includes(account)) { location.replace('./'); return; }
  updateWorkspace(account, 'submissions');
  document.querySelector('#view-submission-data').href = `./submission-data.html#${account}`;
}
window.addEventListener('hashchange', render);
render();
