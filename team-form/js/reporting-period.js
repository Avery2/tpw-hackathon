// TPW reports on California quarters, regardless of the browser's local timezone.
export function currentReportingPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric'
  }).formatToParts(now);
  const value = type => Number(parts.find(part => part.type === type).value);
  return { quarter: Math.floor((value('month') - 1) / 3) + 1, year: value('year') };
}
