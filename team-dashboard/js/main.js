import { demoApi } from '../../assets/neon-api.js';
import { updateWorkspace } from './workspace-adapter.js?v=history-download-1';
import { racPanel } from './rac.js?v=overview-api-1';
import { participantsChart } from './chart.js?v=overview-api-1';
import { loadDashboard, existingPrograms } from './data.js';

export function mountDashboardView(root = document) {
  const views = { 'org-1': { name: 'Org 1' }, 'org-2': { name: 'Org 2' }, tpw: { name: 'TPW View', admin: true } };
  let revision = 0;
  const $ = selector => root.querySelector(selector);
  function element(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  const number = value => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  function renderPrograms(data, admin) {
    const aggregate = admin ? data : null;
    const programs = aggregate ? [] : existingPrograms(data.submissions);
    const container = $('#view-sections'); container.replaceChildren();
    const summary = element('div', 'program-stats');
    const totalParticipants = aggregate?.participants ?? programs.reduce((sum, program) => sum + Math.max(0, Number(program.participants) || 0), 0);
    const completedHours = aggregate?.hours ?? programs.reduce((sum, program) => sum + Math.max(0, Number(program.courseHours) || 0) * Math.max(0, Number(program.participantsCompleted) || 0), 0);
    const completions = aggregate?.completed ?? programs.reduce((sum, program) => sum + Math.max(0, Number(program.participantsCompleted) || 0), 0);
    const metrics = [
      ...(admin ? [['Registered organizations', aggregate.organizationCount]] : []),
      ['Programs', aggregate?.programCount ?? programs.length],
      ['Facilities', aggregate?.facilityCount ?? new Set(programs.flatMap(program => (program.assignments || []).map(item => item.code))).size],
      ['Submissions', aggregate?.submissionCount ?? data.submissions.length],
      ['Total participants', totalParticipants],
      ...(admin ? [['Participants completed', completions], ['Completion rate', totalParticipants ? `${(completions / totalParticipants * 100).toFixed(1)}%` : '—']] : []),
      ['Total hours completed', completedHours]
    ];
    for (const [label, value] of metrics) {
      const tile = element(label === 'Programs' || label === 'Registered organizations' ? 'a' : 'div', 'program-stat');
      if (label === 'Programs') {
        tile.href = `./programs.html${location.hash}`;
        tile.setAttribute('aria-label', `View ${value} programs`);
      }
      if (label === 'Registered organizations') tile.href = './organizations.html#tpw';
      tile.append(element('strong', '', typeof value === 'string' ? value : number(value)), element('span', '', label)); summary.append(tile);
    }
    const overview = element('div', 'dashboard-overview');
    overview.append(summary, participantsChart(data.submissions, aggregate?.points));
    container.append(overview, racPanel(programs, { collective: admin, totalDays: aggregate?.programCount ? aggregate.racDays : undefined }));
  }

  function renderLoading(admin = false) {
    const container = $('#view-sections');
    const skeleton = element('div', 'dashboard-skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    const overview = element('div', 'dashboard-overview');
    const stats = element('div', 'program-stats');
    for (let i = 0; i < (admin ? 8 : 5); i++) {
      const tile = element('div', 'program-stat');
      tile.append(element('span', 'skeleton-block skeleton-number'), element('span', 'skeleton-block skeleton-label')); stats.append(tile);
    }
    const chart = element('div', 'participants-chart skeleton-chart');
    const top = element('div', 'skeleton-chart-heading');
    top.append(element('span', 'skeleton-block skeleton-title'), element('span', 'skeleton-block skeleton-pills'));
    chart.append(top, element('span', 'skeleton-block skeleton-number'), element('span', 'skeleton-block skeleton-description'), element('div', 'skeleton-plot'));
    overview.append(stats, chart);
    const impact = element('div', 'rac-panel');
    impact.append(element('span', 'skeleton-block skeleton-title'));
    const pair = element('div', 'rac-pair');
    for (let i = 0; i < 2; i++) {
      const card = element('div', 'rac-org');
      card.append(element('span', 'skeleton-block skeleton-label'), element('span', 'skeleton-block skeleton-number'), element('span', 'skeleton-block skeleton-description')); pair.append(card);
    }
    impact.append(pair); skeleton.append(overview, impact); container.replaceChildren(skeleton);
  }
  async function renderView(focus = false) {
    const token = ++revision;
    const key = location.hash.slice(1); const view = views[key];
    updateWorkspace(key, 'overview');
    $('#signin').hidden = Boolean(view); $('#profile-view').hidden = !view;
    if (!view) { if (focus) $('#signin-heading').focus(); return; }
    $('#profile-heading').textContent = view.admin ? 'Collective overview' : view.name;
    $('#view-type').textContent = view.admin ? 'TPW overview' : 'Organization';
    $('#view-description').hidden = true;
    $('#dashboard-status').hidden = false;
    $('#dashboard-status').classList.add('sr-loading');
    $('#dashboard-status').textContent = 'Loading programs…';
    renderLoading(Boolean(view.admin)); $('#profile-view').setAttribute('aria-busy', 'true');
    if (focus) $('#profile-heading').focus();
    try {
      const data = await (view.admin ? demoApi('overview') : loadDashboard(key));
      if (token !== revision) return;
      $('#profile-heading').textContent = view.admin ? 'Collective overview' : data.org?.name || view.name;
      $('#dashboard-status').hidden = true;
      renderPrograms(data, view.admin);
    } catch (error) {
      if (token !== revision) return;
      console.error('Dashboard load failed:', error);
      $('#view-sections').replaceChildren();
      $('#dashboard-status').classList.remove('sr-loading');
      $('#dashboard-status').textContent = 'Programs could not be loaded. Check your connection and try again.';
      const retry = element('button', 'action switch', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => renderView()); $('#view-sections').append(retry);
    } finally { if (token === revision) $('#profile-view').removeAttribute('aria-busy'); }
  }
  const onHashChange = () => renderView(true);
  window.addEventListener('hashchange', onHashChange);
  renderView();
  return () => {
    revision++;
    window.removeEventListener('hashchange', onHashChange);
    root.replaceChildren();
  };
}

if (!document.body.hasAttribute("data-next-workspace")) mountDashboardView();
