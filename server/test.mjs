import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { databaseEnvironment, literal, createDatabase, createQuery } from './db.mjs';
import { prepare, currentPeriod, scope, resolveOrganization, publicDocument } from './model.mjs';
import { csvCell, csvExport, EXPORT_HEADER } from './export.mjs';
import { createDemoServer, publicPath } from './app.mjs';

const orgs = [{ id: 'org-1', name: 'Org 1', profile: { email: 'removed', synthetic: true } }, { id: 'org-2', name: 'Org 2', profile: {} }];
const time = new Date('2026-10-27T12:00:00Z');
const payload = () => ({
  submissionId: '12345678-1234-4123-8123-123456789abc', orgId: 'org-1', organization: 'Org 1',
  reportingPeriod: { year: 2026, quarter: 4 }, schemaVersion: 8, token: 'discard', email: 'discard', arbitrary: 'discard',
  programs: [{ id: 'program-a', name: "Practice \\ O'Brien", status: 'In Progress', startDate: '2026-09-01', endDate: '', courseHours: 12,
    notes: ' =this is literal context ', secret: 'discard', sites: [
      { facilityCode: 'ASP', yard: 'A', participants: 8, completed: 4, token: 'discard' },
      { facilityCode: 'ASP', yard: 'B', participants: 6, completed: 2 }
    ] }]
});
const env = { TPW_DEMO_SERVER: '1', NEON_EXPECTED_HOST: 'example.invalid', DATABASE_URL: 'postgresql://demo:private@example.invalid/demo?sslmode=require', PATH: '/usr/bin' };

function fakeDb() {
  const records = new Map(); let writes = 0;
  return {
    recordsMap: records,
    organizations: async () => structuredClone(orgs),
    records: async ids => [...records.values()].filter(r => ids.includes(r.orgId)),
    save: async (id, orgId, document, receivedAt) => { writes++; if (!records.has(id)) records.set(id, { id, orgId, document: structuredClone(document), receivedAt }); return structuredClone(records.get(id)); },
    health: async () => ({ organizations: 2, submissions: records.size }),
    get writes() { return writes; }
  };
}
async function setup(t, db = fakeDb(), root) {
  const server = createDemoServer({ db, now: () => time, ...(root ? { root } : {}) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const port = server.address().port;
  const call = (url, options = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: url, method: options.method || 'GET', headers: options.headers || {} }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject); req.end(options.body);
  });
  const post = (p = payload(), token = 'demo:org-1') => call('/api/', { method: 'POST', body: JSON.stringify({ token, payload: p }) });
  return { db, port, call, post };
}

test('config fails closed and never carries ambient PG variables or URL options', () => {
  const pg = databaseEnvironment({ ...env, PGHOSTADDR: 'evil', PGOPTIONS: 'evil' });
  assert.equal(pg.PGHOST, 'example.invalid'); assert.equal(pg.PGSSLMODE, 'require');
  assert.equal(pg.PGPASSWORD, 'private'); assert.equal(pg.PGHOSTADDR, undefined);
  for (const change of [{ TPW_DEMO_SERVER: '' }, { NEON_EXPECTED_HOST: '' }, { NEON_EXPECTED_HOST: 'other.invalid' },
    { DATABASE_URL: env.DATABASE_URL.replace('require', 'disable') }, { DATABASE_URL: env.DATABASE_URL + '&host=other.invalid' },
    { DATABASE_URL: 'postgresql://demo:private@example.invalid/host%3Devil' }]) assert.throws(() => databaseEnvironment({ ...env, ...change }));
});

test('SQL literals and atomic durable idempotency SQL are escaped and fixed', async () => {
  assert.equal(literal("a'\\\nb"), "E'a''\\\\\nb'");
  assert.equal(literal("\\'; DROP TABLE organizations; --"), "E'\\\\''; DROP TABLE organizations; --'");
  assert.throws(() => literal('x\0y'));
  const queries = []; const db = createDatabase(async sql => { queries.push(sql); return {}; });
  await db.save('id', 'org-1', { note: "'\\" }, time.toISOString()); await db.records(["org-'1"]);
  assert.match(queries[0], /ON CONFLICT \(id\) DO UPDATE SET id = existing.id\s+RETURNING/);
  assert.doesNotMatch(queries[0], /SET document/); assert.match(queries[1], /WHERE org_id IN \(E'org-''1'\)/);
});

