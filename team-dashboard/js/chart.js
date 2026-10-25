import { participantHistory } from './data.js?v=tip-20261025';

const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
// The tooltip's look, added once to whichever dashboard page draws a chart.
function tooltipStyle() {
  if (document.querySelector('#chart-tooltip-style')) return;
  const style = document.createElement('style'); style.id = 'chart-tooltip-style';
  style.textContent = `.participants-chart { position: relative; }
.chart-tooltip { position: absolute; transform: translate(-50%, calc(-100% - 12px)); background: #1f2a1f; color: #fff; font-size: 13px; font-weight: 700; padding: 6px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none; z-index: 2; }
.chart-tooltip[hidden] { display: none; }`;
  document.head.append(style);
}
export function participantsChart(submissions) {
  const points = participantHistory(submissions);
  const section = document.createElement('section'); section.className = 'participants-chart';
  const header = document.createElement('div'); header.className = 'chart-heading';
  const heading = document.createElement('h3'); heading.textContent = 'Participants over time';
  const latest = document.createElement('strong'); latest.className = 'chart-latest';
  latest.textContent = points.length ? points.at(-1).participants.toLocaleString() + ' participants' : 'No history yet';
  header.append(heading, latest); section.append(header);
  const caption = document.createElement('p'); caption.className = 'chart-caption';
  caption.textContent = 'Reported participant enrollments by submission date. Updates replace previous counts for the same program; people may appear in more than one program.';
  section.append(caption);
  if (!points.length) { const empty = document.createElement('p'); empty.textContent = 'Submit program data to start tracking participants over time.'; section.append(empty); return section; }
  const width = 960, height = 300, left = 58, right = 24, top = 24, bottom = 48;
  const max = Math.max(...points.map(point => point.participants), 1);
  const step = Math.max(1, Math.ceil(max / 4)); const ceiling = step * 4;
  const start = Date.parse(points[0].day), end = Date.parse(points.at(-1).day);
  const x = point => start === end ? (left + width - right) / 2 : left + (Date.parse(point.day) - start) / (end - start) * (width - left - right);
  const y = value => height - bottom - value / ceiling * (height - top - bottom);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Participant enrollments over ${points.length} reporting ${points.length === 1 ? 'day' : 'days'}. Latest total: ${points.at(-1).participants}.` });
  for (let i = 0; i <= 4; i++) {
    const value = step * i;
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: '#e3e9df', 'stroke-width': 1 }));
    svg.append(svgNode('text', { x: left - 12, y: y(value) + 5, 'text-anchor': 'end', class: 'chart-axis' }, value.toLocaleString()));
  }
  if (points.length > 1) {
    const line = points.map((point, i) => `${i ? 'L' : 'M'} ${x(point)} ${y(point.participants)}`).join(' ');
    svg.append(svgNode('path', { d: `${line} L ${x(points.at(-1))} ${y(0)} L ${x(points[0])} ${y(0)} Z`, fill: '#edf5e9' }));
    svg.append(svgNode('path', { d: line, fill: 'none', stroke: '#5d8d67', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  }
  const formatDate = day => new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  // Hovering, tapping or tabbing to a dot shows its date and total in a small box above it.
  // The dots are small, so a bigger invisible circle round each one also opens it; those go
  // underneath all the dots, so a dot always wins over its neighbour's bigger circle.
  tooltipStyle();
  const tip = document.createElement('div'); tip.className = 'chart-tooltip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  const show = (dot, point) => {
    tip.textContent = `${formatDate(point.day)} · ${point.participants.toLocaleString()} participants`;
    tip.hidden = false;
    const box = section.getBoundingClientRect(), at = dot.getBoundingClientRect(), half = tip.offsetWidth / 2;
    // Keep the box inside the chart near either end.
    tip.style.left = `${Math.min(Math.max(at.left + at.width / 2 - box.left, half), box.width - half)}px`;
    tip.style.top = `${at.top - box.top}px`;
  };
  const hide = () => { tip.hidden = true; };
  const dots = points.map(point => {
    const dot = svgNode('circle', { cx: x(point), cy: y(point.participants), r: 6, fill: '#5d8d67', stroke: '#fff', 'stroke-width': 2, tabindex: 0, 'aria-label': `${formatDate(point.day)}: ${point.participants} participant enrollments` });
    const target = svgNode('circle', { cx: x(point), cy: y(point.participants), r: 16, fill: 'transparent' });
    for (const node of [dot, target]) {
      node.addEventListener('mouseenter', () => show(dot, point));
      node.addEventListener('click', () => show(dot, point));
      node.addEventListener('mouseleave', hide);
    }
    dot.addEventListener('focus', () => show(dot, point)); dot.addEventListener('blur', hide);
    svg.append(target);
    return dot;
  });
  svg.append(...dots);
  // Date labels by distance, not by count: dates bunched together (several filings in one
  // week) would otherwise print on top of each other. The last date is always shown.
  const gap = 170;
  const lastPoint = points.at(-1);
  const labels = points.length > 1 && x(lastPoint) - x(points[0]) >= gap ? [points[0]] : [];
  for (const point of points.slice(1, -1)) {
    if (labels.length && x(point) - x(labels.at(-1)) >= gap && x(lastPoint) - x(point) >= gap) labels.push(point);
  }
  labels.push(lastPoint);
  for (const point of labels) {
    svg.append(svgNode('text', { x: x(point), y: height - 16, 'text-anchor': points.length === 1 ? 'middle' : point === lastPoint ? 'end' : point === points[0] ? 'start' : 'middle', class: 'chart-axis' }, formatDate(point.day)));
  }
  section.append(svg, tip);
  if (points.length === 1) { const note = document.createElement('p'); note.className = 'chart-caption'; note.textContent = 'One reporting date so far. More submissions on later dates will build the trend.'; section.append(note); }
  const details = document.createElement('details'); details.className = 'chart-data';
  const summary = document.createElement('summary'); summary.textContent = 'View chart data'; details.append(summary);
  const table = document.createElement('table');
  const head = document.createElement('thead'); const row = document.createElement('tr');
  for (const text of ['Submission date', 'Participant enrollments']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; row.append(th); }
  head.append(row); table.append(head);
  const body = document.createElement('tbody');
  for (const point of points) { const tr = document.createElement('tr'); for (const text of [formatDate(point.day), point.participants.toLocaleString()]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } body.append(tr); }
  table.append(body); details.append(table); section.append(details);
  return section;
}
