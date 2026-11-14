import { existingPrograms } from '../dashboard/js/existing-programs.js';
import { InputError } from './validation.js';

const numeric = new Set(['courseHours', 'participants', 'participantsCompleted']);
const columns = ['organization', 'name', 'status', 'prison', 'yards', 'startDate', 'endDate', ...numeric];
const pageSize = 24;

function paginate(items, query, size = pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.get('page'), 10) || 1));
  const offset = (page - 1) * size;
  return { items: items.slice(offset, offset + size), count: items.length, page, pages, offset };
}

async function records(db, org, orgIds = null) {
  const { rows } = await db.query(`
    SELECT s.id, s.org_id AS "orgId", COALESCE(s.document->>'organization', o.name) AS organization,
      s.document->>'submittedAt' AS "submittedAt",
      jsonb_build_object('year', s.reporting_year, 'quarter', s.reporting_quarter,
          'inferred', s.reporting_period_inferred) AS "reportingPeriod",
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.source->>'id', 'name', p.name, 'status', g.status,
        'courseHours', g.course_hours, 'participants', g.participants,
        'participantsCompleted', g.participants_completed,
        'startDate', g.start_date, 'endDate', g.end_date,
        'assignments', COALESCE(l.assignments, '[]'::jsonb),
        'prisons', COALESCE(l.facilities, '[]'::jsonb)
      ) ORDER BY p.ordinal) FILTER (WHERE p.program_id IS NOT NULL), '[]'::jsonb) AS programs,
      bool_or(g.scope <> 'shared' OR g.group_key <> 'shared') AS unsupported
    FROM submissions s JOIN organizations o ON o.id = s.org_id
    LEFT JOIN submission_programs p ON p.submission_id = s.id
    LEFT JOIN program_metric_groups g ON g.submission_id = p.submission_id AND g.program_id = p.program_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('code', a.code, 'yards', a.yards)) AS assignments,
             jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name)) AS facilities
      FROM (
        SELECT y.facility_code AS code, f.name, jsonb_agg(y.name ORDER BY y.ordinal) AS yards
        FROM submission_program_locations sl
        JOIN submission_yards y USING (submission_id, yard_id)
        JOIN submission_facilities f USING (submission_id, facility_code)
        WHERE sl.submission_id = p.submission_id AND sl.program_id = p.program_id
        GROUP BY y.facility_code, f.name
      ) a
    ) l ON true
    WHERE ($1::text IS NULL OR s.org_id = $1)
      AND ($2::text[] IS NULL OR s.org_id = ANY($2))
    GROUP BY s.id, o.name ORDER BY s.received_at, s.id
  `, [org, orgIds]);
  if (rows.some(row => row.unsupported)) throw new InputError('Location-specific reports need the location-reporting interface.');
  return rows.map(row => ({ ...row, prisons: row.programs.flatMap(program => program.prisons) }));
}

export async function programsPage(db, query) {
  const programs = existingPrograms(await records(db, query.get('org')));
  const rows = programs.flatMap(program => {
    const assignments = program.assignments?.length ? program.assignments : [{}];
    return assignments.map(assignment => ({
      ...Object.fromEntries(columns.map(key => [key, program[key]])),
      program,
      prison: program.prisons.find(facility => facility.code === assignment.code)?.name || assignment.code || '',
      yards: (assignment.yards || []).join(', ')
    }));
  });
  const search = (query.get('search') || '').trim().toLowerCase();
  const key = columns.includes(query.get('sort')) ? query.get('sort') : 'name';
  const direction = query.get('direction') === 'desc' ? -1 : 1;
  const matches = rows.filter(row => columns.some(column => String(row[column] ?? '').toLowerCase().includes(search)));
  matches.sort((a,b) => direction * (numeric.has(key) ? a[key] - b[key] :
    String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { numeric: true })));
  if (query.get('view') === 'cards') return { ...paginate([...new Set(matches.map(row => row.program))], query), total: programs.length };
  return { ...paginate(matches.map(({program, ...row}) => row), query), total: rows.length };
}

