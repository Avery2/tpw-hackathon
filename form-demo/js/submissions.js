import { demoApi } from '../../assets/neon-api.js';

export function submissionDocument(submission) {
  const value = (program, key) => Object.entries(program.values)
    .find(([name]) => name.endsWith(`[${key}]`))?.[1] ?? '';
  const programs = submission.programs.map(program => ({
    ...(program.id ? { id: program.id } : {}),
    name: program.name,
    assignments: program.assignments,
    status: value(program, 'scheduled_status'),
    startDate: value(program, 'start_date'),
    endDate: value(program, 'end_date'),
    courseHours: Number(value(program, 'course_hours')) || 0,
    participants: Number(value(program, 'participants')) || 0,
    participantsCompleted: Number(value(program, 'participants_completed')) || 0
  }));
  return {
    schemaVersion: 1,
    source: 'form-demo',
    organization: submission.organization,
    ...(submission.orgId ? { orgId: submission.orgId, previousSubmissionId: submission.previousSubmissionId || null } : {}),
    ...(submission.reportingPeriod ? { reportingPeriod: submission.reportingPeriod } : {}),
    prisons: submission.prisons,
    programs,
    submittedAt: submission.submittedAt,
    totals: programs.reduce((totals, program) => ({
      programs: totals.programs + 1,
      courseHours: totals.courseHours + program.courseHours,
      participants: totals.participants + program.participants,
      participantsCompleted: totals.participantsCompleted + program.participantsCompleted,
      participantHoursDelivered: totals.participantHoursDelivered + program.courseHours * program.participantsCompleted
    }), { programs: 0, courseHours: 0, participants: 0, participantsCompleted: 0, participantHoursDelivered: 0 })
  };
}

export async function saveSubmission(submission, id) {
  const result = await demoApi('submissions', {method:'POST', body:JSON.stringify({id, submission:submissionDocument(submission)})});
  return result.id;
}
