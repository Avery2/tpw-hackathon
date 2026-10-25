// Static PDF previews stay available even when the demo dashboard's data service is down.
import { getDemoAccount } from './member-session.js';
const ROOT = new URL('../', import.meta.url);
const files = {
  'org-1': ['Org 1 annual report (PDF)', 'report/organizations/org-1-annual-report-2026.pdf'],
  'org-2': ['Org 2 annual report (PDF)', 'report/organizations/org-2-annual-report-2026.pdf'],
  tpw: ['TPW annual report (PDF)', 'report/TPW-Collective-Impact-Report-2026.pdf']
};
function render() {
  const area = document.getElementById('dashboard-report');
  const key = location.hash.slice(1) || (location.pathname.includes('/team-dashboard/') ? getDemoAccount() || '' : '');
  const file = files[key];
  area.hidden = !file;
  if (!file) return;
  const link = area.querySelector('a');
  link.textContent = `${file[0]} ↗`;
  link.href = new URL(file[1], ROOT).href;
  area.querySelector('small').textContent = key === 'tpw'
    ? 'Combined TPW prototype · June 2026 source snapshot · not a live annual account. Opens in a new tab; download from the PDF viewer.'
    : 'Fictional demo data · fixed October 24, 2026 snapshot, not live dashboard totals. Opens in a new tab; download from the PDF viewer.';
}
window.addEventListener('hashchange', render);
render();
