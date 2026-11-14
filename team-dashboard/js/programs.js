import { loadingSkeleton } from './loading.js';
import { updateWorkspace } from './workspace-adapter.js?v=history-download-1';
import { programCards } from './cards.js';
import { demoApi } from '../../assets/neon-api.js';
import { appendPagination } from './pagination.js';
const $ = selector => document.querySelector(selector);
const views = { 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' };
const columns = [
  ['organization', 'Organization'], ['name', 'Program'], ['status', 'Status'],
  ['prison', 'Facility'], ['yards', 'Yards'], ['startDate', 'Start date'], ['endDate', 'End date'],
  ['courseHours', 'Course hours'], ['participants', 'Participants'], ['participantsCompleted', 'Completed']
];
const numeric = new Set(['courseHours', 'participants', 'participantsCompleted']);
let viewMode = 'table';
let result, page = 1, searchTimer, sortKey = 'name', ascending = true, revision = 0;
function node(tag, text, className) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
  if (className) element.className = className; return element;
}
function render() {
  const { items, count, total, offset } = result;
  $('#program-count').textContent = `${count} of ${total} ${viewMode === 'cards' ? 'programs' : 'facility assignments'}`;
  const container = $('#program-table-container'); container.replaceChildren();
  if (!items.length) { container.append(node('p', total ? 'No programs match your search.' : 'No programs have been submitted yet.', 'table-empty')); return; }
  const paginate = () => appendPagination(container, result, next => { page = next; load(); });
  if (viewMode === 'cards') {
    container.append(programCards(items, location.hash === '#tpw'));
    paginate();
    return;
  }
  const wrap = node('div', undefined, 'table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable program register');
  const table = node('table', undefined, 'program-table');
  table.append(node('caption', 'One row per program and facility assignment. Counts describe the whole program and repeat across its facilities. Click a column heading to sort.'));
  const head = node('thead'); const header = node('tr'); header.append(node('th', '#'));
  for (const [key, label] of columns) {
    const th = node('th'); th.scope = 'col'; th.setAttribute('aria-sort', sortKey === key ? ascending ? 'ascending' : 'descending' : 'none');
    const button = node('button', `${label} ${sortKey === key ? ascending ? '↑' : '↓' : '↕'}`); button.type = 'button';
    button.addEventListener('click', async () => {
      ascending = sortKey === key ? !ascending : true;
      sortKey = key;
      page = 1;
      const scroll = wrap.scrollLeft;
      if (await load()) {
        const next = container.querySelector('.table-wrap');
        if (next) {
          next.scrollLeft = scroll;
          next.querySelectorAll('thead button')[columns.findIndex(([column]) => column === key)]?.focus({ preventScroll: true });
        }
      }
    });
    th.append(button); header.append(th);
  }
  head.append(header); table.append(head);
  const body = node('tbody');
  items.forEach((row, index) => {
    const tr = node('tr'); tr.append(node('td', String(offset + index + 1), 'row-number'));
    for (const [key] of columns) {
      const td = node('td', numeric.has(key) ? (Number(row[key]) || 0).toLocaleString() : row[key] || '—', numeric.has(key) ? 'numeric' : key === 'name' ? 'program-name' : '');
      if (key === 'status') { td.replaceChildren(); const badge = node('span', row[key] || 'Not specified', 'program-status'); badge.dataset.status = row[key]; td.append(badge); }
      tr.append(td);
    }
    body.append(tr);
  });
  table.append(body); wrap.append(table); container.append(wrap); paginate();
}
async function load() {
  const token = ++revision;
  const key = location.hash.slice(1);
  if (!views[key]) { location.replace('./'); return; }
  updateWorkspace(key, 'programs');
  $('#back-dashboard').href = `./#${key}`;
  $('#program-scope').textContent = views[key];
  $('#program-count').textContent = 'Loading programs…';
  $('#program-table-container').setAttribute('aria-busy', 'true');
  $('#program-table-container').replaceChildren(loadingSkeleton(viewMode === 'table' ? 'table' : 'cards'));
  try {
    const query = new URLSearchParams({ page, view: viewMode, sort: sortKey,
      direction: ascending ? 'asc' : 'desc', search: $('#program-search').value });
    if (key !== 'tpw') query.set('org', key);
    const data = await demoApi(`programs?${query}`);
    if (token !== revision) return;
    result = data;
    page = data.page;
    render();
    return true;
  } catch (error) {
    if (token !== revision) return;
    console.error('Program register load failed:', error);
    $('#program-count').textContent = 'Could not load programs. Please try again.';
    $('#program-table-container').replaceChildren();
    const retry = node('button', 'Try again', 'action switch'); retry.type = 'button'; retry.addEventListener('click', load); $('#program-table-container').append(retry);
  } finally { if (token === revision) $('#program-table-container').removeAttribute('aria-busy'); }
}
$('#program-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page = 1; load(); }, 250);
});
for (const button of document.querySelectorAll('[data-program-view]')) {
  button.addEventListener('click', () => {
    viewMode = button.dataset.programView;
    for (const control of document.querySelectorAll('[data-program-view]')) control.setAttribute('aria-pressed', String(control === button));
    page = 1; load();
  });
}
window.addEventListener('hashchange', () => { page = 1; load(); });
load();
