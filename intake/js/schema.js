// Schema loading, derived fields, and the validation contract.
// Mirrors scripts/intake_validate.py — both read data/intake/schema.json, so the
// browser and CI can never disagree about what a valid cycle is.

const DATA = new URL('../../data/intake/', import.meta.url);

export const state = {
  schema: null,
  facilities: [],
  config: null,
  seed: [], // historical rows imported from the Collective Impact sheet
  cycles: [], // cycles committed under data/intake/cycles/
  orgs: [], // derived registry: what each organization keeps telling us
  join: { participants: [] }, // synthetic demo spine
  loadedAt: null,
  errors: [],
};

async function getJSON(path, fallback, bust = false) {
  try {
    const url = new URL(path, DATA);
    // GitHub Pages serves with a 10-minute edge cache. The ledger has to reflect
    // a commit immediately after it lands, so mutable files are cache-busted;
    // the immutable ones (schema, seed) are not.
    if (bust) url.searchParams.set('t', Date.now().toString(36));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export async function loadAll() {
  const [config, schema, facilities, seed, join, orgs] = await Promise.all([
    getJSON('config.json', {}),
    getJSON('schema.json'),
    getJSON('facilities.json', { facilities: [] }),
    getJSON('seed.json', { cycles: [] }),
    getJSON('demo/join.json', { participants: [] }),
    getJSON('orgs/index.json', { orgs: [] }),
  ]);

  Object.assign(state, {
    config,
    schema,
    facilities: facilities.facilities,
    seed: seed.cycles || [],
    orgs: orgs.orgs || [],
    join,
  });

  const index = await getJSON('cycles/index.json', { cycles: [] }, true);
  const names = (index.cycles || []).map((c) => (typeof c === 'string' ? c : c.file));
  const loaded = await Promise.all(
    names.map((file) => getJSON(`cycles/${file}`, null, true).catch(() => null))
  );
  state.cycles = loaded.filter(Boolean);
  state.loadedAt = new Date();
  return state;
}

export const fields = () => state.schema.fields;
export const fieldByKey = (key) => state.schema.fields.find((f) => f.key === key);
export const facilityNames = () => state.facilities.map((f) => f.name);
export const facilityCode = (name) => state.facilities.find((f) => f.name === name)?.code || null;

/* ------------------------------------------------------------ the registry */

export const orgs = () => state.orgs;
export const orgById = (id) => state.orgs.find((o) => o.id === id) || null;

export function programOf(org, programId) {
  if (!org) return null;
  return programId ? org.programs.find((p) => p.id === programId) || null : org.programs[0] || null;
}

export function siteOf(program, siteId) {
  if (!program) return null;
  return siteId ? program.sites.find((s) => s.id === siteId) || null : program.sites[0] || null;
}

/**
 * What this organization already told us, expressed as form values.
 *
 * Anything ambiguous is left blank on purpose: guessing which of GRIP's 25 sites
 * a new cycle belongs to would be worse than asking. Ambiguity is resolved only
 * when there is exactly one candidate.
 */
export function prefillFrom(orgId, programId = null, siteId = null) {
  const org = orgById(orgId);
  if (!org) return {};

  const program = org.programs.length === 1 || programId ? programOf(org, programId) : null;
  const site = program && (program.sites.length === 1 || siteId) ? siteOf(program, siteId) : null;
  const contact = org.contact || {};

  return dropEmpty({
    org: org.org,
    program: program?.name,
    facility: site?.facility,
    yard: site?.yard,
    course_hours: program?.course_hours,
    funded_by: program?.funded_by,
    submitter_name: contact.name,
    submitter_email: contact.email,
    submitter_role: contact.role,
  });
}

const dropEmpty = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));

/** Fields required for this particular cycle, honouring conditional rules. */
export function isRequired(field, cycle) {
  if (field.required_for === 'submission' && cycle.source === 'sheet-import') return false;
  if (field.required) return true;
  if (!field.required_when) return false;
  return Object.entries(field.required_when).every(([k, allowed]) => allowed.includes(cycle[k]));
}

const numeric = (v) => (v == null || v === '' ? NaN : Number(v));

export function derive(cycle) {
  const hours = numeric(cycle.course_hours);
  const done = numeric(cycle.participants_completed);
  const started = numeric(cycle.participants_started);
  const out = {
    total_participant_hours: Number.isFinite(hours) && Number.isFinite(done) ? hours * done : null,
    program_year: cycle.start_date ? Number(cycle.start_date.slice(0, 4)) : null,
    duration_days: null,
    completion_rate: null,
  };
  if (cycle.start_date && cycle.end_date) {
    const a = Date.parse(`${cycle.start_date}T00:00:00Z`);
    const b = Date.parse(`${cycle.end_date}T00:00:00Z`);
    if (Number.isFinite(a) && Number.isFinite(b)) out.duration_days = Math.round((b - a) / 86400000);
  }
  if (Number.isFinite(started) && started > 0 && Number.isFinite(done)) out.completion_rate = done / started;
  return out;
}

