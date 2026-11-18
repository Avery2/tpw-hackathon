// No network and no DATABASE_URL: creates a disposable PostgreSQL cluster with
// TCP listening disabled. Requires local initdb/pg_ctl/psql on PATH, no packages.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { databaseEnvironment } from '../server/db.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const sql = readFileSync(join(directory, '001_data_api.sql'), 'utf8');
assert.match(sql, /BEGIN;/);
assert.match(sql, /COMMIT;\s*$/);
assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|SCHEMA|FUNCTION|POLICY)|TRUNCATE\s+(?:TABLE\s+)?public\.|DELETE\s+FROM|UPDATE\s+public\.)/i);
assert.ok(sql.indexOf('pg_advisory_xact_lock(') < sql.indexOf('SELECT * INTO saved'), 'lock precedes retry lookup');
const sandboxSql = readFileSync(join(directory, '002_public_sandbox.sql'), 'utf8');
assert.match(sandboxSql, /BEGIN;/);
assert.match(sandboxSql, /COMMIT;\s*$/);
assert.doesNotMatch(sandboxSql, /\b(?:DROP\s+(?:TABLE|SCHEMA|FUNCTION|POLICY)|TRUNCATE\s+(?:TABLE\s+)?public\.|DELETE\s+FROM|UPDATE\s+public\.)/i);
assert.match(sandboxSql, /enabled boolean NOT NULL DEFAULT false/);
assert.match(sandboxSql, /ON CONFLICT DO NOTHING/);
assert.doesNotMatch(sandboxSql, /SET enabled\s*=\s*true/i, 'migration never implicitly enables public access');
assert.ok(sandboxSql.indexOf("hashtextextended('tpw-public-sandbox-global'") < sandboxSql.indexOf('SELECT * INTO saved'), 'global budget lock precedes retry lookup');
assert.ok(sandboxSql.indexOf('RETURN saved.receipt') < sandboxSql.indexOf("ERRCODE = '54000'"), 'retry recovery precedes quota rejection');
// The refactor must not change auth/membership/org resolution or its error order.
const originalAuth = sql.slice(sql.indexOf("  IF uid IS NULL THEN", sql.indexOf('CREATE OR REPLACE FUNCTION public.tpw_submit')), sql.indexOf('  previous_id :=', sql.indexOf('CREATE OR REPLACE FUNCTION public.tpw_submit')));
const rootStart = originalAuth.indexOf("  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'");
const originalRoot = originalAuth.slice(rootStart, originalAuth.indexOf('  supplied_id :='));
const expectedAuth = originalAuth.replace(originalRoot, '  request_uuid := tpw_private.submission_request_id(p_payload);\n');
const wrapperStart = sandboxSql.indexOf('CREATE OR REPLACE FUNCTION public.tpw_submit');
const actualAuth = sandboxSql.slice(sandboxSql.indexOf('  IF uid IS NULL THEN', wrapperStart), sandboxSql.indexOf('  RETURN tpw_private.save_submission', wrapperStart));
assert.equal(actualAuth, expectedAuth, 'auth wrapper retains exact existing auth/membership/org resolution');
assert.ok(sandboxSql.includes(originalRoot), 'root validation unchanged in shared helper');
assert.equal((sandboxSql.match(/FOR p IN SELECT value FROM jsonb_array_elements/g) || []).length, 1, 'one active canonical program validator');
// Execute admin command construction with mocked child processes: no CLI/network.
const adminSource = readFileSync(join(directory, 'admin.mjs'), 'utf8').replace(/^import .*;\n/gm, '');
function adminCommand(flag, host = 'ep-restless-surf-arinnqli.c-4.us-west-2.aws.neon.tech') {
  const calls = [], refreshes = []; const fakeProcess = { argv: ['node','admin.mjs',flag], env: { PATH: '/offline' }, exit() { throw Error('unexpected exit'); } };
  vm.runInNewContext(adminSource.replaceAll('import.meta.url', JSON.stringify(new URL('./admin.mjs', import.meta.url).href)), {
    URL, process: fakeProcess, console: { log() {}, error() {} }, readFileSync, databaseEnvironment,
    literal() { throw Error('not needed'); },
    execFileSync(command, args) {
      assert.equal(command, 'neon');
      if (args[0] === 'data-api') {
        assert.deepEqual(Array.from(args), ['data-api','refresh-schema','--project-id','twilight-bread-18135398','--branch','avery-neon-connection','--database','neondb']);
        refreshes.push(Array.from(args)); return '';
      }
      assert.deepEqual(Array.from(args), ['connection-string','avery-neon-connection','--project-id','twilight-bread-18135398','--database-name','neondb','--role-name','neondb_owner']);
      return `postgresql://neondb_owner:offline-only@${host}/neondb?sslmode=require`;
    },
    spawnSync(command, args, options) { assert.equal(command,'psql'); calls.push(options); return { status: 0 }; }
  });
  return { calls, refreshes, failed: fakeProcess.exitCode };
}
const applied = adminCommand('--apply');
assert.equal(applied.calls[0].input, sql + '\n' + sandboxSql, 'apply installs 001 then 002 without enabling');
const publicApplied = adminCommand('--apply-sandbox');
assert.equal(publicApplied.calls[0].input, sandboxSql.replace(/COMMIT;\s*$/, 'UPDATE tpw_private.sandbox_settings SET enabled = true WHERE singleton;\nCOMMIT;\n'), 'sandbox command installs only 002 and atomically enables');
assert.match(adminCommand('--disable-sandbox').calls[0].input, /^BEGIN; UPDATE tpw_private\.sandbox_settings SET enabled = false WHERE singleton; COMMIT;$/);
assert.equal(applied.refreshes.length, 1, 'managed schema snapshot refreshes after migration commit');
assert.equal(publicApplied.refreshes.length, 1, 'public sandbox install refresh is branch pinned');
assert.equal(adminCommand('--disable-sandbox').refreshes.length, 0, 'data-only gate does not rebuild schema');
const wrongHost = adminCommand('--apply-sandbox','wrong-branch.invalid');
assert.equal(wrongHost.calls.length,0,'wrong host never reaches psql');
assert.equal(wrongHost.failed,1);
assert.equal(wrongHost.refreshes.length, 0, 'wrong host never refreshes any service');
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
  apply('002_public_sandbox.sql');
  apply('002_public_sandbox.sql');
  assert.equal(query('SELECT enabled FROM tpw_private.sandbox_settings;'), 'f', 'fresh and rerun migrations fail closed');
  query('UPDATE tpw_private.sandbox_settings SET enabled=true WHERE singleton;');
  apply('002_public_sandbox.sql');
  assert.equal(query('SELECT enabled FROM tpw_private.sandbox_settings;'), 't', 'rerun preserves explicit enabled state');
  query('UPDATE tpw_private.sandbox_settings SET enabled=false WHERE singleton;');
  apply('002_public_sandbox.sql');
  assert.equal(query('SELECT enabled FROM tpw_private.sandbox_settings;'), 'f', 'rerun preserves explicit disabled state');
  // A fresh session forces PL/pgSQL to compile with the malicious temporary
  // type present. SECURITY DEFINER variable types must still use pg_catalog.
  run('psql', ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-c',
    "CREATE DOMAIN pg_temp.text AS pg_catalog.text CHECK(false); SET ROLE authenticated; SELECT set_config('tpw_test.subject','sample-unassigned',false); SELECT public.tpw_context();"]);
  const result = apply('contract.sql');
  console.log(result.split('\n').filter(line => line.includes('Offline Data API')).join('\n'));
  console.log(apply('public-contract.sql').split('\n').filter(line => line.includes('Offline public sandbox')).join('\n'));
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
  // Account-free guest retries also survive separate sessions and restart.
  query("INSERT INTO public.organizations(id,name) VALUES ('org-1','Org 1'),('org-2','Org 2'); UPDATE tpw_private.sandbox_settings SET enabled=true WHERE singleton;");
  const guestPayload = { ...payload, orgId: 'org-1', submissionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const guestSubmission = answers => 'BEGIN; SET LOCAL ROLE anonymous; ' +
    `SELECT public.tpw_sandbox_submit(${literal(JSON.stringify(answers))}::jsonb); SELECT pg_sleep(0.05); COMMIT;`;
  const guestSame = await Promise.allSettled(Array.from({ length: 4 }, () => concurrentQuery(guestSubmission(guestPayload))));
  for (const outcome of guestSame) assert.equal(outcome.status,'fulfilled',outcome.reason?.message);
  const guestReceipt = receiptFrom(guestSame[0].value);
  for (const outcome of guestSame) assert.deepEqual(receiptFrom(outcome.value),guestReceipt);
  assert.equal(guestReceipt.signedIn,false);
  assert.equal(query("SELECT count(*) FROM tpw_private.submission_requests WHERE actor_user_id='public-sandbox';"),'1');
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-m', 'fast', '-w', 'restart']);
  assert.deepEqual(receiptFrom(query(guestSubmission(guestPayload))),guestReceipt,'guest durable receipt survives restart');
  // Across different orgs and request UUIDs, only the last available GLOBAL
  // minute-budget slot can commit. JWT subjects and per-org locks cannot evade it.
  query("INSERT INTO tpw_private.submission_requests(org_id,request_id,hash,submission_id,receipt,actor_user_id) SELECT 'org-2',md5('sample-global-'||n)::uuid,'sample-hash',(SELECT id FROM public.submissions WHERE org_id='org-1' LIMIT 1),'{}','public-sandbox' FROM generate_series(1,28) n;");
  const budgetRace = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => concurrentQuery(guestSubmission({ ...guestPayload, orgId: i % 2 ? 'org-1' : 'org-2', submissionId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}` }))));
  assert.equal(budgetRace.filter(outcome=>outcome.status==='fulfilled').length,1,'global minute cap serializes across orgs');
  for (const outcome of budgetRace.filter(outcome=>outcome.status==='rejected')) assert.match(outcome.reason.message,/sample workspace is busy/);
  assert.equal(query("SELECT count(*) FROM tpw_private.submission_requests WHERE actor_user_id='public-sandbox';"),'30');
  assert.deepEqual(receiptFrom(query(guestSubmission(guestPayload))),guestReceipt,'identical committed retry recovers while quota full');
  console.log('Public guest concurrent retries, restart recovery and global cross-org quota serialization checks passed.');
  console.log('Both migrations applied repeatedly in a disposable local PostgreSQL cluster. No external connections.');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
}
