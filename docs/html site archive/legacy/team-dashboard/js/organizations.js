import { demoApi } from '../../assets/neon-api.js';
import { appendPagination } from './pagination.js';
import { updateWorkspace } from './workspace-adapter.js?v=history-download-1';
import { loadDashboard, existingPrograms } from './data.js?v=valid-orgs-1';
import { participantsChart } from './chart.js?v=quarter-spacing-1';
import { programCards } from './cards.js';
import { racPanel } from './rac.js?v=collective-1';
import { loadingSkeleton } from './loading.js';

export function mountDashboardView(root = document) {
  const $ = selector => root.querySelector(selector);
  let revision = 0, viewMode = 'cards', page = 1, searchTimer;
  const n = value => Math.max(0, Number(value) || 0);
  const fmt = value => n(value).toLocaleString();
  function node(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function stats(programs) {return {programs:programs.length, facilities:new Set(programs.flatMap(p=>(p.assignments||[]).map(a=>a.code))).size,participants:programs.reduce((s,p)=>s+n(p.participants),0),hours:programs.reduce((s,p)=>s+n(p.courseHours)*n(p.participantsCompleted),0)};}
  function renderDirectory(result) {
   const { items, offset, count } = result;
   const container = $('#org-results');
   container.replaceChildren();
   $('#org-status').textContent = items.length
     ? `Showing ${offset + 1}–${offset + items.length} of ${count} organizations`
     : '0 organizations';
   if (viewMode === 'table') renderOrgTable(container, items);
   else {
     const grid = node('div', undefined, 'org-directory');
     for (const { org, totals, latest } of items) {
       const card = node('a', undefined, 'org-card');
       card.href = `./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;
       card.append(node('h3', org.name));
       const metrics = node('div', undefined, 'org-metrics');
       for (const [label,value] of [['Programs',totals.programs],['Facilities',totals.facilities],['Participants',totals.participants]]) {
         const part = node('div'); part.append(node('strong',fmt(value)),node('span',label)); metrics.append(part);
       }
       card.append(metrics, node('p',latest ? `Latest submission · ${new Date(latest).toLocaleDateString()}` : 'No submissions yet','org-updated'),
         node('span','View organization →','org-open'));
       grid.append(card);
     }
     container.append(items.length ? grid : node('p','No organizations match your search.','table-empty'));
   }
   appendPagination(container, result, next => {
     page = next;
     load();
     $('#org-page-heading').scrollIntoView({ block: 'start' });
   });
  }
  function renderOrgTable(container, items) {
   if (!items.length) { container.append(node('p','No organizations match your search.','table-empty')); return; }
   const wrap=node('div',undefined,'table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Organization directory table');
   const table=node('table',undefined,'program-table');table.style.minWidth='800px';
   const head=node('thead'),header=node('tr');
   for(const label of ['Organization','Programs','Facilities','Participants','Hours completed','Latest submission']){const th=node('th',label);th.scope='col';header.append(th);}head.append(header);table.append(head);
   const body=node('tbody');
   for(const {org,totals,latest} of items){
    const row=node('tr'),name=node('td'),link=node('a',org.name);
    link.href=`./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;name.append(link);row.append(name);
    for(const value of [fmt(totals.programs),fmt(totals.facilities),fmt(totals.participants),fmt(totals.hours),latest?new Date(latest).toLocaleDateString():'No submissions yet'])row.append(node('td',value));body.append(row);
   }
   table.append(body);wrap.append(table);container.append(wrap);
  }
  async function load() {
   const token=++revision;
   if(location.hash!=='#tpw'){location.replace('/team-dashboard/');return;}
   updateWorkspace('tpw','organizations');
   const id=new URLSearchParams(location.search).get('org');
   $('#org-view-toggle').hidden=Boolean(id);
   $('#org-search-label').hidden=Boolean(id);$('#org-back').hidden=!id;
   const container=$('#org-results');container.setAttribute('aria-busy','true');container.replaceChildren(loadingSkeleton(!id && viewMode === 'table' ? 'table' : 'cards'));
   try {
    if(!id){
     $('#org-status').textContent = 'Loading organizations…';
     const query = new URLSearchParams({ page, view: viewMode, search: $('#org-search').value });
     const result = await demoApi(`organizations?${query}`);
     if (token !== revision) return;
     page = result.page;
     renderDirectory(result);
     return;
    }
    const data = await loadDashboard(id);
    if (token !== revision) return;
    const programs=existingPrograms(data.submissions),totals=stats(programs);
    $('#org-page-heading').textContent=data.org.name;$('#org-status').textContent='Organization overview';container.replaceChildren();
    const metrics=node('div',undefined,'org-detail-stats');
    for(const [label,value] of [['Programs',totals.programs],['Facilities',totals.facilities],['Participants',totals.participants],['Hours completed',totals.hours]]){const part=node('div');part.append(node('strong',fmt(value)),node('span',label));metrics.append(part);}
    container.append(metrics,participantsChart(data.submissions),racPanel(programs),node('h3','Programs'));
    container.append(programs.length?programCards(programs):node('p','No programs submitted yet.','table-empty'));
   }catch(error){if(token!==revision)return;console.error('Organization load failed:',error);$('#org-status').textContent='Could not load organization data.';const retry=node('button','Try again','action');retry.type='button';retry.onclick=load;container.replaceChildren(retry);}
   finally{if(token===revision)container.removeAttribute('aria-busy');}
  }
  for(const button of root.querySelectorAll('[data-org-view]'))button.addEventListener('click',()=>{
   viewMode=button.dataset.orgView;
   for(const control of root.querySelectorAll('[data-org-view]'))control.setAttribute('aria-pressed',String(control===button));
   page = 1;
   load();
  });
  $('#org-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; load(); }, 250);
  });
  const onHashChange = () => { page = 1; load(); };
  window.addEventListener('hashchange', onHashChange);
  load();
  return () => {
    revision++;
    window.removeEventListener('hashchange', onHashChange);
    clearTimeout(searchTimer);
    root.replaceChildren();
  };
}

if (!document.body.hasAttribute("data-next-workspace")) mountDashboardView();
