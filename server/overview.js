import { estimateRac, estimatedSavings } from '../dashboard/js/rac.js';

export async function loadTpwOverview(db) {
  const { rows: records } = await db.query(`
    SELECT s.id, s.org_id, s.document->>'submittedAt' AS submitted_at,
           p.source->>'id' AS program_id, p.name, p.ordinal,
           t.course_hours, t.participants, t.completed,
           ARRAY(SELECT DISTINCT y.facility_code
                 FROM submission_program_locations l
                 JOIN submission_yards y USING (submission_id, yard_id)
                 WHERE l.submission_id = s.id AND l.program_id = p.program_id) AS facilities
    FROM submissions s
    LEFT JOIN submission_programs p ON p.submission_id = s.id
    LEFT JOIN (
      SELECT submission_id, program_id, sum(course_hours)::float8 AS course_hours,
             sum(participants)::float8 AS participants, sum(participants_completed)::float8 AS completed
      FROM program_metric_groups GROUP BY submission_id, program_id
    ) t ON t.submission_id = p.submission_id AND t.program_id = p.program_id
  `);
  const { rows: [directory] } = await db.query('SELECT count(*)::int AS count FROM organizations');

  records.sort((a, b) => (a.submitted_at || '').localeCompare(b.submitted_at || '') ||
    a.id.localeCompare(b.id) || a.ordinal - b.ordinal);
  const programKey = row => JSON.stringify([row.org_id, row.program_id || row.name.trim().toLowerCase()]);
  function totals(programs) {
    let participants = 0, completed = 0, hours = 0, racDays = 0;
    for (const row of programs.values()) {
      participants += row.participants;
      completed += row.completed;
      hours += row.course_hours * row.completed;
      racDays += estimateRac({ courseHours: row.course_hours, participantsCompleted: row.completed }).days;
    }
    return { participants, completed, hours, racDays, completionRate: participants ? completed / participants * 100 : null };
  }

  const latest = new Map();
  const history = new Map();
  for (const row of records) {
    if (row.name != null) latest.set(programKey(row), row);
    if (!row.submitted_at) continue;
    const date = new Date(row.submitted_at);
    if (!Number.isFinite(date.getTime())) continue;
    const day = date.toISOString().slice(0, 10);
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    const quarterLabel = `Q${quarter} ${date.getUTCFullYear()}`;
    if (!history.has(quarterLabel)) history.set(quarterLabel, { day, quarterLabel, rows: [] });
    const point = history.get(quarterLabel);
    if (day > point.day) point.day = day;
    if (row.name != null) point.rows.push(row);
  }

  const snapshots = new Map();
  const points = [...history.values()].sort((a, b) => a.day.localeCompare(b.day)).map(({ day, quarterLabel, rows }) => {
    for (const row of rows) snapshots.set(programKey(row), row);
    const { participants, completed, completionRate, racDays } = totals(snapshots);
    return { day, quarterLabel, participants, completed, completionRate, racDays, savings: estimatedSavings(racDays) };
  });
  return {
    organizationCount: directory.count,
    submissionCount: new Set(records.map(row => row.id)).size,
    programCount: latest.size,
    facilityCount: new Set([...latest.values()].flatMap(row => row.facilities)).size,
    ...totals(latest),
    points
  };
}
