import { demoApi } from './neon-api.js';

export function toSubmissionDocument(payload, draft) {
  return {
    schemaVersion: 1,
    source: 'team-form',
    organization: payload.organization,
    orgId: payload.orgId,
    previousSubmissionId: payload.previousSubmissionId || null,
    reportingPeriod: payload.reportingPeriod,
    submittedAt: draft.submittedAt,
    prisons: draft.prisons,
    programs: payload.programs.map(({ sites, ...program }) => {
      const assignments = new Map();
      let participants = 0;
      let participantsCompleted = 0;
      for (const site of sites) {
        if (!assignments.has(site.facilityCode)) assignments.set(site.facilityCode, []);
        assignments.get(site.facilityCode).push(site.yard);
        participants += site.participants;
        participantsCompleted += site.completed;
      }
      return {
        ...program,
        assignments: Array.from(assignments, ([code, yards]) => ({ code, yards })),
        participants,
        participantsCompleted,
        // Keep the breakdown alongside the shared reporting metrics.
        sites
      };
    })
  };
}

export async function saveTeamSubmission(payload, draft) {
  try {
    const result = await demoApi('submissions', {
      method: 'POST',
      body: JSON.stringify({ id: payload.submissionId, submission: toSubmissionDocument(payload, draft) })
    });
    if (result.id !== payload.submissionId) throw new Error('The database did not return a matching receipt.');
    return { ok: true, submissionId: result.id, reference: result.id };
  } catch (error) {
    error.definitiveRejection = [400, 413].includes(error.status);
    throw error;
  }
}
