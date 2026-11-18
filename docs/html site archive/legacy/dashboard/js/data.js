import { existingPrograms } from './existing-programs.js';
export { existingPrograms };
import { estimateRac, estimatedSavings } from './rac.js';
import { demoApi } from '../../assets/neon-api.js';

export async function loadDashboard(orgId) {
  return demoApi(`dashboard${orgId ? `?org=${encodeURIComponent(orgId)}` : ''}`);
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
    const programs = existingPrograms(snapshots);
    const total = programs.reduce((sum, program) => sum + Math.max(0, Number(program.participants) || 0), 0);
    const completed = programs.reduce((sum, program) => sum + Math.max(0, Number(program.participantsCompleted) || 0), 0);
    const racDays = programs.reduce((sum, program) => sum + estimateRac(program).days, 0);
    history.push({ day, participants: total, completed, completionRate: total > 0 ? completed / total * 100 : null, racDays, savings: estimatedSavings(racDays) });
  }
  return history;
}
