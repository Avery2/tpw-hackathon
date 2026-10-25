import { updateWorkspace } from './layout.js';
import { racPanel } from './rac.js';
import { participantsChart } from './chart.js';
import { loadDashboard, existingPrograms } from './data.js';
const views = { 'org-1': { name: 'Org 1' }, 'org-2': { name: 'Org 2' }, tpw: { name: 'TPW View', admin: true } };
let revision = 0;
const $ = selector => document.querySelector(selector);
function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}
const number = value => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
function renderPrograms(data, admin) {
  const programs = existingPrograms(data.submissions);
  const container = $('#view-sections'); container.replaceChildren();
  const summary = element('div', 'program-stats');
  for (const [label, value] of [['Programs', programs.length], ['Prisons', new Set(programs.flatMap(program => (program.assignments || []).map(item => item.code))).size], ['Submissions', data.submissions.length]]) {
    const tile = element(label === 'Programs' ? 'a' : 'div', 'program-stat');
    if (label === 'Programs') {
      tile.href = `./programs.html${location.hash}`;
      tile.setAttribute('aria-label', `View ${value} programs`);
    }
    tile.append(element('strong', '', number(value)), element('span', '', label)); summary.append(tile);
  }
  const overview = element('div', 'dashboard-overview');
  overview.append(summary, participantsChart(data.submissions));
  container.append(overview, racPanel(programs));
}

async function renderView(focus = false) {
  const token = ++revision;
  const key = location.hash.slice(1); const view = views[key];
  updateWorkspace(key, 'overview');
  $('#signin').hidden = Boolean(view); $('#profile-view').hidden = !view;
  if (!view) { if (focus) $('#signin-heading').focus(); return; }
  $('#profile-heading').textContent = view.name;
  $('#view-type').textContent = view.admin ? 'TPW overview' : 'Organization';
  $('#view-description').textContent = view.admin ? 'Programs across the TPW network.' : 'Your programs and the places they serve.';
  $('#dashboard-status').hidden = false;
  $('#dashboard-status').textContent = 'Loading programs…';
  $('#view-sections').replaceChildren(); $('#profile-view').setAttribute('aria-busy', 'true');
  if (focus) $('#profile-heading').focus();
  try {
    const data = await loadDashboard(view.admin ? null : key);
    if (token !== revision) return;
    $('#profile-heading').textContent = data.org?.name || view.name;
    $('#dashboard-status').hidden = true;
    renderPrograms(data, view.admin);
  } catch (error) {
    if (token !== revision) return;
    console.error('Dashboard load failed:', error);
    $('#dashboard-status').textContent = 'Programs could not be loaded. Check your connection and try again.';
    const retry = element('button', 'action switch', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => renderView()); $('#view-sections').append(retry);
  } finally { if (token === revision) $('#profile-view').removeAttribute('aria-busy'); }
}
window.addEventListener('hashchange', () => renderView(true));
renderView();