test('psql uses PG env and stdin, no rc, no shell, finite timeouts, sanitized failure', async () => {
  let observed;
  const spawnFake = (command, args, options) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    observed = { command, args, options, sql: '' };
    child.stdin.on('data', data => observed.sql += data);
    child.stdin.on('finish', () => { child.stdout.write('{"ok":true}'); child.emit('close', 0); }); return child;
  };
  assert.deepEqual(await createQuery(env, spawnFake)('SELECT 1;'), { ok: true });
  assert.equal(observed.command, 'psql'); assert.ok(observed.args.includes('-X')); assert.ok(observed.args.includes('ON_ERROR_STOP=1'));
  assert.ok(!observed.args.some(s => s.includes('private') || s.includes('postgresql://')));
  assert.equal(observed.options.shell, false); assert.equal(observed.options.env.DATABASE_URL, undefined);
  assert.match(observed.sql, /SET LOCAL standard_conforming_strings = on/); assert.match(observed.sql, /statement_timeout = 8000/);
  const failure = (...args) => { const c = spawnFake(...args); c.stdin.removeAllListeners('finish'); c.stdin.on('finish', () => { c.stderr.write('private credential here'); c.emit('close', 1); }); return c; };
  await assert.rejects(createQuery(env, failure)('SELECT 1;'), error => error.message === 'Database unavailable.');
});

test('canonical field mapping, current-quarter rules, private allowlist and stable retry hashes', () => {
  const first = prepare(payload(), orgs[0], time);
  const doc = first.document, program = doc.programs[0];
  assert.equal(program.participants, 14); assert.equal(program.participantsCompleted, 6); assert.equal(program.sites[1].completed, 2);
  assert.deepEqual(program.assignments, [{ code: 'ASP', yards: ['A', 'B'] }]); assert.equal(doc.prisons[0].name, 'Avenal State Prison (ASP)');
  assert.equal(doc.reportingPeriod.quarter, 4); assert.equal(program.notes, '=this is literal context');
  assert.equal(doc.synthetic, true); assert.equal(doc.testData, true); assert.equal(doc.source, 'neon-local-demo');
  assert.equal(first.receipt.rows, 2); assert.equal(first.id.length, 74); assert.equal(doc.id.length, 64);
  const nextQuarter = payload(); nextQuarter.submissionId = 'abcdef12-1234-4123-8123-123456789abc'; nextQuarter.previousSubmissionId = doc.id;
  assert.equal(prepare(nextQuarter, orgs[0], time).document.previousSubmissionId, doc.id);
  assert.doesNotMatch(JSON.stringify(doc), /discard/);
  const retry = prepare(payload(), orgs[0], new Date('2027-01-02T12:00:00Z'));
  assert.equal(retry.id, first.id); assert.equal(retry.hash, first.hash);
  const changed = payload(); changed.programs[0].sites[0].participants++;
  assert.notEqual(prepare(changed, orgs[0], time).hash, first.hash);
  assert.deepEqual(currentPeriod(new Date('2027-01-01T01:00:00Z')), { year: 2026, quarter: 4 });
  for (const mutate of [p => p.submissionId = 'bad', p => p.programs[0].status = 'Planned', p => p.programs[0].notes = 1,
    p => p.programs[0].notes = 'x'.repeat(2001), p => p.programs[0].sites[0].completed = 90, p => p.programs[0].sites[0].facilityCode = 'bad',
    p => p.programs[0].startDate = '2026-02-30']) { const p = payload(); mutate(p); assert.throws(() => prepare(p, orgs[0], time)); }
});

