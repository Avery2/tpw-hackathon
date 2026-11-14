import { existingPrograms } from './data.js';
export function checkinDraft(data) {
  const ordered = [...data.submissions].sort((a,b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  const latest = ordered[0];
  const now = new Date();
  const period = latest?.reportingPeriod || (latest?.submittedAt ? {quarter: Math.floor(new Date(latest.submittedAt).getUTCMonth()/3)+1, year: new Date(latest.submittedAt).getUTCFullYear()} : null);
  const reportingPeriod = period ? {quarter: period.quarter === 4 ? 1 : period.quarter + 1, year: period.year + (period.quarter === 4 ? 1 : 0)} : {quarter: Math.floor(now.getMonth()/3)+1, year: now.getFullYear()};
  const programs = existingPrograms(data.submissions);
  const prisons = new Map();
  for (const program of programs) for (const assignment of program.assignments || []) {
    const previous = prisons.get(assignment.code);
    const name = program.prisons.find(prison => prison.code === assignment.code)?.name || assignment.code;
    prisons.set(assignment.code, {code: assignment.code, name, yards: [...new Set([...(previous?.yards || []), ...assignment.yards])]});
  }
  return { orgId: data.org.id, organization: data.org.name, previousSubmissionId: latest?.id || null, reportingPeriod, prisons: [...prisons.values()],
    programs: programs.map((program,index) => ({id: program.id || `carried-${index}-${program.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`, name: program.name, assignments: program.assignments,
      needsReview: true, values: Object.fromEntries(Object.entries({program_name: program.name, scheduled_status:'Planned',start_date:'',end_date:'',course_hours:String(program.courseHours ?? 0),participants:'0',participants_completed:'0'}).map(([key,value])=>[`programs[${index}][${key}]`,value]))})) };
}
