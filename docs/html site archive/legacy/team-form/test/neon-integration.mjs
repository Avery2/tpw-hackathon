// Frontend integration contracts only. Fake transports: no cookies, tokens, or service calls.
//   node --test team-form/test/neon-integration.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const sourceUrl = new URL('../../assets/dashboard-source.js', import.meta.url);
const sessionUrl = new URL('../../assets/member-session.js', import.meta.url);
const form = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const authMock = moduleUrl(`
export const isNeonMode = () => globalThis.__integration.mode;
export const getCachedContext = () => globalThis.__integration.context;
export const authStateReady = async () => { const s = globalThis.__integration; s.ready++; if (s.authError) throw s.authError; return s.context; };
export const dataApiRequest = (...args) => globalThis.__integration.rpc(...args);
`);
const demoMock = moduleUrl(`
export const neonDemoUrl = () => null;
export const neonRequest = () => { throw new Error('Unexpected local demo call'); };
export const mountDemoExports = () => { throw new Error('Unexpected demo export'); };
`);
const exportsMock = moduleUrl(`export const mountDashboardExports = (...args) => globalThis.__integration.mounts.push(args);`);
const configMock = moduleUrl(`export const isSandboxMode = () => globalThis.__integration.sandbox;`);
const sandboxMock = moduleUrl(`export const sandboxRequest = (...args) => globalThis.__integration.guestRPC(...args);`);
async function isolatedModule(url) {
  let source = await fs.readFile(url, 'utf8');
  source = source.replace(/(['"])\.\/neon-config\.js\?[^'"]+\1/g, JSON.stringify(configMock))
    .replace(/(['"])\.\/neon-sandbox-client\.js\?[^'"]+\1/g, JSON.stringify(sandboxMock))
    .replace(/(['"])\.\/neon-auth-client\.js\?[^'"]+\1/g, JSON.stringify(authMock))
    .replace(/(['"])\.\/neon-demo-client\.js\?[^'"]+\1/g, JSON.stringify(demoMock))
    .replace(/(['"])\.\/dashboard-exports\.js\?[^'"]+\1/g, JSON.stringify(exportsMock))
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  return import(moduleUrl(source));
}
const values = new Map();
globalThis.sessionStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
globalThis.window = { TPW_BACKEND_URL: 'https://script.google.com/macros/s/TEST/exec', addEventListener() {} };
const { loadDashboard } = await isolatedModule(sourceUrl);
const session = await isolatedModule(sessionUrl);
const org = { id: 'org-1', name: 'Verified Organization' };
const generic = { id: 'organization-uuid', name: 'Another Verified Organization' };
const submission = { id: 'receipt', orgId: org.id, organization: org.name, programs: [] };
let state;
beforeEach(() => {
  values.clear();
  state = globalThis.__integration = {
    sandbox: false, mode: true, context: { ok: true, userId: 'user-a', isStaff: false, orgs: [org], accountKey: org.id },
    mounts: [], calls: [], ready: 0,
    rpc: async (...args) => { state.calls.push(args); return { ok: true, orgs: [org], submissions: [submission] }; }
  };
  globalThis.fetch = async () => { throw new Error('Unexpected network call: Sheets/sample must not be fetched in Neon mode'); };
});

test('Neon opts in before Sheets, local demos, and sample merging; uses RPC parameters and mounts after response', async () => {
  const data = await loadDashboard(org.id);
  assert.equal(state.ready, 1);
  assert.deepEqual(state.calls, [['tpw_dashboard', { p_org_id: org.id }]]);
  assert.deepEqual(data.orgs, [org]);
  assert.equal(data.submissions.length, 1);
  assert.equal(data.submissions[0].synthetic, false);
  assert.deepEqual(state.mounts, [[data, org.id]]);
});

test('members cannot turn a URL/demo label into another organization or staff identity', async () => {
  values.set('tpw.member.demo.v1', 'tpw');
  assert.equal(session.setDemoAccount('tpw'), false);
  assert.equal(session.getDemoAccount(), org.id);
  assert.equal(session.accountProfile('tpw'), null);
  await assert.rejects(loadDashboard('org-2'), /cannot view/);
  assert.deepEqual(state.calls, []);
});

test('staff can load all organizations or narrow a generic ID without sample profiles', async () => {
  state.context = { ok: true, userId: 'staff-a', isStaff: true, orgs: [generic], accountKey: 'tpw' };
  state.rpc = async (...args) => { state.calls.push(args); return { ok: true, orgs: [generic], submissions: [] }; };
  assert.deepEqual((await loadDashboard(null)).orgs, [generic]);
  assert.equal((await loadDashboard(generic.id)).org.id, generic.id);
  assert.deepEqual(state.calls.map(call => call[1]), [{ p_org_id: null }, { p_org_id: generic.id }]);
  assert.equal(session.accountProfile(generic.id).name, generic.name);
  assert.ok(!session.memberMenu('tpw').some(item => item.label === 'Annual report'));
});

test('unassigned and expired auth fail closed without Sheets or demo fallback', async () => {
  state.context = { ok: true, userId: 'unassigned', isStaff: false, orgs: [], accountKey: null };
  await assert.rejects(loadDashboard(null), /assigned organization/);
  state.authError = new Error('Sign in again');
  await assert.rejects(loadDashboard(null), /Sign in again/);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.mounts, []);
});

test('RPC failures fail closed, and out-of-scope rows cannot enter the rendered/exported dataset', async () => {
  state.rpc = async () => { throw new Error('API unavailable'); };
  await assert.rejects(loadDashboard(null), /API unavailable/);
  state.rpc = async () => ({ ok: true, orgs: [org, generic], submissions: [submission, { ...submission, orgId: generic.id }] });
  const data = await loadDashboard(null);
  assert.deepEqual(data.orgs, [org]);
  assert.equal(data.submissions.length, 1);
});

test('a stale response cannot replace newer export buttons, or export after account changes', async () => {
  const resolve = [];
  state.rpc = () => new Promise(done => resolve.push(done));
  const first = loadDashboard(org.id); await Promise.resolve();
  const second = loadDashboard(org.id); await Promise.resolve();
  resolve[1]({ ok: true, orgs: [org], submissions: [] }); await second;
  resolve[0]({ ok: true, orgs: [org], submissions: [submission] }); await first;
  assert.equal(state.mounts.length, 1);
  assert.equal(state.mounts[0][0].submissions.length, 0);
  const pending = loadDashboard(org.id); await Promise.resolve();
  state.context = { ...state.context, userId: 'user-b' };
  resolve[2]({ ok: true, orgs: [org], submissions: [submission] });
  await assert.rejects(pending, /account changed/);
});

test('default Sheets route retains sample merge and demo account behavior', async () => {
  state.mode = false;
  session.clearDemoAccount();
  assert.equal(session.setDemoAccount('org-2'), true);
  assert.equal(session.getDemoAccount(), 'org-2');
  const calls = [];
  globalThis.fetch = async url => {
    const address = new URL(url); calls.push(address);
    if (address.protocol === 'file:') return new Response(await fs.readFile(address));
    return new Response(JSON.stringify({ ok: true, orgs: [], submissions: [submission] }));
  };
  const data = await loadDashboard(null);
  assert.equal(state.ready, 0);
  assert.equal(state.calls.length, 0);
  assert.ok(data.submissions.some(record => record.synthetic));
  assert.ok(calls.some(url => url.hostname === 'script.google.com'));
  assert.ok(calls.some(url => url.pathname.endsWith('dashboard-sample.json')));
});

function formSend(context, authReady, rpc, mode = true, sandbox = false) {
  const source = form.slice(form.indexOf('async function sendToBackend(payload) {'), form.indexOf('\nif (backendUrl())'));
  return new Function('isSandboxMode', 'sandboxRequest', 'isNeonMode', 'neonContext', 'authStateReady', 'dataApiRequest', 'neonDemoUrl', 'neonRequest', 'window', 'boundedFetch', 'backendUrl', `return (${source});`)(
    () => sandbox, (...args) => state.guestRPC(...args), () => mode, context, authReady, rpc,
    () => null, () => { throw new Error('Unexpected demo request'); }, {},
    () => { throw new Error('Unexpected Google request/capability check'); }, () => window.TPW_BACKEND_URL
  );
}

test('form sends the existing payload directly to tpw_submit, without Google capability requests even for notes', async () => {
  const payload = { programs: [{ notes: 'Curriculum details' }] };
  const receipt = { ok: true, submissionId: 'receipt' };
  const calls = [];
  const send = formSend(state.context, async () => state.context, async (...args) => { calls.push(args); return receipt; });
  assert.equal(await send(payload), receipt);
  assert.deepEqual(calls, [['tpw_submit', { p_payload: payload }]]);
});

test('form auth failure/account switch rejects before sending and leaves retry handling to the pending-attempt flow', async () => {
  const unexpected = async () => { throw new Error('Unexpected submission'); };
  const send = formSend(state.context, async () => { throw new Error('Sign in again'); }, unexpected);
  await assert.rejects(send({ programs: [] }), /Sign in again/);
  const switched = formSend(state.context, async () => ({ ...state.context, userId: 'user-b' }), unexpected);
  await assert.rejects(switched({ programs: [] }), /account changed/);
  assert.match(form, /neonSubmissionMode\(\)[\s\S]*prepareAttempt\(toPayload/);
  assert.match(form, /if \(isNeonMode\(\)\) return 'neon-data-api'/);
  assert.match(form, /Identity is independent of historical data and \?blank=1/);
});

test('account-free dashboard uses only fictional synthetic DB rows and never calls protected auth or Sheets', async () => {
  state.sandbox = true; state.mode = false; session.clearDemoAccount();
  state.guestRPC = async (...args) => { state.calls.push(args); return { ok: true,
    orgs: [{ id: 'org-1', name: 'Org 1' }, { id: 'other', name: 'Excluded' }],
    submissions: [{ id: 'sample', orgId: 'org-1', synthetic: true }, { id: 'not-synthetic', orgId: 'org-1' }, { id: 'other-org', orgId: 'other', synthetic: true }] }; };
  const data = await loadDashboard('org-1');
  assert.equal(state.ready, 0); assert.deepEqual(state.calls, [['tpw_sandbox_dashboard', { p_org_id: 'org-1' }]]);
  assert.deepEqual(data.submissions.map(doc => doc.id), ['sample']); assert.deepEqual(state.mounts, [[data, 'org-1']]);
  assert.equal(session.getDemoAccount(), 'org-1', 'A fresh prototype visitor needs no identity setup');
  await assert.rejects(loadDashboard('other'), /Org 1 or Org 2/);
});

test('account-free form saves directly to DB, including notes, without any session or Google request', async () => {
  const receipt = { ok: true, reference: 'sample-receipt', signedIn: false }, calls = [];
  state.guestRPC = async (...args) => { calls.push(args); return receipt; };
  const unexpected = async () => { throw Error('Auth must not run'); };
  const payload = { programs: [{ notes: 'Synthetic program context' }] };
  const send = formSend(null, unexpected, unexpected, false, true);
  assert.equal(await send(payload), receipt);
  assert.deepEqual(calls, [['tpw_sandbox_submit', { p_payload: payload }]]);
});
