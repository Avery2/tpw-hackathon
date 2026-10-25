import { participantHistory } from './data.js?v=sheet-20261025b';
const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
export function participantsChart(submissions) {
  // Keep the latest snapshot per quarter so reporting frequency does not crowd the chart.
  const quarters = new Map();
  for (const point of participantHistory(submissions)) {
    const date = new Date(point.day + 'T00:00:00Z');
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    quarters.set(`${date.getUTCFullYear()}-${quarter}`, { ...point, quarterLabel: `Q${quarter} ${date.getUTCFullYear()}` });
  }
  const points = [...quarters.values()];
  const section = document.createElement('section'); section.className = 'participants-chart';
  const header = document.createElement('div'); header.className = 'chart-heading';
  const heading = document.createElement('h3');
  const pills = document.createElement('div'); pills.className = 'chart-pills'; pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Chart metric');
  const content = document.createElement('div'); content.setAttribute('aria-live', 'polite');
  let mode = 'participants';
  const buttons = new Map();
  for (const [key, label] of [['participants', 'Participants'], ['completion', 'Completion rate'], ['impact', 'RAC credits']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { mode = key; render(); }); buttons.set(key, button); pills.append(button);
  }
  header.append(heading, pills); section.append(header, content);
  const rateText = value => value === null ? 'N/A' : value.toFixed(1) + '%';
  const formatDate = day => new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  function render() {
    const rate = mode === 'completion';
    const impact = mode === 'impact';
    heading.textContent = 'Program trends';
    const metricTitle = rate ? 'Completion rate over time' : 'Participants over time';
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === mode));
    content.replaceChildren();
    const latest = document.createElement('strong'); latest.className = 'chart-current';
    latest.textContent = points.length ? impact ? `${points.at(-1).racDays.toLocaleString()} credit days, at most` : rate ? rateText(points.at(-1).completionRate) : points.at(-1).participants.toLocaleString() : 'No history yet';
    const caption = document.createElement('p'); caption.className = 'chart-caption';
    caption.textContent = 'Latest reported program data for each quarter. Select a metric to explore its trend.';
    content.append(latest, caption);
    if (!points.length) { const note = document.createElement('p'); note.textContent = 'Submit program data to start tracking this metric.'; content.append(note); return; }
    if (impact) { renderImpact(content, points, formatDate); return; }
    const width=960, height=300, left=64, right=24, top=24, bottom=48;
    const step = rate ? 25 : Math.max(1, Math.ceil(Math.max(...points.map(p=>p.participants),1)/4));
    const ceiling=step*4;
    const first=Date.parse(points[0].day), last=Date.parse(points.at(-1).day);
    const x=p=>first===last ? (left+width-right)/2 : left+(Date.parse(p.day)-first)/(last-first)*(width-left-right);
    const y=value=>height-bottom-value/ceiling*(height-top-bottom);
    const value=p=>rate ? p.completionRate : p.participants;
    const format=v=>rate ? rateText(v) : v.toLocaleString();
    const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${metricTitle}. Latest: ${format(value(points.at(-1)))}.`});
    for(let i=0;i<=4;i++){
      svg.append(svgNode('line',{x1:left,x2:width-right,y1:y(step*i),y2:y(step*i),stroke:'#e3e9df'}));
      svg.append(svgNode('text',{x:left-12,y:y(step*i)+5,'text-anchor':'end',class:'chart-axis'},rate ? `${step*i}%` : (step*i).toLocaleString()));
    }
    const color=rate ? '#aa741d' : '#5d8d67';
    let segment=[];
    const draw=()=>{
      if(segment.length>1){
        const line=segment.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(value(p))}`).join(' ');
        svg.append(svgNode('path',{d:`${line} L ${x(segment.at(-1))} ${y(0)} L ${x(segment[0])} ${y(0)} Z`,fill:rate?'#faf2e3':'#edf5e9',class:'chart-area-enter'}));
        svg.append(svgNode('path',{d:line,fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round',class:'chart-line-enter'}));
      }
      segment=[];
    };
    for(const p of points){if(value(p)===null)draw();else segment.push(p);}draw();
    points.forEach((p,i)=>{
      if(value(p)!==null){
        const dot=svgNode('circle',{cx:x(p),cy:y(value(p)),r:6,class:'chart-dot-enter',style:`animation-delay: ${120 + i * Math.min(35, 450 / points.length)}ms`,fill:color,stroke:'#fff','stroke-width':2,tabindex:0,'aria-label':`${formatDate(p.day)}: ${format(value(p))}`});
        dot.append(svgNode('title',{},`${formatDate(p.day)} · ${format(value(p))}${rate ? ` (${p.completed} completed / ${p.participants} enrollments)` : ' participants'}`));svg.append(dot);
      }
    });
    appendDateLabels(svg, points, x, height);
    content.append(svg);
    const details=document.createElement('details');details.className='chart-data';
    const summary=document.createElement('summary');summary.textContent='View chart data';details.append(summary);
    const table=document.createElement('table');const head=document.createElement('thead');const row=document.createElement('tr');
    for(const label of ['Submission date','Participants','Completed','Completion rate']){const th=document.createElement('th');th.scope='col';th.textContent=label;row.append(th);}head.append(row);table.append(head);
    const body=document.createElement('tbody');
    for(const p of points){const tr=document.createElement('tr');for(const text of [formatDate(p.day),p.participants.toLocaleString(),p.completed.toLocaleString(),rateText(p.completionRate)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}
    table.append(body);details.append(table);content.append(details);
  }
  render();return section;
}

function renderImpact(content, points, formatDate) {
  const width=960, height=300, left=70, right=24, top=44, bottom=48;
  const max=Math.max(1,...points.map(p=>p.racDays));
  const step=Math.max(1,Math.ceil(max/4)); const ceiling=step*4;
  const first=Date.parse(points[0].day), last=Date.parse(points.at(-1).day);
  const x=p=>first===last ? (left+width-right)/2 : left+(Date.parse(p.day)-first)/(last-first)*(width-left-right);
  const y=days=>height-bottom-days/ceiling*(height-top-bottom);
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`Credit days participants could have earned over time, upper limit. Latest: ${points.at(-1).racDays} days.`});
  svg.append(svgNode('text',{x:left,y:18,fill:'#5d8d67',class:'chart-axis'},'Credit days participants could have earned (upper limit)'));
  for(let i=0;i<=4;i++){
    const days=step*i;
    svg.append(svgNode('line',{x1:left,x2:width-right,y1:y(days),y2:y(days),stroke:'#e3e9df'}));
    svg.append(svgNode('text',{x:left-12,y:y(days)+5,'text-anchor':'end',class:'chart-axis'},days.toLocaleString()));
  }
  if(points.length>1){
    const line=points.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(p.racDays)}`).join(' ');
    svg.append(svgNode('path',{d:`${line} L ${x(points.at(-1))} ${y(0)} L ${x(points[0])} ${y(0)} Z`,fill:'#edf5e9',class:'chart-area-enter'}));
    svg.append(svgNode('path',{d:line,fill:'none',stroke:'#5d8d67','stroke-width':6,class:'chart-line-enter'}));
  }
  points.forEach((p,i)=>{
    const attrs={cx:x(p),cy:y(p.racDays),class:'chart-dot-enter',style:`animation-delay:${120+i*25}ms`};
    svg.append(svgNode('circle',{...attrs,r:6,fill:'#5d8d67',stroke:'#fff','stroke-width':2}));
    const dot=svgNode('circle',{...attrs,r:6,fill:'#5d8d67',tabindex:0,'aria-label':`${formatDate(p.day)}: ${p.racDays} credit days, at most`});
    dot.append(svgNode('title',{},`${formatDate(p.day)} · ${p.racDays.toLocaleString()} credit days, at most`));svg.append(dot);
  });
  appendDateLabels(svg, points, x, height);
  content.append(svg);
  const details=document.createElement('details');details.className='chart-data';
  const summary=document.createElement('summary');summary.textContent='View chart data';details.append(summary);
  const table=document.createElement('table');const head=document.createElement('thead');const row=document.createElement('tr');
  for(const text of ['Submission date','Credit days, at most']){const th=document.createElement('th');th.scope='col';th.textContent=text;row.append(th);}head.append(row);table.append(head);
  const body=document.createElement('tbody');
  for(const p of points){const tr=document.createElement('tr');for(const text of [formatDate(p.day),p.racDays.toLocaleString()]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);details.append(table);content.append(details);
}

function appendDateLabels(svg, points, x, height) {
  if (!points.length) return;
  const labels = [points[0]];
  const end = points.at(-1);
  for (const point of points.slice(1, -1)) {
    if (x(point) - x(labels.at(-1)) >= 170 && x(end) - x(point) >= 170) labels.push(point);
  }
  if (points.length > 1) labels.push(end);
  for (const point of labels) svg.append(svgNode('text', {
    x: x(point), y: height - 16,
    'text-anchor': points.length === 1 ? 'middle' : point === points[0] ? 'start' : point === end ? 'end' : 'middle',
    class: 'chart-axis'
  }, point.quarterLabel));
}
