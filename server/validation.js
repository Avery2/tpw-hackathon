export class InputError extends Error {}
const fail = message => { throw new InputError(message); };
export function validateSubmission(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('Submission must be an object.');
  if (typeof doc.organization !== 'string' || !doc.organization.trim() || doc.organization.length > 200) fail('Enter an organization name.');
  if (doc.orgId != null && (typeof doc.orgId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(doc.orgId))) fail('Invalid organization ID.');
  if (!doc.reportingPeriod || !Number.isInteger(doc.reportingPeriod.quarter) || doc.reportingPeriod.quarter < 1 || doc.reportingPeriod.quarter > 4 || !Number.isInteger(doc.reportingPeriod.year) || doc.reportingPeriod.year < 2000 || doc.reportingPeriod.year > 2200) fail('Choose a valid quarter and year.');
  if (!Array.isArray(doc.prisons) || !doc.prisons.length || doc.prisons.length > 100 || !Array.isArray(doc.programs) || !doc.programs.length || doc.programs.length > 300) fail('Add facilities and programs.');
  const facilities = new Map();
  for (const facility of doc.prisons) {
    if (typeof facility.code !== 'string' || !facility.code || typeof facility.name !== 'string' || !Array.isArray(facility.yards) || !facility.yards.length || facility.yards.some(y => typeof y !== 'string' || !y.trim())) fail('Each facility needs a name, code, and yards.');
    if (facilities.has(facility.code)) fail('A facility was listed twice.');
    facilities.set(facility.code, new Set(facility.yards));
  }
  for (const p of doc.programs) {
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) fail('Enter each program name.');
    if (!['Planned','In Progress','Completed'].includes(p.status)) fail('Choose a valid program status.');
    for (const key of ['courseHours','participants','participantsCompleted']) if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 10000000 || (key !== 'courseHours' && !Number.isInteger(p[key]))) fail('Program hours and counts must be valid nonnegative numbers.');
    if (p.participantsCompleted > p.participants) fail('Completed participants cannot exceed participants.');
    const validDate = value => typeof value === 'string' && (!value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value));
    if (!validDate(p.startDate) || !validDate(p.endDate) || (p.startDate && p.endDate && p.endDate < p.startDate)) fail('Check the program dates.');
    if (!Array.isArray(p.assignments) || !p.assignments.length) fail('Assign every program to a facility and yard.');
    for (const a of p.assignments) if (!facilities.has(a.code) || !Array.isArray(a.yards) || !a.yards.length || a.yards.some(y => !facilities.get(a.code).has(y))) fail('Program yards must belong to a selected facility.');
  }
  return {...doc, organization:doc.organization.trim(), synthetic:true, totals: doc.programs.reduce((t,p) => ({programs:t.programs+1, courseHours:t.courseHours+p.courseHours, participants:t.participants+p.participants, participantsCompleted:t.participantsCompleted+p.participantsCompleted, participantHoursDelivered:t.participantHoursDelivered+p.courseHours*p.participantsCompleted}), {programs:0,courseHours:0,participants:0,participantsCompleted:0,participantHoursDelivered:0})};
}