function quarterly(records) {
  const groups = new Map();
  for (const record of records) {
    const { year, quarter } = record.reportingPeriod;
    const key = JSON.stringify([record.orgId, year, quarter]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups].map(([key, group]) => {
    group.sort((a,b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    return { ...group[0], key, programs: existingPrograms(group) };
  }).sort((a,b) => b.reportingPeriod.year - a.reportingPeriod.year || b.reportingPeriod.quarter - a.reportingPeriod.quarter);
}

function metrics(programs) {
  return programs.reduce((totals, program) => {
    totals.programs++;
    totals.participants += program.participants;
    totals.completed += program.participantsCompleted;
    totals.hours += program.courseHours * program.participantsCompleted;
    return totals;
  }, { programs: 0, participants: 0, completed: 0, hours: 0 });
}

export async function submissionsPage(db, query) {
  const detail = query.get('detail');
  let org = query.get('org');
  if (detail) {
    let identity;
    try { identity = JSON.parse(detail); } catch { throw new InputError('Invalid submission reference.'); }
    if (!Array.isArray(identity) || typeof identity[0] !== 'string' || (org && org !== identity[0])) throw new InputError('Invalid submission reference.');
    org = identity[0];
  }
  const reports = quarterly(await records(db, org));
  if (detail) {
    const report = reports.find(record => record.key === detail);
    return { programs: report?.programs || [] };
  }
  const from = query.get('from'), to = query.get('to'), year = query.get('year'), quarter = query.get('quarter');
  const filtered = reports.filter(record => {
    const day = String(record.submittedAt || '').slice(0,10), period = record.reportingPeriod;
    return (!from || day >= from) && (!to || day <= to) && (!year || String(period.year) === year) &&
      (!quarter || String(period.quarter) === quarter);
  });
  const page = paginate(filtered, query);
  return {
    ...page,
    items: page.items.map(({key, organization, reportingPeriod, submittedAt, programs}) => ({
      key, organization, reportingPeriod, submittedAt, metrics: metrics(programs),
      facilities: new Set(programs.flatMap(program => program.assignments.map(assignment => assignment.code))).size
    })),
    total: reports.length,
    totals: metrics(existingPrograms(filtered)),
    years: [...new Set(reports.map(record => record.reportingPeriod.year).filter(Boolean))].sort((a,b) => b-a)
  };
}

export async function submissionTracking(db) {
  const {rows: orgs} = await db.query('SELECT id, name FROM organizations ORDER BY name');
  const {rows: submissions} = await db.query(`
    SELECT DISTINCT org_id AS "orgId",
      jsonb_build_object('year', reporting_year, 'quarter', reporting_quarter) AS "reportingPeriod"
    FROM submissions WHERE reporting_year IS NOT NULL AND reporting_quarter IS NOT NULL
  `);
  return { orgs, submissions };
}

export async function organizationsPage(db, query) {
  const { rows: orgs } = await db.query('SELECT id, name FROM organizations ORDER BY name, id');
  const search = (query.get('search') || '').trim().toLowerCase();
  const matches = orgs.filter(org => org.name.toLowerCase().includes(search));
  const page = paginate(matches, query, query.get('view') === 'table' ? 24 : 12);
  const submissions = page.items.length ? await records(db, null, page.items.map(org => org.id)) : [];
  const byOrg = new Map();
  for (const submission of submissions) {
    if (!byOrg.has(submission.orgId)) byOrg.set(submission.orgId, []);
    byOrg.get(submission.orgId).push(submission);
  }
  return {
    ...page,
    total: orgs.length,
    items: page.items.map(org => {
      const history = byOrg.get(org.id) || [];
      const programs = existingPrograms(history);
      const totals = metrics(programs);
      totals.facilities = new Set(programs.flatMap(program => program.assignments.map(assignment => assignment.code))).size;
      const latest = history.map(submission => submission.submittedAt).filter(Boolean).sort().at(-1) || null;
      return { org, totals, latest };
    })
  };
}
