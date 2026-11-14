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
