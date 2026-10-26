// Log data: shows the quarterly form (team-form/) embedded in the page.
//
// Removed 26 Oct 2026: the follow-up and older quarter forms, and the second
// Apps Script they sent to. The follow-up form asked for a participant ID per
// person, which TPW asked us not to collect, and nothing else needed that script.
// Old addresses such as #followup, #aggregate or #session now land here too.

import { getDemoAccount } from '../../assets/member-session.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The quarterly form stays embedded and resizes with each step.
 * Its own header/footer are hidden; the parent page provides navigation.
 * The member's demo account goes with it, so the form can start from last quarter's report.
 */
function demoPanel() {
  const account = new URLSearchParams(location.search).get('account') || getDemoAccount();
  const src = `../team-form/?embed=1${account ? `&account=${encodeURIComponent(account)}` : ''}`;
  return `
    <div class="demo-panel">
      <iframe src="${esc(src)}" title="Quarterly totals form" loading="lazy"></iframe>
    </div>`;
}

function render() {
  document.getElementById('tabs').innerHTML = '<a href="#" aria-current="page">Quarterly totals</a>';
  const note = document.getElementById('bar-note');
  if (note) note.textContent = 'Demo build: guided submissions append to TPW’s Google Sheet, not CDCR. Sign-in is not enabled yet; use synthetic test data only.';
  document.getElementById('app').innerHTML = demoPanel();
}

render();
