import { renderSubmissionTracker } from './submission-tracker.js?v=paginated-1';
import { updateWorkspace } from './workspace-adapter.js?v=history-download-1';
import { demoApi } from '../../assets/neon-api.js';
import { appendPagination } from './pagination.js';
import { loadingSkeleton } from './loading.js';

export function mountDashboardView(root = document) {
  const $ = selector => root.querySelector(selector);
  let result, page = 1, mode = 'cards', revision = 0, trackerAccount;
  const n = value => Math.max(0, Number(value) || 0);
  const fmt = value => n(value).toLocaleString(undefined,{maximumFractionDigits:2});
  function node(tag,text,className) { const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(className)el.className=className; return el; }
  function period(record) {
    if(record.reportingPeriod?.quarter && record.reportingPeriod?.year) return {...record.reportingPeriod,inferred:record.reportingPeriod.inferred ?? false};
    const date = new Date(record.submittedAt);
    return Number.isNaN(date.getTime()) ? {quarter:null,year:null,inferred:true} : {quarter:Math.floor(date.getUTCMonth()/3)+1,year:date.getUTCFullYear(),inferred:true};
  }
  function dateText(value) { const date=new Date(value);return Number.isNaN(date.getTime())?'Date not recorded':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
  function render() {
    if (!result) return;
    const { items, count, total, totals } = result;
    const container = $('#submission-results'); container.replaceChildren();
    $('#submission-status').textContent = `${count} of ${total} submissions`;
    const summary = $('#submission-summary'); summary.replaceChildren();
    for (const [label, value] of [['Submissions', count], ['Programs', totals.programs], ['Participants', totals.participants], ['Hours completed', totals.hours]]) {
      const card = node('div'); card.append(node('strong', fmt(value)), node('span', label)); summary.append(card);
    }
    container.append(node('p', 'Program totals use the latest version of each program within your filters. One entry per organization per quarter.', 'data-totals-note'));
    if (!items.length) { container.append(node('p', 'No submissions match these filters.', 'table-empty')); return; }
    const paginate = () => appendPagination(container, result, next => { page = next; load(); });
    if (mode === 'table') { renderTable(container, items); paginate(); return; }
    const grid=node('div',undefined,'submission-data-grid');
    for (const record of items) {
      const p=period(record), m=record.metrics, card=node('article',undefined,'submission-data-card');
      const header=node('header');const title=node('div');title.append(node('h3',p.quarter ? `Q${p.quarter} ${p.year}` : 'Submission'),node('span',`Last updated ${dateText(record.submittedAt)}`,'submission-date'));
      if(location.hash === '#tpw') title.append(node('div',record.organization || 'Organization'));
      header.append(title);card.append(header);
      const stats=node('div',undefined,'submission-card-metrics');
      for(const [label,value] of [['Participants',m.participants],['Completed',m.completed],['Hours completed',m.hours]]){const part=node('div');part.append(node('strong',fmt(value)),node('span',label));stats.append(part);}card.append(stats);
      const details = node('details');
      details.append(node('summary', `${m.programs} ${m.programs === 1 ? 'program' : 'programs'} · ${record.facilities} ${record.facilities === 1 ? 'facility' : 'facilities'}`));
      const content = node('div');
      details.append(content);
      let loading = false, loaded = false;
      details.addEventListener('toggle', async () => {
        if (!details.open || loading || loaded) return;
        loading = true;
        content.textContent = 'Loading programs…';
        try {
          const query = new URLSearchParams({ detail: record.key });
          if (location.hash !== '#tpw') query.set('org', location.hash.slice(1));
          const { programs } = await demoApi(`submissions?${query}`);
          const list = node('ul');
          for (const program of programs) {
            const row = node('li');
            const locations = program.assignments.map(assignment =>
              `${program.prisons.find(facility => facility.code === assignment.code)?.name || assignment.code}: ${assignment.yards.join(', ')}`).join(' · ');
            row.append(node('strong', program.name), node('div', locations),
              node('div', `${program.status || 'No status'} · ${fmt(program.participants)} participants · ${fmt(program.participantsCompleted)} completed`));
            list.append(row);
          }
          content.replaceChildren(list);
          loaded = true;
        } catch {
          content.textContent = 'Could not load programs. Close and reopen to try again.';
        } finally { loading = false; }
      });
      card.append(details); grid.append(card);
    }
    container.append(grid); paginate();
  }
  function renderTable(container, records) {
    const wrap=node('div',undefined,'table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Submission table');
    const table=node('table',undefined,'program-table submission-table');const head=node('thead'),row=node('tr');
    for(const label of ['Submitted','Organization','Reporting quarter','Programs','Facilities','Participants','Completed','Hours completed']){const th=node('th',label);th.scope='col';row.append(th);}head.append(row);table.append(head);
    const body=node('tbody');for(const record of records){const p=period(record),m=record.metrics,tr=node('tr');
      for(const value of [dateText(record.submittedAt),record.organization||'—',p.quarter?`Q${p.quarter} ${p.year}${p.inferred?' (by date)':''}`:'—',fmt(m.programs),fmt(record.facilities),fmt(m.participants),fmt(m.completed),fmt(m.hours)])tr.append(node('td',value));body.append(tr);}
    table.append(body);wrap.append(table);container.append(wrap);
  }
  async function load() {
    const token=++revision,account=location.hash.slice(1);
    if(!['org-1','org-2','tpw'].includes(account)){location.replace('/team-dashboard/');return;}
    const tracker = $('#submission-tracker');
    tracker.hidden = account !== 'tpw';
    if (trackerAccount !== account) {
      trackerAccount = account;
      tracker.replaceChildren();
      if (account === 'tpw') demoApi('submission-tracking').then(data => {
        if (trackerAccount === account) renderSubmissionTracker(tracker, data);
      }).catch(() => {
        if (trackerAccount === account) {
          tracker.textContent = 'Could not load submission tracking. ';
          const retry = node('button', 'Try again');
          retry.type = 'button';
          retry.onclick = () => { trackerAccount = undefined; load(); };
          tracker.append(retry);
        }
      });
    }
    updateWorkspace(account,'submissions');
    $('#submission-back').href=`./submissions.html#${account}`;
    const from = $('#date-from').value, to = $('#date-to').value;
    const year = $('#filter-year').value, quarter = $('#filter-quarter').value;
    const container = $('#submission-results');
    result = undefined;
    $('#submission-summary').replaceChildren();
    if (from && to && from > to) {
      container.removeAttribute('aria-busy');
      container.replaceChildren();
      $('#submission-status').textContent = 'The end date must be on or after the start date.';
      return;
    }
    $('#submission-status').textContent = 'Loading submissions…';
    container.setAttribute('aria-busy','true');
    container.replaceChildren(loadingSkeleton(mode === 'table' ? 'table' : 'cards'));
    try {
      const query = new URLSearchParams({ page, from, to, year, quarter });
      if (account !== 'tpw') query.set('org', account);
      const data = await demoApi(`submissions?${query}`);
      if (token !== revision) return;
      const select = $('#filter-year');
      select.replaceChildren(new Option('All years', ''), ...data.years.map(value => new Option(value, value)));
      select.value = data.years.includes(Number(year)) ? year : '';
      result = data;
      page = data.page;
      render();
    } catch (error) {
      if (token !== revision) return;
      console.error('Submission load failed:', error);
      $('#submission-status').textContent = 'Could not load submissions.';
      const retry = node('button', 'Try again', 'action');
      retry.type = 'button'; retry.onclick = load; container.replaceChildren(retry);
    } finally {
      if (token === revision) container.removeAttribute('aria-busy');
    }
  }
  const filters = ['date-from', 'date-to', 'filter-quarter', 'filter-year'];
  const resetPage = () => { page = 1; load(); };
  for (const id of filters) $('#' + id).addEventListener('change', resetPage);
  $('#clear-filters').onclick = () => { for (const id of filters) $('#' + id).value = ''; resetPage(); };
  for (const button of root.querySelectorAll('[data-view]')) button.onclick = () => {
    mode = button.dataset.view;
    for (const control of root.querySelectorAll('[data-view]')) control.setAttribute('aria-pressed', String(control === button));
    if (result) render();
  };
  const onHashChange = () => { $('#filter-year').value = ''; resetPage(); };
  window.addEventListener('hashchange', onHashChange);
  load();
  return () => {
    revision++;
    window.removeEventListener('hashchange', onHashChange);
    root.replaceChildren();
  };
}

if (!document.body.hasAttribute("data-next-workspace")) mountDashboardView();
