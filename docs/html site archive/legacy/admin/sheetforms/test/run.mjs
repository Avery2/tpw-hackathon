#!/usr/bin/env node
/**
 * Local test harness for the intake receiver (admin/sheetforms/Code.gs).
 *
 * Runs the real deployment code against the repo's real contract files with
 * Apps Script's globals stubbed: no Google account, no deployment, no network.
 *
 *   node admin/sheetforms/test/run.mjs
 *
 * The checks that matter are the refusals. A receiver that accepts everything
 * is a public write endpoint into a spreadsheet someone will share with a
 * funder, so: unknown fields refused, anything person-shaped refused,
 * required fields, enums and arithmetic the CI validator already checks
 * refused here too.
 *
 * Every fixture below is invented. The organization and program names are
 * placeholders; the facility is a real public reference value because the
 * contract's facility list is real, and that is what makes the enum check
 * meaningful.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const CODE = path.join(REPO, 'admin', 'sheetforms', 'Code.gs');

const contractFiles = {
  'data/intake/schema.json': path.join(REPO, 'data/intake/schema.json'),
  'data/intake/simple_forms.json': path.join(REPO, 'data/intake/simple_forms.json'),
  'data/intake/facilities.json': path.join(REPO, 'data/intake/facilities.json'),
};

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (t) => console.log(`\n${t}`);

function makeEnv({ props = {}, unbound = false } = {}) {
  const cache = new Map();
  const rows = [];
  const locks = { taken: 0, released: 0 };
  const sheet = {
    getName: () => 'submissions',
    getLastRow: () => rows.length,
    appendRow: (r) => { rows.push([...r]); },
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => rows.slice(row - 1, row - 1 + numRows)
        .map((r) => r.slice(col - 1, col - 1 + numCols)),
    }),
  };
  const ss = { getSheetByName: (n) => (n === 'submissions' ? sheet : null), insertSheet: () => sheet };

  const env = {
    rows,
    locks,
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (unbound ? null : ss),
      openById: () => (unbound ? null : ss),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { locks.taken += 1; },
        releaseLock: () => { locks.released += 1; },
      }),
    },
    Utilities: {
      newBlob: (s) => ({ getBytes: () => Buffer.from(String(s), 'utf8') }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ _text: text, setMimeType() { return this; } }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        // Only the real site serves the contract: a suffix match would hide the
        // very failure this stub exists to reproduce.
        if (!url.startsWith('https://www.averychan.site/tpw-hackathon/')) {
          return { getResponseCode: () => 404, getContentText: () => 'not found' };
        }
        const key = Object.keys(contractFiles).find((k) => url.endsWith(k));
        if (!key) return { getResponseCode: () => 404, getContentText: () => 'not found' };
        return { getResponseCode: () => 200, getContentText: () => fs.readFileSync(contractFiles[key], 'utf8') };
      },
    },
  };

  const src = fs.readFileSync(CODE, 'utf8');
  const factory = new Function(
    'CacheService', 'PropertiesService', 'SpreadsheetApp', 'ContentService', 'UrlFetchApp',
    'Utilities', 'LockService',
    `${src}\nreturn { doGet, doPost, validate_, rowFor_, normalize_, loadContract_ };`,
  );
  env.api = factory(env.CacheService, env.PropertiesService, env.SpreadsheetApp,
    env.ContentService, env.UrlFetchApp, env.Utilities, env.LockService);
  return env;
}

const post = (env, body, query = {}) => {
  const res = env.api.doPost({
    postData: { contents: JSON.stringify(body) },
    parameter: query,
  });
  return JSON.parse(res._text);
};

// Invented organization and program: this file is public, and a real org's
// name next to invented numbers would read as one organization's real figures.
// The facility is a real reference value on purpose — the contract's facility
// list is real, and an invented one would only pass because nothing checked it.
const ORG = 'Example Youth Collective';
const PROGRAM = 'Sample Program';
const FACILITY = 'San Quentin Rehabilitation Center (SQ)';

const CYCLE = {
  schema: 'tpw.intake/1',
  id: 'example-youth-collective-sample-program-2026',
  org: ORG,
  program: PROGRAM,
  facility: FACILITY,
  yard: 'North',
  status: 'Completed',
  start_date: '2026-09-01',
  end_date: '2026-11-15',
  course_hours: 40,
  participants_started: 24,
  participants_completed: 19,
  funded_by: 'RIGHT 4.0',
  notes: null,
  submitter_name: 'Example Coordinator',
  submitter_email: 'coordinator@example.org',
  submitted_at: '2026-10-24T23:00:00.000Z',
  submitted_by: 'form',
};

// --- happy path -------------------------------------------------------------
section('accepts a real cycle');
{
  const env = makeEnv();
  const res = post(env, CYCLE);
  check('ok', res.ok === true, JSON.stringify(res));
  eq('id echoed', res.id, CYCLE.id);
  eq('header + one data row', env.rows.length, 2);
  eq('header matches the declared columns',
    env.rows[0].slice(0, 5), ['received_at', 'id', 'kind', 'org', 'program']);
  eq('org lands in its column', env.rows[1][3], ORG);
  const stored = JSON.parse(env.rows[1][env.rows[1].length - 1]);
  eq('payload round-trips', stored.id, CYCLE.id);
  eq('payload keeps the numbers as numbers', stored.participants_completed, 19);
  eq('the write is serialized', [env.locks.taken, env.locks.released], [1, 1]);
}
{
  const env = makeEnv();
  post(env, CYCLE);
  post(env, { ...CYCLE, id: 'second-cycle-id' });
  eq('header is written once', env.rows.filter((r) => r[0] === 'received_at').length, 1);
  eq('two data rows', env.rows.length, 3);
}
{
  const env = makeEnv();
  const res = post(env, { ...CYCLE, id: '  Example Youth Fall 2026  ' });
  check('an id with spaces and capitals is normalized, not rejected', res.ok === true, JSON.stringify(res));
  eq('stored normalized', res.id, 'example-youth-fall-2026');
}

// --- the refusals ----------------------------------------------------------
section('refuses what it should (this is the point)');
{
  const env = makeEnv();
  const res = post(env, { ...CYCLE, cdcr_number: 'AB1234' });
  eq('person-shaped field refused', res.error, 'forbidden-field');
  check('refusal explains why', /never anything identifying/.test(res.hint || ''), res.hint);
  eq('nothing written', env.rows.length, 0);
}
{
  const env = makeEnv();
  eq('unknown field refused', post(env, { ...CYCLE, favourite_colour: 'blue' }).error, 'unknown-field');
  eq('element-style field refused', post(env, { ...CYCLE, participant_name: 'x' }).error, 'unknown-field');
}
{
  const env = makeEnv();
  eq('completions > starts refused',
    post(env, { ...CYCLE, participants_started: 5, participants_completed: 9 }).error,
    'completions-exceed-starts');
  eq('end before start refused',
    post(env, { ...CYCLE, start_date: '2026-11-01', end_date: '2026-09-01' }).error,
    'end-before-start');
  eq('hours below the contract minimum refused', post(env, { ...CYCLE, course_hours: -3 }).error, 'out-of-range');
  eq('string hours refused', post(env, { ...CYCLE, course_hours: '40' }).error, 'bad-number');
  eq('fractional participant count refused', post(env, { ...CYCLE, participants_started: 2.5 }).error, 'bad-number');
  eq('missing org refused', post(env, { ...CYCLE, org: '' }).error, 'missing-field');
  eq('unparseable id refused', post(env, { ...CYCLE, id: 'no' }).error, 'bad-id');
  eq('no id refused', post(env, { ...CYCLE, id: undefined }).error, 'missing-id');
  eq('array body refused', post(env, []).error, 'not-an-object');
}

// The point of reading the contract instead of hard-coding it: these are the
// exact rules scripts/intake_validate.py applies, so CI will not reject a row
// this endpoint accepted.
section('the contract rules CI applies');
{
  const env = makeEnv();
  eq('a status outside schema.json statuses refused',
    post(env, { ...CYCLE, status: 'Finished' }).error, 'bad-option');
  eq('a funding source outside funding_sources refused',
    post(env, { ...CYCLE, funded_by: 'Grant' }).error, 'bad-option');
  eq('a facility outside facilities.json refused',
    post(env, { ...CYCLE, facility: 'Example State Prison (ESP)' }).error, 'bad-option');
  eq('missing submitter_name refused', post(env, { ...CYCLE, submitter_name: undefined }).error, 'missing-field');
  eq('missing submitter_email refused', post(env, { ...CYCLE, submitter_email: undefined }).error, 'missing-field');
  eq('a malformed email refused', post(env, { ...CYCLE, submitter_email: 'not-an-email' }).error, 'bad-email');
  eq('a completed cycle without an end date refused',
    post(env, { ...CYCLE, end_date: undefined }).error, 'missing-field');
  eq('a non-ISO date refused', post(env, { ...CYCLE, start_date: '09/01/2026' }).error, 'bad-date');
  eq('missing status refused', post(env, { ...CYCLE, status: undefined }).error, 'missing-field');
  eq('an over-long course_hours refused', post(env, { ...CYCLE, course_hours: 5000 }).error, 'out-of-range');
  eq('nothing written', env.rows.length, 0);
}

// --- records from the quick forms -----------------------------------------
section('quick-form records');
{
  const env = makeEnv();
  const weekly = {
    kind: 'session', id: 'session-2026-10-20-sq', org: ORG,
    program: PROGRAM, facility: FACILITY,
    session_date: '2026-10-20', session_no: 6, present_count: 18, walkins: 2,
    notes: '', roster_size: 22, checked_count: 18,
  };
  check('a session record is accepted', post(env, weekly).ok === true);
  eq('its kind is stored', env.rows[1][2], 'session');
  eq('unknown kind refused', post(env, { kind: 'payroll', id: 'payroll-0001', org: 'A' }).error, 'unknown-kind');
  eq('a session field on an aggregate refused',
    post(env, { kind: 'aggregate', id: 'agg-0001-2', org: 'A', program: 'P', session_no: 3 }).error,
    'unknown-field');
  eq('a session without its required count refused',
    post(env, { ...weekly, id: 'session-2026-10-27-sq', present_count: undefined }).error,
    'missing-field');
  eq('a session at an invented facility refused',
    post(env, { ...weekly, id: 'session-2026-10-28-sq', facility: 'Example State Prison (ESP)' }).error,
    'bad-option');
}

// --- key and limits -------------------------------------------------------
section('shared key and limits');
{
  const env = makeEnv({ props: { SHARE_KEY: 'sekrit' } });
  eq('missing key refused', post(env, CYCLE).error, 'bad-key');
  eq('wrong key refused', post(env, { ...CYCLE, key: 'nope' }).error, 'bad-key');
  check('right key accepted', post(env, { key: 'sekrit', payload: CYCLE }).ok === true);
}
{
  const env = makeEnv();
  check('no key configured == open endpoint', post(env, CYCLE).ok === true);
}
{
  const env = makeEnv();
  let last = null;
  for (let i = 0; i < 21; i++) last = post(env, { ...CYCLE, id: `cycle-${i}` }, { c: 'client-a' });
  eq('21st submission in a minute is throttled', last.error, 'rate-limited');
  eq('20 written', env.rows.length, 21);
}
{
  // The reason the shared ceiling is separate: one caller exhausting "their"
  // bucket must not stop every other organization from filing.
  const env = makeEnv();
  for (let i = 0; i < 21; i++) post(env, { ...CYCLE, id: `cycle-${i}` }, { c: 'noisy-client' });
  check('another client is not blocked by a throttled one',
    post(env, { ...CYCLE, id: 'other-client-cycle' }, { c: 'quiet-client' }).ok === true);
  check('a submission with no bucket still gets through',
    post(env, { ...CYCLE, id: 'anonymous-cycle-1' }).ok === true);
  check('a nonsense bucket name is sanitized, not an error',
    post(env, { ...CYCLE, id: 'anonymous-cycle-2' }, { c: '../../../etc/passwd' }).ok === true);
}
{
  const env = makeEnv();
  const res = post(env, CYCLE);
  post(env, CYCLE);
  eq('replayed id is a duplicate', post(env, CYCLE).error, 'duplicate');
  eq('and is not written twice', env.rows.length, 2);
  check('the first one did write', res.ok === true);
}
{
  const env = makeEnv();
  const huge = JSON.stringify({ ...CYCLE, notes: 'x'.repeat(120 * 1024) });
  const res = JSON.parse(env.api.doPost({ postData: { contents: huge }, parameter: {} })._text);
  eq('oversized body refused', res.error, 'too-large');
}
{
  // 100k characters of a 4-byte character is 400 KB on the wire. Before the
  // fix this body passed a 100 KB limit because `raw.length` counted UTF-16.
  const env = makeEnv();
  const emoji = JSON.stringify({ ...CYCLE, notes: '\u{1F4A5}'.repeat(30000) });
  const res = JSON.parse(env.api.doPost({ postData: { contents: emoji }, parameter: {} })._text);
  eq('the size limit is measured in bytes', res.error, 'too-large');
  check('and the refusal reports the byte count', res.bytes > 100 * 1024, String(res.bytes));
}

// --- contract -------------------------------------------------------------
section('contract comes from the repo');
{
  const env = makeEnv();
  const c = env.api.loadContract_();
  check('cycle fields read from schema.json', c.cycleFields.includes('participants_completed'));
  eq('record kinds read from simple_forms.json', c.recordKinds, ['session', 'aggregate', 'followup']);
  check('session fields read from simple_forms.json', c.recordFieldsByKind.session.includes('present_count'));
  eq('status enum read from schema.json', c.cycleRules.status.options, ['Planned', 'In Progress', 'Completed']);
  check('funded_by enum read from schema.json',
    c.cycleRules.funded_by.options.includes('Organization funds'));
  check('the facility list is read from facilities.json',
    c.cycleRules.facility.options.includes('San Quentin Rehabilitation Center (SQ)'));
  check('required flags read from schema.json', c.cycleRules.submitter_email.required === true);
  check('required_when read from schema.json',
    JSON.stringify(c.cycleRules.end_date.requiredWhen) === JSON.stringify({ status: ['Completed'] }));
}
{
  const env = makeEnv({ props: { DATA_BASE_URL: 'https://example.org/not-there' } });
  const res = post(env, CYCLE);
  eq('an unreachable contract is an error, not an open door', res.error, 'contract-unavailable');
  eq('nothing written', env.rows.length, 0);
}

// --- doGet ----------------------------------------------------------------
section('doGet (the README curl check)');
{
  const env = makeEnv();
  const out = JSON.parse(env.api.doGet()._text);
  eq('reports ok', out.ok, true);
  eq('names the sheet it writes to', out.sheet, 'submissions');
}
{
  // A brand-new, unbound project used to throw here, so the documented curl
  // check returned an Apps Script error page instead of JSON.
  const env = makeEnv({ unbound: true });
  const out = JSON.parse(env.api.doGet()._text);
  eq('an unbound project still answers with JSON', out.ok, true);
  eq('and says there is no sheet yet', out.sheet, null);
  check('with an explanation of how to fix it', /SHEET_ID/.test(out.note || ''), out.note);
}

const total = pass + failures.length;
console.log(`\n${pass}/${total} checks passed`);
if (failures.length) {
  console.log('failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
