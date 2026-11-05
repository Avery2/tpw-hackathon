// No network and no DATABASE_URL: creates a disposable PostgreSQL cluster with
// TCP listening disabled. Requires local initdb/pg_ctl/psql on PATH, no packages.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const directory = fileURLToPath(new URL('.', import.meta.url));
const sql = readFileSync(join(directory, '001_data_api.sql'), 'utf8');
assert.match(sql, /BEGIN;/);
assert.match(sql, /COMMIT;\s*$/);
assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|SCHEMA|FUNCTION|POLICY)|TRUNCATE\s+(?:TABLE\s+)?public\.|DELETE\s+FROM|UPDATE\s+public\.)/i);
assert.ok(sql.indexOf('pg_advisory_xact_lock(') < sql.indexOf('SELECT * INTO saved'), 'lock precedes retry lookup');
const rules = vm.createContext({});
vm.runInContext(readFileSync(resolve(directory, '../team-form/receiver/Rows.gs'), 'utf8'), rules);
const facilityText = sql.match(/SELECT '(\{[\s\S]+?\})'::jsonb\s*\$fn\$;/)?.[1];
assert.deepEqual(JSON.parse(facilityText), { ...rules.FACILITIES }, 'facility names exactly match Rows.gs');

if (process.argv.includes('--static')) {
  console.log('Static migration contract checks passed (no database started).');
  process.exit(0);
}
const root = mkdtempSync(join(tmpdir(), 'tpw-sql-'));
const data = join(root, 'data');
// Explicitly do not inherit PG*, DATABASE_URL, libpq service files or user psqlrc.
const env = { PATH: process.env.PATH, HOME: root, LC_ALL: 'C', LANG: 'C',
  PGHOST: root, PGPORT: '55493', PGDATABASE: 'postgres', PGUSER: process.env.USER,
  PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' };
let started = false;
function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
function apply(filename) {
  return run('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(directory, filename)]);
}
const queryArgs = statement => ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-c', statement];
function query(statement) { return run('psql', queryArgs(statement)).trim(); }
function concurrentQuery(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', queryArgs(statement), { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => status === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  });
}
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const receiptFrom = output => JSON.parse(output.split('\n').find(line => line.startsWith('{')));
try {
  run('initdb', ['-D', data, '--auth=trust', '--no-locale', '-E', 'UTF8']);
  // No TCP socket, no external/local existing server; only this temporary socket.
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k '${root}' -h '' -p 55493`, '-w', 'start']);
  started = true;
  apply('test-bootstrap.sql');
  apply('001_data_api.sql');
  apply('001_data_api.sql');
  // A fresh session forces PL/pgSQL to compile with the malicious temporary
  // type present. SECURITY DEFINER variable types must still use pg_catalog.
  run('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-c',
    "CREATE DOMAIN pg_temp.text AS pg_catalog.text CHECK(false); SET ROLE authenticated; SELECT set_config('tpw_test.subject','sample-unassigned',false); SELECT public.tpw_context();"]);
  const result = apply('contract.sql');
  console.log(result.split('\n').filter(line => line.includes('Offline Data API')).join('\n'));
  // These checks deliberately COMMIT and use separate sessions. They establish
  // durable receipt recovery and real advisory-lock serialization, not just a
  // static lock-order check or retries inside one rolled-back transaction.
  query("INSERT INTO tpw_private.memberships VALUES ('sample-member-a','test-org-a');");
  const payload = { submissionId: '44444444-4444-4444-8444-444444444444', orgId: 'test-org-a',
    programs: [{ id: 'sample-concurrency', name: 'Sample concurrency course', status: 'In Progress',
      startDate: '2024-01-01', courseHours: 12, sites: [{ facilityCode: 'ASP', yard: 'North', participants: 10, completed: 4 }] }] };
  const submission = answers => "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL tpw_test.subject='sample-member-a'; " +
    `SELECT public.tpw_submit(${literal(JSON.stringify(answers))}::jsonb); SELECT pg_sleep(0.15); COMMIT;`;
  const same = await Promise.allSettled(Array.from({ length: 4 }, () => concurrentQuery(submission(payload))));
  for (const outcome of same) assert.equal(outcome.status, 'fulfilled', outcome.reason?.message);
  const receipt = receiptFrom(same[0].value);
  for (const outcome of same) assert.deepEqual(receiptFrom(outcome.value), receipt, 'concurrent identical attempts return the exact receipt');
  assert.equal(query('SELECT count(*) FROM tpw_private.submission_requests;'), '1');
  assert.equal(query('SELECT count(*) FROM public.submissions;'), '2');
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-m', 'fast', '-w', 'restart']);
  assert.deepEqual(receiptFrom(query(submission(payload))), receipt, 'receipt survives PostgreSQL restart');
  const raceA = { ...payload, submissionId: '55555555-5555-4555-8555-555555555555' };
  const raceB = JSON.parse(JSON.stringify(raceA));
  raceB.programs[0].sites[0].participants = 11;
  const race = await Promise.allSettled([concurrentQuery(submission(raceA)), concurrentQuery(submission(raceB))]);
  assert.equal(race.filter(outcome => outcome.status === 'fulfilled').length, 1, 'only one changed-content racer succeeds');
  assert.match(race.find(outcome => outcome.status === 'rejected').reason.message, /TPW_RETRY_CONFLICT/);
  assert.equal(query('SELECT count(*) FROM tpw_private.submission_requests;'), '2');
  assert.equal(query('SELECT count(*) FROM public.submissions;'), '3');
  console.log('Committed concurrent identical/conflicting retries and restart persistence checks passed.');
  console.log('Migration applied twice successfully in a disposable local PostgreSQL cluster. No external connections.');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
}
