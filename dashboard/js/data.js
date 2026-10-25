import { estimateRac, estimatedSavings } from './rac.js';
import { firestoreClient } from '../../form-demo/js/submissions.js';

export async function loadDashboard(orgId) {
  const { db, doc, getDoc, collection, query, where, getDocs } = await firestoreClient();
  if (!orgId) {
    const [orgs, submissions] = await Promise.all([
      getDocs(collection(db, 'orgs')), getDocs(collection(db, 'submissions'))
    ]);
    const profiles = orgs.docs.map(item => ({ ...item.data(), id: item.id }));
    const records = submissions.docs.map(item => {
      const data = item.data();
      const matching = profiles.filter(org => org.name === data.organization);
      return { ...data, id: item.id, orgId: data.orgId || (matching.length === 1 ? matching[0].id : null) };
    });
    return { org: null, orgs: profiles, submissions: records };
  }
  const profile = await getDoc(doc(db, 'orgs', orgId));
  if (!profile.exists()) throw new Error('Organization profile was not found.');
  const org = { ...profile.data(), id: profile.id };
  // Also find earlier form entries that predate organization IDs.
  const [linked, legacy] = await Promise.all([
    getDocs(query(collection(db, 'submissions'), where('orgId', '==', orgId))),
    getDocs(query(collection(db, 'submissions'), where('organization', '==', org.name)))
  ]);
  const records = new Map();
  for (const item of [...linked.docs, ...legacy.docs]) {
    const data = item.data();
    if (!data.orgId || data.orgId === orgId) records.set(item.id, { ...data, id: item.id, orgId });
  }
  return { org, orgs: [org], submissions: [...records.values()] };
}

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
    const programs = existingPrograms(snapshots);
    const total = programs.reduce((sum, program) => sum + Math.max(0, Number(program.participants) || 0), 0);
    const completed = programs.reduce((sum, program) => sum + Math.max(0, Number(program.participantsCompleted) || 0), 0);
    const racDays = programs.reduce((sum, program) => sum + estimateRac(program).days, 0);
    history.push({ day, participants: total, completed, completionRate: total > 0 ? completed / total * 100 : null, racDays, savings: estimatedSavings(racDays) });
  }
  return history;
}
