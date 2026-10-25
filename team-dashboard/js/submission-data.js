import { renderSubmissionTracker } from './submission-tracker.js?v=tip-20261025';
import { updateWorkspace } from './layout.js?v=tip-20261025';
import { loadDashboard, existingPrograms } from './data.js?v=tip-20261025';
import { loadingSkeleton } from './loading.js?v=tip-20261025';
const $ = selector => document.querySelector(selector);
let records = [], mode = 'cards', revision = 0, loaded = false;
const n = value => Math.max(0, Number(value) || 0);
const fmt = value => n(value).toLocaleString(undefined,{maximumFractionDigits:2});
function node(tag,text,className) { const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(className)el.className=className; return el; }
function period(record) {
  if(record.reportingPeriod?.quarter && record.reportingPeriod?.year) return {...record.reportingPeriod,inferred:false};
  const date = new Date(record.submittedAt);
  return Number.isNaN(date.getTime()) ? {quarter:null,year:null,inferred:true} : {quarter:Math.floor(date.getUTCMonth()/3)+1,year:date.getUTCFullYear(),inferred:true};
}
function quarterlyRecords(submissions) {
  const groups = new Map();
  for (const record of submissions) {
    const p = period(record);
    const owner = record.orgId || record.organization || 'unknown';
    const key = JSON.stringify([owner, p.year, p.quarter]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.values()].map(group => {
    group.sort((a,b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    const latest = group[0], programs = existingPrograms(group), locations = new Map();
    for (const program of programs) for (const assignment of program.assignments || []) {
      const previous = locations.get(assignment.code);
      const name = program.prisons.find(item => item.code === assignment.code)?.name || assignment.code;
      locations.set(assignment.code, {code: assignment.code, name, yards: [...new Set([...(previous?.yards || []), ...assignment.yards])]});
    }
    return {...latest, programs, prisons: [...locations.values()], reportingPeriod: period(latest)};
  }).sort((a,b) => b.reportingPeriod.year-a.reportingPeriod.year || b.reportingPeriod.quarter-a.reportingPeriod.quarter);
}
function metrics(record) {
  const programs=record.programs||[];
  return {programs:programs.length,participants:programs.reduce((s,p)=>s+n(p.participants),0),completed:programs.reduce((s,p)=>s+n(p.participantsCompleted),0),hours:programs.reduce((s,p)=>s+n(p.courseHours)*n(p.participantsCompleted),0)};
}
function dateText(value) { const date=new Date(value);return Number.isNaN(date.getTime())?'Date not recorded':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function render() {
  if(!loaded)return;
  const from=$('#date-from').value,to=$('#date-to').value,quarter=$('#filter-quarter').value,year=$('#filter-year').value;
  const container=$('#submission-results');container.replaceChildren();
  if(from&&to&&from>to){$('#submission-status').textContent='The end date must be on or after the start date.';$('#submission-summary').replaceChildren();return;}
  const filtered=records.filter(record=>{
    const day=String(record.submittedAt||'').slice(0,10), p=period(record);
    return (!from||day>=from)&&(!to||day<=to)&&(!quarter||String(p.quarter)===quarter)&&(!year||String(p.year)===year);
  });
  $('#submission-status').textContent=`${filtered.length} of ${records.length} submissions`;
  const current=existingPrograms(filtered);
  const totals=$('#submission-summary');totals.replaceChildren();
  for(const [label,value] of [['Submissions',filtered.length],['Programs',current.length],['Participants',current.reduce((s,p)=>s+n(p.participants),0)],['Hours completed',current.reduce((s,p)=>s+n(p.courseHours)*n(p.participantsCompleted),0)]]) {
    const card=node('div');card.append(node('strong',fmt(value)),node('span',label));totals.append(card);
  }
  const note=node('p','Program totals use the latest version of each program within your filters, so repeat submissions aren’t counted twice. One entry per organization per quarter. Updates within a quarter are combined using each program’s latest details.','data-totals-note');container.append(note);
  if(!filtered.length){container.append(node('p','No submissions match these filters.','table-empty'));return;}
  if(mode==='table') { renderTable(container,filtered);return; }
  const grid=node('div',undefined,'submission-data-grid');
  for(const record of filtered) {
    const p=period(record), m=metrics(record),card=node('article',undefined,'submission-data-card');
    const header=node('header');const title=node('div');title.append(node('h3',p.quarter ? `Q${p.quarter} ${p.year}` : 'Submission'),node('span',`Last updated ${dateText(record.submittedAt)}`,'submission-date'));
    if(location.hash === '#tpw') title.append(node('div',record.organization || 'Organization'));
    header.append(title);card.append(header);
    const stats=node('div',undefined,'submission-card-metrics');
    for(const [label,value] of [['Participants',m.participants],['Completed',m.completed],['Hours completed',m.hours]]){const part=node('div');part.append(node('strong',fmt(value)),node('span',label));stats.append(part);}card.append(stats);
    const details=node('details');details.append(node('summary',`${m.programs} ${m.programs === 1 ? 'program' : 'programs'} · ${(record.prisons||[]).length} ${(record.prisons||[]).length === 1 ? 'facility' : 'facilities'}`));const list=node('ul');
    for(const program of record.programs||[]){const li=node('li');li.append(node('strong',program.name));const locations=(program.assignments||[]).map(assignment=>`${record.prisons?.find(p=>p.code===assignment.code)?.name||assignment.code}: ${(assignment.yards||[]).join(', ')}`).join(' · ');li.append(node('div',locations),node('div',`${program.status||'No status'} · ${fmt(program.participants)} participants · ${fmt(program.participantsCompleted)} completed`));list.append(li);}
    details.append(list);card.append(details);grid.append(card);
  }
  container.append(grid);
}
function renderTable(container, records) {
  const wrap=node('div',undefined,'table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Submission table');
  const table=node('table',undefined,'program-table submission-table');const head=node('thead'),row=node('tr');
  for(const label of ['Submitted','Organization','Reporting quarter','Programs','Facilities','Participants','Completed','Hours completed']){const th=node('th',label);th.scope='col';row.append(th);}head.append(row);table.append(head);
  const body=node('tbody');for(const record of records){const p=period(record),m=metrics(record),tr=node('tr');
    for(const value of [dateText(record.submittedAt),record.organization||'—',p.quarter?`Q${p.quarter} ${p.year}${p.inferred?' (by date)':''}`:'—',fmt(m.programs),fmt(record.prisons?.length||0),fmt(m.participants),fmt(m.completed),fmt(m.hours)])tr.append(node('td',value));body.append(tr);}
  table.append(body);wrap.append(table);container.append(wrap);
}
async function load() {
  const token=++revision,account=location.hash.slice(1);
  if(!['org-1','org-2','tpw'].includes(account)){location.replace('./');return;}
  const tracker = $('#submission-tracker'); tracker.hidden = account !== 'tpw'; tracker.replaceChildren();
  updateWorkspace(account,'submissions');$('#submission-back').href=`./submissions.html#${account}`;
  loaded=false;$('#submission-summary').replaceChildren();$('#submission-status').textContent='Loading submissions…';
  $('#submission-results').setAttribute('aria-busy','true');$('#submission-results').replaceChildren(loadingSkeleton(mode==='table'?'table':'cards'));
  try {
    const data=await loadDashboard(account==='tpw'?null:account);if(token!==revision)return;
    if (account === 'tpw') renderSubmissionTracker(tracker, data);
    records=quarterlyRecords(data.submissions);
    $('#filter-year').replaceChildren(new Option('All years',''));
    for(const year of [...new Set(records.map(r=>period(r).year).filter(Boolean))].sort((a,b)=>b-a))$('#filter-year').add(new Option(String(year),String(year)));
    loaded=true;render();
  }catch(error){if(token!==revision)return;console.error('Submission load failed:',error);$('#submission-status').textContent='Could not load submissions.';const retry=node('button','Try again','action');retry.type='button';retry.onclick=load;$('#submission-results').replaceChildren(retry);}
  finally{if(token===revision)$('#submission-results').removeAttribute('aria-busy');}
}
for(const id of ['date-from','date-to','filter-quarter','filter-year'])$('#'+id).addEventListener('change',render);
$('#clear-filters').onclick=()=>{for(const id of ['date-from','date-to','filter-quarter','filter-year'])$('#'+id).value='';render();};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{mode=button.dataset.view;for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===button));if(loaded)render();else $('#submission-results').replaceChildren(loadingSkeleton(mode==='table'?'table':'cards'));};
window.addEventListener('hashchange',load);load();