test('organization identity cannot be broadened by name or forged document', () => {
  assert.deepEqual(scope(orgs, 'org-1', new URLSearchParams('org=org-2&name=Org+1')), []);
  assert.throws(() => resolveOrganization(orgs, 'org-1', { orgId: 'org-2', organization: 'Org 1' }));
  assert.throws(() => resolveOrganization(orgs, 'org-1', { orgId: 'org-1', organization: 'Org 2' }));
  assert.equal(resolveOrganization(orgs, 'tpw', { organization: 'org 2' }).id, 'org-2');
  assert.throws(() => resolveOrganization([...orgs, { id: 'duplicate', name: 'ORG 2' }], 'tpw', { organization: 'Org 2' }));
  assert.throws(() => resolveOrganization(orgs, 'tpw', { organization: 'new' }));
  assert.deepEqual(publicDocument({ _retry: {}, email: 'x', programs: [{ token: 'x', notes: 'kept' }] }), { programs: [{ notes: 'kept' }] });
});

test('CSV RFC quotes, formula and control defenses preserve actual negative numeric cells', () => {
  assert.equal(csvCell('a,"b\nc'), '"a,""b\nc"');
  for (const value of ['=1+1', '  =1+1', '\t@bad', '\r\n+bad', '-5', '\tplain', '\u0001plain']) assert.ok(csvCell(value).startsWith('"\''), value);
  assert.equal(csvCell(-5), '"-5"'); assert.equal(csvCell(0), '"0"');
  const doc = prepare(payload(), orgs[0], time).document;
  const detailed = csvExport([doc]); assert.match(detailed, /"8","4"/); assert.match(detailed, /Per-yard counts reported/);
  delete doc.programs[0].sites;
  const historical = csvExport([doc]);
  assert.match(historical, /WARNING: per-yard counts unavailable/); assert.doesNotMatch(historical, /"14"/); assert.doesNotMatch(historical, /"6"/);
  assert.equal(EXPORT_HEADER.length, 23); assert.ok(historical.startsWith('\uFEFF"CDCR Facility"'));
});

test('HTTP read/write/export/health scoped and retry durable with no tokens', async t => {
  const { db, call, post } = await setup(t);
  let result = await post(); assert.equal(result.status, 200); const receipt = result.json(); assert.equal(receipt.rows, 2);
  result = await post(); assert.deepEqual(result.json(), receipt); assert.equal(db.recordsMap.size, 1);
  const change = payload(); change.programs[0].courseHours = 15; assert.equal((await post(change)).status, 409);
  assert.equal((await post(payload(), 'demo:org-2')).status, 403);
  const p2 = payload(); p2.orgId = 'org-2'; p2.organization = 'Org 2'; assert.equal((await post(p2, 'demo:tpw')).status, 200);
  assert.equal(db.recordsMap.size, 2); // same browser UUID in another org is independent
  const own = (await call('/api/?view=dashboard&account=org-1')).json(); assert.equal(own.submissions.length, 1); assert.equal(own.orgs.length, 1);
  assert.equal(own.submissions[0].orgId, 'org-1'); assert.doesNotMatch(JSON.stringify(own), /_retry|discard|email/);
  assert.equal((await call('/api/?view=dashboard&account=tpw')).json().submissions.length, 2);
  assert.equal((await call('/api/?view=dashboard&account=org-1&org=org-2&name=Org+1')).json().submissions.length, 0);
  assert.equal((await call('/api/health?account=org-1')).status, 403);
  assert.deepEqual((await call('/api/health?account=tpw')).json().counts, { organizations: 2, submissions: 2 });
  for (const format of ['json', 'csv']) {
    const response = await call('/api/export?account=org-1&format=' + format); assert.equal(response.status, 200);
    assert.match(response.headers['content-disposition'], /history/); assert.doesNotMatch(response.text, /Org 2|_retry|email/);
  }
  const json = (await call('/api/export?account=org-1&format=json')).json(); assert.equal(json.submissions[0].programs[0].sites.length, 2);
  assert.match(json.coverage, /history/); assert.equal((await call('/api/export?account=tpw&format=bad')).status, 400);
  assert.equal((await call('/api/?account=org-1')).json().features.programNotes, true);
  assert.equal((await call('/api/')).status, 403); assert.equal((await call('/api/?account=unknown')).status, 403);
  assert.equal((await post(payload(), '')).status, 403);
});

