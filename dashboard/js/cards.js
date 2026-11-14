function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}
const number = value => (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export function programCards(programs, admin = false) {
  const grid = element('div', 'existing-program-grid');
  for (const program of programs) {
    const card = element('article', 'existing-program');
    const top = element('div', 'program-card-top');
    if (admin) top.append(element('span', 'program-owner', program.organization || 'Organization not specified'));
    card.append(top, element('h3', '', program.name));
    const status = element('span', 'program-status', program.status || 'Status not specified'); status.dataset.status = program.status; card.append(status);
    const locations = element('div', 'program-locations');
    for (const assignment of program.assignments || []) {
      const prison = program.prisons.find(item => item.code === assignment.code);
      const row = element('div', 'program-location');
      row.append(element('strong', '', prison?.name || assignment.code), element('span', '', `Yards: ${(assignment.yards || []).join(', ') || 'Not specified'}`)); locations.append(row);
    }
    card.append(locations);
    const dates = element('div', 'program-date-range');
    const formatDate = value => value ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not specified';
    for (const [label, value] of [['Start date', formatDate(program.startDate)], ['End date', formatDate(program.endDate)]]) {
      const part = element('div'); part.append(element('span', '', label), element('strong', '', value)); dates.append(part);
    }
    card.append(dates);
    const metrics = element('div', 'program-card-metrics');
    for (const [label, value] of [['Course hours', program.courseHours], ['Participants', program.participants], ['Completed', program.participantsCompleted]]) {
      const metric = element('div'); metric.append(element('strong', '', number(value)), element('span', '', label)); metrics.append(metric);
    }
    card.append(metrics); grid.append(card);
  }
  return grid;
}