export function cycleKey(c) {
  return [c.facility, c.yard || '', c.program, c.start_date].join('|').toLowerCase();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @returns {{errors: Array<{key:string,msg:string}>, warnings: Array<{code:string,msg:string,level:string}>}}
 */
export function validate(cycle, { all = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (key, msg) => errors.push({ key, msg });
  const warn = (code, msg, level = 'warning') => warnings.push({ code, msg, level });

  for (const f of fields()) {
    const v = cycle[f.key];
    const blank = v == null || (typeof v === 'string' && !v.trim());

    if (blank) {
      if (isRequired(f, cycle)) err(f.key, `${f.label} is required.`);
      continue;
    }

    if (f.type === 'text' || f.type === 'textarea' || f.type === 'email') {
      if (typeof v !== 'string') {
        err(f.key, `${f.label} must be text.`);
        continue;
      }
      if (f.max && v.length > f.max) err(f.key, `${f.label} is longer than ${f.max} characters.`);
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        err(f.key, 'That does not look like an email address.');
      }
    } else if (f.type === 'date') {
      if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
        err(f.key, `${f.label} must be a calendar date.`);
      }
    } else if (f.type === 'number' || f.type === 'integer') {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        err(f.key, `${f.label} must be a number.`);
        continue;
      }
      if (f.type === 'integer' && !Number.isInteger(n)) err(f.key, `${f.label} must be a whole number.`);
      if (f.min != null && n < f.min) err(f.key, `${f.label} must be at least ${f.min}.`);
      if (f.max != null && n > f.max) err(f.key, `${f.label} must be at most ${f.max}.`);
    } else if (f.type === 'select') {
      const allowed = f.options || (f.source === 'facilities' ? facilityNames() : null);
      if (allowed && !allowed.includes(v)) err(f.key, `Choose a ${f.label.toLowerCase()} from the reference list.`);
    }
  }

  const started = Number(cycle.participants_started);
  const done = Number(cycle.participants_completed);
  const hours = Number(cycle.course_hours);

  if (Number.isFinite(started) && Number.isFinite(done) && done > started) {
    err('participants_completed', 'More participants completed than began. One of the two numbers is off.');
  }
  if (cycle.start_date && cycle.end_date && cycle.end_date < cycle.start_date) {
    err('end_date', 'End date falls before the start date.');
  }
  if (cycle.status === 'Completed' && !cycle.end_date) {
    err('end_date', 'A completed cycle needs an end date.');
  }
  if (cycle.status === 'Completed' && Number.isFinite(started) && started === 0) {
    err('participants_started', 'A completed cycle with zero enrollees records no activity.');
  }
  if (Number.isFinite(hours) && Number.isFinite(done) && done > 0 && hours <= 0) {
    err('course_hours', 'Course hours must be greater than zero when participants completed.');
  }

  // --- signal, not failure ------------------------------------------------
  const d = derive(cycle);
  if (d.duration_days != null && d.duration_days > 548) {
    warn('implausible-duration', `This cycle runs ${num(d.duration_days)} days. Confirm that is not a typo.`);
  }
  if (cycle.status === 'Completed' && cycle.start_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (cycle.start_date > today) warn('future-date', 'Start date is in the future for a completed cycle.');
  }
  if (cycle.status === 'Completed' && cycle.participants_completed == null) {
    warn('unknown-completions', 'Completions are unknown. This cycle cannot contribute hours or outcomes yet.');
  }
  if (Number.isFinite(done) && done === 0) {
    warn('empty-completions-zero', 'Zero completions. That is recorded as a delivery failure, not omitted.', 'info');
  }
  const key = cycleKey(cycle);
  const clash = all.filter((c) => c.id !== cycle.id && cycleKey(c) === key);
  if (clash.length) {
    warn(
      'duplicate-cycle',
      `Another cycle shares this facility, yard, program and start date (${clash.length}). If these are separate cohorts, distinguish them by yard or note.`
    );
  }
  if (!cycle.join?.tokens?.length) {
    warn('missing-join', 'No participant join spine. Activity data only — this cycle cannot be matched to outcome records.', 'info');
  }
  return { errors, warnings };
}

/** Stable, human-readable id: readable prefix + short content hash for collisions. */
export async function makeId(cycle) {
  const slug = [cycle.org, cycle.program, cycle.facility, cycle.yard, cycle.start_date]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const canonical = { ...cycle, join: { ...cycle.join, tokens: [...(cycle.join?.tokens || [])].sort((a, b) => a.token.localeCompare(b.token)) } };
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  const hash = [...new Uint8Array(buf)].slice(0, 3).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${slug}-${hash}`;
}

/** Fields an organization repeats on every cycle it files. */
export const RECURRING = [
  'org',
  'program',
  'facility',
  'yard',
  'course_hours',
  'funded_by',
  'submitter_name',
  'submitter_email',
  'submitter_role',
];

/** The recurring half of a cycle, for carrying forward into the next one. */
export function carryOver(cycle, keys = RECURRING) {
  return dropEmpty(Object.fromEntries(keys.map((k) => [k, cycle?.[k]])));
}

/**
 * @param {object} [prefill] values already known — from the registry, or from the
 *   cycle just submitted. Everything else starts blank.
 */
export const blankCycle = (prefill = {}) => ({
  org: '',
  program: '',
  facility: '',
  yard: '',
  status: 'Completed',
  start_date: '',
  end_date: '',
  course_hours: '',
  participants_started: '',
  participants_completed: '',
  funded_by: 'Unknown',
  notes: '',
  submitter_name: '',
  submitter_email: '',
  submitter_role: '',
  ...carryOver(prefill, [...RECURRING, 'status']),
  join: { spine_version: 'tpw.join/1', tokens: [] },
});