test('HTTP receipts survive server restart and concurrent duplicate retries; forged document scope never wins', async t => {
  const db = fakeDb();
  const first = await setup(t, db); const receipt = (await first.post()).json();
  const restarted = await setup(t, db);
  const replies = await Promise.all([restarted.post(), restarted.post(), restarted.post()]);
  for (const response of replies) assert.deepEqual(response.json(), receipt);
  assert.equal(db.recordsMap.size, 1);
  // An adversarial DB adapter returning extra rows still cannot broaden the response.
  db.records = async () => [...db.recordsMap.values(), { id: 'forged', orgId: 'org-2', receivedAt: time.toISOString(), document: { orgId: 'org-1', organization: 'Org 1', programs: [] } }];
  const result = (await restarted.call('/api/?account=org-1&view=dashboard')).json();
  assert.equal(result.submissions.length, 1);
  db.save = async () => { throw new Error('private SQL diagnostic'); };
  const failed = await restarted.post(); assert.equal(failed.status, 503); assert.doesNotMatch(failed.text, /private SQL/);
});

test('HTTP security: bad host/origin/fetch-site, raw traversal and private paths, size limits', async t => {
  const { call, port } = await setup(t);
  for (const headers of [{ Host: 'evil.invalid' }, { Host: 'localhost:9999' }, { Origin: 'https://evil.invalid' },
    { Origin: `http://localhost:${port}` }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) assert.equal((await call('/api/?account=tpw', { headers })).status, 403);
  assert.equal((await call('/api/?account=tpw', { headers: { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  for (const url of ['/work/private.json', '/server/db.mjs', '/.git/config', '/.env', '/docs/technical-guide.md', '/assets/../server/db.mjs', '/assets/%2e%2e/server/db.mjs', '/team-form/receiver/Rows.gs', '/team-form/test/browser.mjs', '/assets/%5c..%5c.env']) assert.ok((await call(url)).status >= 400, url);
  assert.equal((await call('/api/', { method: 'POST', body: 'x'.repeat(250001) })).status, 413);
  assert.equal((await call('/api/', { method: 'POST', headers: { 'Transfer-Encoding': 'chunked' }, body: 'x'.repeat(250001) })).status, 413);
  assert.equal((await call('/assets/%ZZ')).status, 400);
  assert.equal((await call('/api/', { method: 'POST', body: '{' })).status, 400);
  const backend = await call('/team-form/backend.js'); assert.equal(backend.status, 200); assert.match(backend.text, /TPW_NEON_DEMO = true/); assert.doesNotMatch(backend.text, /google|postgres|private/);
  assert.equal((await call('/team-form/index.html')).status, 200);
  for (const asset of ['/team-dashboard/workspace.css', '/team-dashboard/loading.css']) assert.equal((await call(asset)).status, 200, asset);
  const dataPage = await call('/team-dashboard/raw-data.html');
  assert.equal(dataPage.status, 200);
  assert.match(dataPage.text, /local demo reads Neon/);
  assert.doesNotMatch(dataPage.text, /<iframe|docs\.google\.com/);
  assert.throws(() => publicPath('/assets/.env.json'));
});

test('static leaf and directory symlinks are denied', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tpw-demo-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets')); await mkdir(path.join(root, 'private')); await writeFile(path.join(root, 'private', 'secret.js'), 'secret');
  await symlink(path.join(root, 'private', 'secret.js'), path.join(root, 'assets', 'leaf.js'));
  await symlink(path.join(root, 'private'), path.join(root, 'assets', 'directory'));
  const { call } = await setup(t, fakeDb(), root);
  assert.equal((await call('/assets/leaf.js')).status, 403); assert.equal((await call('/assets/directory/secret.js')).status, 403);
});

test('DB failure is explicit, has no sample fallback or diagnostic leak', async t => {
  const db = fakeDb(); db.organizations = async () => { throw new Error('postgresql://private-secret'); };
  const { call, post } = await setup(t, db);
  for (const response of [await call('/api/?account=tpw&view=dashboard'), await call('/api/export?account=org-1&format=json'), await post()]) {
    assert.equal(response.status, 503); assert.equal(response.json().ok, false); assert.match(response.text, /No fallback/); assert.doesNotMatch(response.text, /private-secret/);
  }
});
