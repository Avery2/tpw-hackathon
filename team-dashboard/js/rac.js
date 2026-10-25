// Scenario estimate only: approved hours per completed enrollment in a 12-month window.
// Aggregate submissions cannot verify approval, attendance, or cross-program person caps.
export function estimateRac(program) {
  const hours = Math.max(0, Number(program.courseHours) || 0);
  const completed = Math.max(0, Math.floor(Number(program.participantsCompleted) || 0));
  const daysPerEnrollment = Math.min(40, Math.floor(hours / 52) * 10);
  return { hours, completed, daysPerEnrollment, days: daysPerEnrollment * completed };
}

export function estimatedSavings(days, dailyRate = 59) {
  return Math.max(0, Number(days) || 0) * Math.max(0, Number(dailyRate) || 0);
}

// Why an organization's estimate is 0, in plain words, so its cards don't just say "0 days" and "$0".
// Blank figures reach the dashboard as 0, so 0 hours and 0 completions means nothing usable was submitted.
export function noCreditReason(programs) {
  const results = programs.map(estimateRac);
  if (results.some(result => result.days > 0)) return '';
  if (results.every(result => !result.hours && !result.completed)) return 'No data submitted';
  if (results.every(result => !result.completed)) return 'No completions submitted yet';
  return 'No completions yet in programs of 52+ course hours';
}

export function racPanel(programs) {
  const node = (tag, text, className) => {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
    if (className) el.className = className; return el;
  };
  const section = node('section', undefined, 'rac-panel');
  const groups = new Map();
  for (const program of programs) {
    const key = program.orgId || program.organization || 'Unassigned';
    if (!groups.has(key)) groups.set(key, { name: program.organization || 'Organization', programs: [] });
    groups.get(key).programs.push(program);
  }
  const heading = node('div', undefined, 'rac-heading');
  heading.append(node('h3', 'Credit days participants could have earned'), node('span', 'Upper limit', 'rac-label'));
  section.append(heading, node('p', 'Assumes every program is approved for credit at its facility and every completion earns credit. Each person can earn at most 40 days a year across all programs, so the real number is probably lower.', 'rac-description'));
  const cards = node('div', undefined, 'rac-orgs');
  for (const group of groups.values()) {
    const card = node('article', undefined, 'rac-org');
    const days = group.programs.reduce((total, program) => total + estimateRac(program).days, 0);
    const reason = noCreditReason(group.programs);
    card.append(node('h4', group.name));
    // No credit days: say why instead of a bare 0.
    if (reason) card.append(node('strong', reason, 'rac-empty'));
    else card.append(node('strong', days.toLocaleString(), 'rac-total'), node('span', 'days of credit, at most', 'rac-unit'));
    const details = node('details'); details.append(node('summary', 'See calculation'));
    for (const program of group.programs) {
      const result = estimateRac(program);
      const row = node('div', undefined, 'rac-calculation');
      const nothing = reason && !result.hours && !result.completed;
      row.append(node('strong', program.name), node('span', nothing ? 'No course hours or completions submitted' : `${result.hours} hours → ${result.daysPerEnrollment} days × ${result.completed} completed enrollments = ${result.days.toLocaleString()} days`)); details.append(row);
    }
    if (reason) details.append(node('p', 'Credit starts at 52 course hours: 10 days for every 52 hours, up to 40 days for each completion.', 'rac-footnote'));
    card.append(details);
    const savings = node('article', undefined, 'rac-org savings-card');
    savings.append(node('h4', 'Facility costs avoided, if every credit day were applied'));
    const money = node('strong', undefined, reason ? 'rac-empty' : 'rac-total');
    money.setAttribute('aria-live', 'polite');
    const currency = value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    money.textContent = reason || currency(estimatedSavings(days));
    savings.append(money);
    if (!reason) savings.append(node('span', `upper limit: ${days.toLocaleString()} credit days × $59 a day`, 'rac-unit'));
    const costSource = node('a', 'Rate: LAO marginal cost, $21,534/year ÷ 365 (rounded)');
    costSource.href = 'https://www.lao.ca.gov/PolicyAreas/CJ/6_cj_inmatecost'; costSource.className = 'savings-source'; savings.append(costSource);
    const pair = node('div', undefined, 'rac-pair'); pair.append(card, savings); cards.append(pair);
  }
  if (!groups.size) cards.append(node('p', 'No program data available to estimate credits.'));
  section.append(cards);
  const source = node('a', 'CDCR credit-earning rules'); source.href = 'https://www.cdcr.ca.gov/proposition57/'; section.append(source);
  return section;
}
