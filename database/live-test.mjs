// EXPLICIT LIVE SANDBOX TEST: retained synthetic records, never Google/production.
// Credentials are generated into gitignored work/, chmod 0600; never logged.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { programHistoryCsv } from '../assets/dashboard-exports.js';
export const AUTH = 'https://ep-restless-surf-arinnqli.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
export const API = 'https://ep-restless-surf-arinnqli.apirest.c-4.us-west-2.aws.neon.tech/neondb/rest/v1';
const fixture = new URL('../work/neon-data-api/identities.json', import.meta.url);
const origin = 'http://localhost:8830';
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  let data; try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, headers: response.headers };
}
export async function signIn(user) {
  const login = await jsonFetch(AUTH + '/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email: user.email, password: user.password }) });
  assert.equal(login.status, 200, 'Synthetic sign-in succeeds');
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert(cookie, 'Auth returns a secure session cookie');
  const session = await jsonFetch(AUTH + '/get-session', { headers: { Cookie: cookie, Origin: origin } });
  assert.equal(session.data?.user?.id, user.id, 'Cookie restores the actual identity');
  const token = await jsonFetch(AUTH + '/token', { headers: { Cookie: cookie, Origin: origin } });
  assert.equal(token.status, 200, 'Cookie provides a JWT');
  assert(token.data?.token, 'JWT provided without any service credential');
  return { jwt: token.data.token, cookie, user };
}
export async function api(identity, path, body, method) {
  return jsonFetch(API + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(identity ? { Authorization: 'Bearer ' + identity.jwt } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
export async function loadFixtures() { return JSON.parse(await readFile(fixture, 'utf8')); }
async function prepare() {
  await mkdir(new URL('../work/neon-data-api/', import.meta.url), { recursive: true });
  let users = {}; try { users = await loadFixtures(); } catch {}
  for (const label of ['member-a', 'member-b', 'staff', 'unassigned']) {
    if (users[label]) continue;
    const email = `tpw-api-${label}-${randomUUID().slice(0, 12)}@example.invalid`, password = randomBytes(30).toString('base64url');
    const result = await jsonFetch(AUTH + '/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ name: 'Synthetic API test ' + label, email, password }) });
    assert.equal(result.status, 200, 'Synthetic account is created');
    assert(result.data?.user?.id);
    users[label] = { id: result.data.user.id, email, password };
    // Exclude all tokens, including those returned by sign-up.
    await writeFile(fixture, JSON.stringify(users), { mode: 0o600 }); await chmod(fixture, 0o600);
  }
  console.log('Four synthetic Auth fixtures ready. Run node database/admin.mjs --test-fixtures before testing.');
}
async function run() {
  const users = await loadFixtures(), identities = {};
  for (const [label, user] of Object.entries(users)) identities[label] = await signIn(user);
  const a = identities['member-a'], b = identities['member-b'], staff = identities.staff, unassigned = identities.unassigned;
  for (const [identity, expected, isStaff] of [[a, ['org-1'], false], [b, ['org-2'], false], [staff, null, true], [unassigned, [], false]]) {
    const result = await api(identity, '/rpc/tpw_context', {});
    assert.equal(result.status, 200, 'Authenticated context is readable');
    assert.equal(result.data.userId, identity.user.id); assert.equal(result.data.isStaff, isStaff);
    if (expected) assert.deepEqual(result.data.orgs.map(org => org.id), expected);
    else assert.equal(result.data.orgs.length, 122);
  }
  console.log('PASS actual sign-in, cookie session restoration, JWT, member/staff/unassigned contexts');
  const dashboard = identity => api(identity, '/rpc/tpw_dashboard', { p_org_id: null });
  const before = await dashboard(a);
  assert.equal(before.status, 200); assert(before.data.submissions.every(doc => doc.orgId === 'org-1'));
  const staffData = await dashboard(staff); assert.equal(staffData.status, 200); assert.equal(staffData.data.orgs.length, 122);
  assert(staffData.data.submissions.length > 1000, 'RPC avoids truncating historic records at REST row cap');
  assert.equal((await dashboard(unassigned)).status, 403);
  assert([400, 401, 403].includes((await api(null, '/rpc/tpw_context', {})).status));
  assert([400, 401, 403].includes((await api({ jwt: a.jwt.slice(0, -10) + 'invalidsig' }, '/rpc/tpw_context', {})).status));
  assert.equal((await api(a, '/rpc/tpw_dashboard', { p_org_id: 'org-2' })).status, 403);
  assert.deepEqual((await api(a, '/organizations?select=id,name')).data.map(org => org.id), ['org-1']);
  assert.deepEqual((await api(a, '/submissions?select=id,org_id&org_id=eq.org-2')).data, []);
  assert.equal((await api(a, '/submissions?select=document')).status, 403);
  for (const table of ['memberships', 'staff_users', 'submission_requests']) assert.notEqual((await api(a, '/' + table + '?select=*')).status, 200);
  assert.equal((await api(a, '/submissions', { id: 'unauthorized-test', org_id: 'org-2', document: {} })).status, 403);
  console.log('PASS RLS, raw-document/private-table denial, direct-write denial, anonymous/tampered JWT and cross-organization denial');
  const payload = { submissionId: randomUUID(), orgId: 'org-1', organization: 'Org 1', reportingPeriod: { year: 2001, quarter: 1 }, programs: [{ id: 'synthetic-data-api-' + randomUUID().slice(0, 8), name: 'SYNTHETIC Data API integration test', status: 'Completed', startDate: '2026-10-01', endDate: '2026-10-02', courseHours: 10, notes: 'Synthetic integration test; not member evidence.', sites: [{ facilityCode: 'SQ', yard: 'North', participants: 5, completed: 4 }] }] };
  const submit = (identity, answers) => api(identity, '/rpc/tpw_submit', { p_payload: answers });
  assert.equal((await submit(b, payload)).status, 403);
  assert.equal((await submit(unassigned, payload)).status, 403);
  for (const change of [p => p.programs[0].sites[0].participants = '5', p => p.programs[0].sites[0].completed = 6, p => p.programs[0].sites[0].completed = null, p => p.programs[0].sites[0].yard = '', p => p.programs[0].sites.push({ ...p.programs[0].sites[0], yard: ' north ' }), p => p.programs[0].endDate = '2026-02-30', p => p.programs[0].status = 'invalid', p => p.programs[0].notes = 'x'.repeat(2001)]) {
    const invalid = structuredClone(payload); invalid.submissionId = randomUUID(); change(invalid);
    const rejected = await submit(a, invalid); assert.equal(rejected.status, 400); assert.equal(rejected.data.code, '22023');
  }
  assert.equal((await dashboard(a)).data.submissions.length, before.data.submissions.length, 'Rejected input cannot write');
  const results = await Promise.all(Array.from({ length: 4 }, () => submit(a, payload)));
  for (const result of results) { assert.equal(result.status, 200, `Synthetic save failed: ${result.data?.code || ''} ${String(result.data?.message || '').slice(0, 200)}`); assert.deepEqual(result.data, results[0].data); }
  const conflict = structuredClone(payload); conflict.programs[0].sites[0].participants++;
  const rejected = await submit(a, conflict); assert.equal(rejected.status, 400); assert.match(rejected.data.message, /^TPW_RETRY_CONFLICT:/);
  const reauthenticated = await signIn(users['member-a']);
  assert.deepEqual((await submit(reauthenticated, payload)).data, results[0].data, 'Receipt persists across fresh login/session');
  const after = await dashboard(a); assert.equal(after.data.submissions.length, before.data.submissions.length + 1);
  const saved = after.data.submissions.find(doc => doc.programs.some(program => program.id === payload.programs[0].id));
  assert(saved.synthetic && saved.testData); assert.notEqual(saved.reportingPeriod.year, 2001);
  assert.equal(saved.programs[0].sites[0].participants, 5); assert.equal(saved.programs[0].sites[0].completed, 4);
  assert(!JSON.stringify(after.data).includes('_retry')); assert(!JSON.stringify(after.data).includes('actor_user_id'));
  const csv = programHistoryCsv(after.data.submissions);
  assert(csv.includes('SYNTHETIC Data API integration test')); assert(csv.includes('"5","4"')); assert(!csv.includes('Org 2'));
  const signout = await jsonFetch(AUTH + '/sign-out', { method: 'POST', headers: { Cookie: reauthenticated.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(signout.status, 200);
  const ended = await jsonFetch(AUTH + '/get-session', { headers: { Cookie: reauthenticated.cookie, Origin: origin } });
  assert(!ended.data?.session, 'Sign-out invalidates cookie session (not already-issued JWTs)');
  console.log('PASS validation, concurrent retries, conflict protection, durable receipt, scoped CSV/JSON and sign-out');
  console.log('LIVE SANDBOX PASS: one synthetic submission retained; production/demo-neon/Google unchanged.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.TPW_LIVE_DATA_API_TEST !== '1') throw Error('Set TPW_LIVE_DATA_API_TEST=1 to explicitly allow synthetic Auth/database writes on avery-neon-connection.');
  await (process.argv.includes('--prepare') ? prepare() : run());
}
