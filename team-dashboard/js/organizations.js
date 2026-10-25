import { updateWorkspace } from './layout.js?v=tip-20261025';
import { loadDashboard, existingPrograms } from './data.js?v=tip-20261025';
import { participantsChart } from './chart.js?v=tip-20261025';
import { programCards } from './cards.js?v=tip-20261025';
import { racPanel } from './rac.js?v=facility-20261025';
import { loadingSkeleton } from './loading.js?v=tip-20261025';
const $ = selector => document.querySelector(selector);
let directory = [], revision = 0, viewMode = 'cards', cardPage = 1;
const n = value => Math.max(0, Number(value) || 0);
const fmt = value => n(value).toLocaleString();
function node(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function stats(programs) {return {programs:programs.length, facilities:new Set(programs.flatMap(p=>(p.assignments||[]).map(a=>a.code))).size,participants:programs.reduce((s,p)=>s+n(p.participants),0),hours:programs.reduce((s,p)=>s+n(p.courseHours)*n(p.participantsCompleted),0)};}
function renderDirectory() {
 const filter=$('#org-search').value.toLowerCase().trim();const items=directory.filter(item=>String(item.org.name || '').toLowerCase().includes(filter));
 $('#org-status').textContent=`${items.length} organizations`;
 const container=$('#org-results');container.replaceChildren();
 if (viewMode === 'table') { renderOrgTable(container, items); return; }
 const grid=node('div',undefined,'org-directory');
 const pageSize = 12, pages = Math.max(1, Math.ceil(items.length / pageSize));
 cardPage = Math.min(cardPage, pages);
 const start = (cardPage - 1) * pageSize;
 const visible = items.slice(start, start + pageSize);
 for(const {org,submissions,programs} of visible){
  const card=node('a',undefined,'org-card');card.href=`./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;
  card.append(node('h3',org.name));const totals=stats(programs),metrics=node('div',undefined,'org-metrics');
  for(const [label,value] of [['Programs',totals.programs],['Facilities',totals.facilities],['Participants',totals.participants]]){const part=node('div');part.append(node('strong',fmt(value)),node('span',label));metrics.append(part);}card.append(metrics);
  const latest=submissions.map(s=>s.submittedAt).filter(Boolean).sort().at(-1);
  card.append(node('p',latest?`Latest submission · ${new Date(latest).toLocaleDateString()}`:'No submissions yet','org-updated'),node('span','View organization →','org-open'));grid.append(card);
 }
 container.append(items.length?grid:node('p','No organizations match your search.','table-empty'));
 if (items.length) {
  $('#org-status').textContent = `Showing ${start + 1}–${start + visible.length} of ${items.length} organizations`;
  const pagination = node('nav',undefined,'tracker-pagination'); pagination.setAttribute('aria-label','Organization card pages');
  const previous = node('button','← Previous'), next = node('button','Next →'); previous.type = next.type = 'button';
  previous.disabled = cardPage === 1; next.disabled = cardPage === pages;
  previous.onclick = () => { cardPage--; renderDirectory(); $('#org-page-heading').scrollIntoView({block:'start'}); };
  next.onclick = () => { cardPage++; renderDirectory(); $('#org-page-heading').scrollIntoView({block:'start'}); };
  pagination.append(previous,node('span',`Page ${cardPage} of ${pages}`),next); container.append(pagination);
 }

}
function renderOrgTable(container, items) {
 if (!items.length) { container.append(node('p','No organizations match your search.','table-empty')); return; }
 const wrap=node('div',undefined,'table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Organization directory table');
 const table=node('table',undefined,'program-table');table.style.minWidth='800px';
 const head=node('thead'),header=node('tr');
 for(const label of ['Organization','Programs','Facilities','Participants','Hours completed','Latest submission']){const th=node('th',label);th.scope='col';header.append(th);}head.append(header);table.append(head);
 const body=node('tbody');
 for(const {org,submissions,programs} of items){
  const totals=stats(programs),row=node('tr'),name=node('td'),link=node('a',org.name);
  link.href=`./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;name.append(link);row.append(name);
  const latest=submissions.map(s=>s.submittedAt).filter(Boolean).sort().at(-1);
  for(const value of [fmt(totals.programs),fmt(totals.facilities),fmt(totals.participants),fmt(totals.hours),latest?new Date(latest).toLocaleDateString():'No submissions yet'])row.append(node('td',value));body.append(row);
 }
 table.append(body);wrap.append(table);container.append(wrap);
}
async function load() {
 const token=++revision;
 if(location.hash!=='#tpw'){location.replace('./');return;}
 updateWorkspace('tpw','organizations');
 const id=new URLSearchParams(location.search).get('org');
 $('#org-view-toggle').hidden=Boolean(id);
 $('#org-search-label').hidden=Boolean(id);$('#org-back').hidden=!id;
 const container=$('#org-results');container.setAttribute('aria-busy','true');container.replaceChildren(loadingSkeleton('cards'));
 try {
  const data=await loadDashboard(id||null);if(token!==revision)return;
  if(!id){
   directory=data.orgs.map(org=>{const submissions=data.submissions.filter(s=>s.orgId===org.id);return {org,submissions,programs:existingPrograms(submissions)};});
   renderDirectory();return;
  }
  const programs=existingPrograms(data.submissions),totals=stats(programs);
  $('#org-page-heading').textContent=data.org.name;$('#org-status').textContent='Organization overview';container.replaceChildren();
  const metrics=node('div',undefined,'org-detail-stats');
  for(const [label,value] of [['Programs',totals.programs],['Facilities',totals.facilities],['Participants',totals.participants],['Hours completed',totals.hours]]){const part=node('div');part.append(node('strong',fmt(value)),node('span',label));metrics.append(part);}
  container.append(metrics,participantsChart(data.submissions),racPanel(programs),node('h3','Programs'));
  container.append(programs.length?programCards(programs):node('p','No programs submitted yet.','table-empty'));
 }catch(error){if(token!==revision)return;console.error('Organization load failed:',error);$('#org-status').textContent='Could not load organization data.';const retry=node('button','Try again','action');retry.type='button';retry.onclick=load;container.replaceChildren(retry);}
 finally{if(token===revision)container.removeAttribute('aria-busy');}
}
for(const button of document.querySelectorAll('[data-org-view]'))button.addEventListener('click',()=>{
 viewMode=button.dataset.orgView;
 for(const control of document.querySelectorAll('[data-org-view]'))control.setAttribute('aria-pressed',String(control===button));
 if($('#org-results').getAttribute('aria-busy')==='true')$('#org-results').replaceChildren(loadingSkeleton(viewMode==='table'?'table':'cards'));else renderDirectory();
});
$('#org-search').addEventListener('input',()=>{cardPage=1;renderDirectory();});window.addEventListener('hashchange',load);load();
