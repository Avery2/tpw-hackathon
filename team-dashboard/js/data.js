// Submissions come from TPW's Google Sheet (see assets/dashboard-source.js); Firebase is retired.
export { loadDashboard } from '../../assets/dashboard-source.js';

// Latest submission for each program wins; historical updates are not added twice.
export function existingPrograms(submissions) {
  const latest = new Map();
  const ordered = [...submissions].sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')) || String(a.id).localeCompare(String(b.id)));
  for (const submission of ordered) {
    const owner = submission.orgId || submission.organization || submission.id;
    for (const program of submission.programs || []) {
      const key = JSON.stringify([owner, program.id || program.name.trim().toLowerCase()]);
      latest.set(key, { ...program, organization: submission.organization, orgId: submission.orgId, synthetic: Boolean(submission.synthetic), submittedAt: submission.submittedAt, submissionId: submission.id, prisons: submission.prisons || [] });
    }
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Snapshot totals by reporting day. Program revisions replace older counts.
export function participantHistory(submissions) {
  const days = new Map();
  for (const submission of submissions) {
    const date = new Date(submission.submittedAt);
    if (Number.isNaN(date.getTime())) continue;
    const day = date.toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(submission);
  }
  const history = [];
  const snapshots = [];
  for (const day of [...days.keys()].sort()) {
    snapshots.push(...days.get(day));
    const total = existingPrograms(snapshots).reduce((sum, program) => sum + Math.max(0, Number(program.participants) || 0), 0);
    history.push({ day, participants: total });
  }
  return history;
}
