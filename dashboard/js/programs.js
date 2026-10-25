import { loadingSkeleton } from './loading.js';
import { updateWorkspace } from './layout.js?v=shared-nav-2';
import { programCards } from './cards.js';
import { loadDashboard, existingPrograms } from './data.js';
const $ = selector => document.querySelector(selector);
const views = { 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW View' };
const columns = [
  ['organization', 'Organization'], ['name', 'Program'], ['status', 'Status'],
  ['prison', 'Facility'], ['yards', 'Yards'], ['startDate', 'Start date'], ['endDate', 'End date'],
  ['courseHours', 'Course hours'], ['participants', 'Participants'], ['participantsCompleted', 'Completed']
];
const numeric = new Set(['courseHours', 'participants', 'participantsCompleted']);
let viewMode = 'table';
let rows = [], sortKey = 'name', ascending = true, revision = 0;
function node(tag, text, className) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
  if (className) element.className = className; return element;
}
function render() {
  const search = $('#program-search').value.trim().toLowerCase();
  const filtered = rows.filter(row => columns.some(([key]) => String(row[key] ?? '').toLowerCase().includes(search)));
  filtered.sort((a, b) => (numeric.has(sortKey) ? Number(a[sortKey] || 0) - Number(b[sortKey] || 0) : String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), undefined, { numeric: true })) * (ascending ? 1 : -1));
  $('#program-count').textContent = `${filtered.length} of ${rows.length} facility assignments`;
  const container = $('#program-table-container'); container.replaceChildren();
  if (!filtered.length) { container.append(node('p', rows.length ? 'No programs match your search.' : 'No programs have been submitted yet.', 'table-empty')); return; }
  if (viewMode === 'cards') {
    const programs = [...new Set(filtered.map(row => row.program))];
    $('#program-count').textContent = `${programs.length} programs`;
    container.append(programCards(programs, location.hash === '#tpw'));
    return;
  }
  const wrap = node('div', undefined, 'table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable program register');
  const table = node('table', undefined, 'program-table');
  table.append(node('caption', 'One row per program and facility assignment. Counts describe the whole program and repeat across its facilities. Click a column heading to sort.'));
  const head = node('thead'); const header = node('tr'); header.append(node('th', '#'));
  for (const [key, label] of columns) {
    const th = node('th'); th.scope = 'col'; th.setAttribute('aria-sort', sortKey === key ? ascending ? 'ascending' : 'descending' : 'none');
    const button = node('button', `${label} ${sortKey === key ? ascending ? '↑' : '↓' : '↕'}`); button.type = 'button';
    button.addEventListener('click', () => { ascending = sortKey === key ? !ascending : true; sortKey = key; const scroll = wrap.scrollLeft; render(); const next = container.querySelector('.table-wrap'); if (next) { next.scrollLeft = scroll; next.querySelectorAll('thead button')[columns.findIndex(([column]) => column === key)].focus({preventScroll:true}); } });
    th.append(button); header.append(th);
  }
  head.append(header); table.append(head);
  const body = node('tbody');
  filtered.forEach((row, index) => {
    const tr = node('tr'); tr.append(node('td', String(index + 1), 'row-number'));
    for (const [key] of columns) {
      const td = node('td', numeric.has(key) ? (Number(row[key]) || 0).toLocaleString() : row[key] || '—', numeric.has(key) ? 'numeric' : key === 'name' ? 'program-name' : '');
      if (key === 'status') { td.replaceChildren(); const badge = node('span', row[key] || 'Not specified', 'program-status'); badge.dataset.status = row[key]; td.append(badge); }
      tr.append(td);
    }
    body.append(tr);
  });
  table.append(body); wrap.append(table); container.append(wrap);
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
  $('#program-table-container').replaceChildren(loadingSkeleton(viewMode === 'table' ? 'table' : 'cards')); $('#program-search').disabled = true;
  try {
    const data = await loadDashboard(key === 'tpw' ? null : key);
    if (token !== revision) return;
    rows = existingPrograms(data.submissions).flatMap(program => {
      const assignments = program.assignments?.length ? program.assignments : [{}];
      return assignments.map(assignment => ({ ...program, program, prison: program.prisons.find(prison => prison.code === assignment.code)?.name || assignment.code || '', yards: (assignment.yards || []).join(', ') }));
    });
    $('#program-search').disabled = false; render();
  } catch (error) {
    if (token !== revision) return;
    console.error('Program register load failed:', error);
    $('#program-count').textContent = 'Could not load programs. Please try again.';
    $('#program-table-container').replaceChildren();
    const retry = node('button', 'Try again', 'action switch'); retry.type = 'button'; retry.addEventListener('click', load); $('#program-table-container').append(retry);
  } finally { if (token === revision) $('#program-table-container').removeAttribute('aria-busy'); }
}
$('#program-search').addEventListener('input', render);
for (const button of document.querySelectorAll('[data-program-view]')) {
  button.addEventListener('click', () => {
    viewMode = button.dataset.programView;
    for (const control of document.querySelectorAll('[data-program-view]')) control.setAttribute('aria-pressed', String(control === button));
    if (!$('#program-search').disabled) render();
    else if ($('#program-table-container').getAttribute('aria-busy') === 'true') $('#program-table-container').replaceChildren(loadingSkeleton(viewMode === 'table' ? 'table' : 'cards'));
  });
}
window.addEventListener('hashchange', load);
load();
