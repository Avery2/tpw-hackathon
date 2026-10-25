export function recentQuarterStatus(orgs, submissions, now = new Date()) {
  orgs = orgs.filter(org => typeof org.name === 'string' && org.name.trim());
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles',year:'numeric',month:'numeric'}).formatToParts(now);
  const year=Number(parts.find(p=>p.type==='year').value), month=Number(parts.find(p=>p.type==='month').value);
  const current=year*4+Math.floor((month-1)/3);
  return [current-1,current-2].map(index=>{
    const period={year:Math.floor(index/4),quarter:index%4+1};
    const statuses=orgs.map(org=>{
      const submitted=submissions.some(record=>{
        if(record.orgId ? record.orgId!==org.id : record.organization!==org.name)return false;
        let reporting=record.reportingPeriod;
        if(!reporting){const date=new Date(record.submittedAt);if(Number.isNaN(date.getTime()))return false;reporting={year:date.getUTCFullYear(),quarter:Math.floor(date.getUTCMonth()/3)+1};}
        return Number(reporting.year)===period.year&&Number(reporting.quarter)===period.quarter;
      });
      return {org,submitted};
    });
    return {...period,statuses,submitted:statuses.filter(s=>s.submitted).length,missing:statuses.filter(s=>!s.submitted).length};
  });
}
export function renderSubmissionTracker(container,data) {
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 container.replaceChildren();
 const orgs=data.orgs.filter(org => typeof org.name === 'string' && org.name.trim());
 const periods=recentQuarterStatus(orgs,data.submissions);
 container.append(node('h2','Quarterly submission tracking'),node('p','The two most recently completed quarters. Counts include registered organizations; older records without a reporting quarter use their submission date.','tracker-description'));
 const grid=node('div',undefined,'tracker-quarter-grid');
 for(const p of periods){
  const card=node('article',undefined,'tracker-quarter');card.append(node('h3',`Q${p.quarter} ${p.year}`));
  const counts=node('div',undefined,'tracker-counts');
  for(const [label,value] of [['Submitted',p.submitted],['Not submitted',p.missing]]){const part=node('div',undefined,label==='Not submitted'?'tracker-missing-count':'tracker-submitted-count');part.append(node('strong',String(value)),node('span',label));counts.append(part);}card.append(counts);
  const missing=p.statuses.filter(s=>!s.submitted);
  const details=node('details');details.open=false;details.append(node('summary',missing.length?'Organizations that haven’t submitted':'All organizations submitted'));
  if(missing.length){const list=node('ul',undefined,'followup-grid');for(const {org} of missing){const item=node('li'),link=node('a',org.name);link.href=`./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;item.append(link);list.append(item);}details.append(list);}card.append(details);grid.append(card);
 }
 container.append(grid);
 const toolbar=node('div',undefined,'tracker-toolbar');
 const searchLabel=node('label','Search organizations');const search=node('input');search.type='search';search.placeholder='Organization name';searchLabel.append(search);
 const quarterLabel=node('label','Quarter');const quarter=node('select');quarter.add(new Option('Both quarters','all'));periods.forEach((p,i)=>quarter.add(new Option(`Q${p.quarter} ${p.year}`,String(i))));quarterLabel.append(quarter);
 const statusLabel=node('label','Submission status');const status=node('select');for(const [label,value] of [['All statuses','all'],['Missing submission','missing'],['Submitted','submitted']])status.add(new Option(label,value));statusLabel.append(status);
 const sizeLabel=node('label','Rows per page');const size=node('select');for(const value of [10,25,50])size.add(new Option(String(value),String(value)));sizeLabel.append(size);
 const clear=node('button','Clear filters');clear.type='button';toolbar.append(searchLabel,quarterLabel,statusLabel,sizeLabel,clear);container.append(toolbar);
 const results=node('div');results.setAttribute('aria-live','polite');container.append(results);
 let page=1;
 function renderTable(){
  const selected=quarter.value==='all'?periods:[periods[Number(quarter.value)]];
  const filtered=orgs.filter(org=>org.name.toLowerCase().includes(search.value.trim().toLowerCase())).filter(org=>{
   const flags=selected.map(p=>p.statuses.find(s=>s.org.id===org.id).submitted);
   return status.value==='all'||(status.value==='missing'?flags.some(value=>!value):flags.every(Boolean));
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const pageSize=Number(size.value),pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
  const start=(page-1)*pageSize,visible=filtered.slice(start,start+pageSize);results.replaceChildren();
  const info=node('p',filtered.length?`Showing ${start+1}–${start+visible.length} of ${filtered.length} organizations`:'No organizations match these filters.','tracker-result-count');results.append(info);
  if(!filtered.length)return;
  const table=node('table',undefined,'tracker-table'),head=node('thead'),header=node('tr');
  for(const text of ['Organization',...periods.map(p=>`Q${p.quarter} ${p.year}`)]){const th=node('th',text);th.scope='col';header.append(th);}head.append(header);table.append(head);
  const body=node('tbody');
  for(const org of visible){const row=node('tr'),name=node('th');name.scope='row';const link=node('a',org.name);link.href=`./organizations.html?org=${encodeURIComponent(org.id)}#tpw`;name.append(link);row.append(name);
   for(const p of periods){const submitted=p.statuses.find(s=>s.org.id===org.id).submitted;const cell=node('td');cell.append(node('span',submitted?'Submitted':'Needs follow-up',submitted?'tracker-status submitted':'tracker-status missing'));row.append(cell);}body.append(row);
  }
  table.append(body);const wrap=node('div',undefined,'tracker-table-wrap');wrap.append(table);results.append(wrap);
  const pagination=node('nav',undefined,'tracker-pagination');pagination.setAttribute('aria-label','Organization status pages');
  const previous=node('button','← Previous'),next=node('button','Next →');previous.type=next.type='button';previous.disabled=page===1;next.disabled=page===pages;
  previous.onclick=()=>{page--;renderTable();};next.onclick=()=>{page++;renderTable();};
  pagination.append(previous,node('span',`Page ${page} of ${pages}`),next);results.append(pagination);
 }
 search.addEventListener('input',()=>{page=1;renderTable();});
 for(const control of [quarter,status,size])control.addEventListener('change',()=>{page=1;renderTable();});
 clear.onclick=()=>{search.value='';quarter.value='all';status.value='all';page=1;renderTable();};
 renderTable();
 if(!orgs.length)container.append(node('p','No registered organizations yet.'));
}
