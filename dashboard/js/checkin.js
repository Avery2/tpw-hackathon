import { loadingSkeleton } from './loading.js';
import { updateWorkspace } from './layout.js?v=shared-nav-2';
let frameObserver;
function render() {
  frameObserver?.disconnect();
  const org = location.hash.slice(1);
  if (!['org-1','org-2'].includes(org)) { location.replace('./'); return; }
  updateWorkspace(org, 'checkin');
  const frame = document.querySelector('#checkin-form');
  const status = document.querySelector('#checkin-status');
  status.hidden = false; status.replaceChildren(loadingSkeleton('form'));
  frame.hidden = true;
  frame.onload = () => {
    status.hidden = true; frame.hidden = false;
    const content = frame.contentDocument?.querySelector('main');
    if (!content) return;
    const fit = () => { frame.style.height = `${Math.ceil(content.getBoundingClientRect().height)}px`; };
    frameObserver = new ResizeObserver(fit);
    frameObserver.observe(content);
    fit();
  };
  frame.src = `../form-demo/?embed=1&v=checkin-success-18&checkin=${encodeURIComponent(org)}`;

}
window.addEventListener('hashchange', render);
render();
