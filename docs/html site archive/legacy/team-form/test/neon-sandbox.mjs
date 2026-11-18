import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
globalThis.sessionStorage = storage; globalThis.localStorage = storage;
globalThis.window = { location: { href: 'https://www.averychan.site/tpw-hackathon/intake/simple.html' }, addEventListener() {}, dispatchEvent() {} };
const config = await import('../../assets/neon-config.js?v=sandbox-1');
const client = await import('../../assets/neon-demo-client.js');
const token = role => 'e30.' + Buffer.from(JSON.stringify({ role, sub: 'anonymous-test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic-signature';
const success = { ok: true, reference: 'SAMPLE123', submissionId: 'SAMPLE123', rows: 1, organization: 'Org 1', signedIn: false };
let calls, rpcResponse, anonymousRole;
beforeEach(() => {
  memory.clear(); calls = []; rpcResponse = Response.json({ ok: true, orgs: [], submissions: [] }); anonymousRole = 'anonymous';
  window.location.href = 'https://www.averychan.site/tpw-hackathon/intake/simple.html';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).endsWith('/token/anonymous') ? Response.json({ token: token(anonymousRole), expires_at: Date.now() + 3600000 }) : rpcResponse.clone();
  };
});
let version = 0;
const fresh = () => import(`../../assets/neon-sandbox-client.js?test=${++version}`);
test('published prototype needs no account, even with an old protected-login preference', () => {
  memory.set(config.NEON_MODE_KEY, 'neon');
  assert.equal(config.isSandboxMode(), true); assert.equal(config.isNeonMode(), false);
  for (const query of ['?backend=sheet', '?backend=neon']) { window.location.href = 'https://www.averychan.site/tpw-hackathon/intake/simple.html' + query; assert.equal(config.isSandboxMode(), false); }
  assert.equal(config.isNeonMode(), true);
  window.location.href = 'http://localhost:8826/team-form/'; memory.clear(); assert.equal(config.isSandboxMode(), false);
  window.location.href += '?backend=demo'; assert.equal(config.isSandboxMode(), true); assert.equal(config.isNeonMode(), false);
});
test('anonymous transport never signs up, signs in, checks a session, uses cookies or stores JWTs', async () => {
  const { sandboxRequest } = await fresh();
  await Promise.all([sandboxRequest('tpw_sandbox_dashboard', {}), sandboxRequest('tpw_sandbox_dashboard', {})]);
  assert.equal(calls.filter(call => call.url.endsWith('/token/anonymous')).length, 1, 'parallel reads share one token request');
  for (const call of calls) { assert.equal(call.options.credentials, 'omit'); assert(!/sign-in|sign-up|get-session/.test(call.url)); assert(!call.options.headers.Cookie); }
  assert(calls.filter(call => call.url.includes('/rpc/')).every(call => call.options.headers.Authorization === 'Bearer ' + token('anonymous')));
  assert.equal(memory.size, 0);
});
test('protected RPCs, arbitrary paths and non-fictional organizations cannot be selected', async () => {
  const { sandboxRequest } = await fresh();
  for (const rpc of ['tpw_submit', 'tpw_dashboard', '../tpw_context', 'constructor', 'https://example.invalid']) await assert.rejects(sandboxRequest(rpc), /prototype/);
  await assert.rejects(sandboxRequest('tpw_sandbox_dashboard', { p_org_id: 'another-organization' }));
  assert.equal(calls.length, 0);
});
test('non-anonymous tokens cannot reach a sandbox RPC', async () => {
  anonymousRole = 'authenticated'; const { sandboxRequest } = await fresh();
  await assert.rejects(sandboxRequest('tpw_sandbox_dashboard'), /prototype/); assert.equal(calls.length, 1);
});
test('a real receipt is required; UUID tracking precedes save and survives unknown outcomes', async () => {
  const { sandboxRequest } = await fresh();
  const payload = { submissionId: 'synthetic-retry', orgId: 'org-1', programs: [] };
  assert.deepEqual(client.memberSubmissionIdentity(), { orgId: 'org-1' });
  client.prepareAttempt(payload, { organization: 'Org 1', programs: [], prisons: [] });
  rpcResponse = Response.json({ message: 'Unknown write outcome' }, { status: 503 });
  await assert.rejects(sandboxRequest('tpw_sandbox_submit', { p_payload: payload }), error => { assert.equal(client.releaseRejectedAttempt(error), false); return true; });
  assert.equal(client.readAttempt().payload.submissionId, payload.submissionId);
  rpcResponse = Response.json(success); client.confirmAttempt(await sandboxRequest('tpw_sandbox_submit', { p_payload: payload }));
  assert.equal(client.readAttempt().receipt.reference, success.reference);
  assert([...memory.keys()].every(key => key.startsWith('tpw.neon.pending.sandbox.v1:')));
});
test('SQL validation releases pending answers, but a conflicting UUID retains them', async () => {
  for (const conflict of [false, true]) {
    const { sandboxRequest } = await fresh(); client.prepareAttempt({ submissionId: 'pending', programs: [] }, {});
    rpcResponse = Response.json({ code: '22023', message: conflict ? 'TPW_RETRY_CONFLICT: synthetic internal detail' : 'synthetic invalid answer' }, { status: 400 });
    await assert.rejects(sandboxRequest('tpw_sandbox_submit', { p_payload: {} }), error => {
      assert.equal(client.releaseRejectedAttempt(error), !conflict); assert(!error.message.includes('internal detail')); return true;
    });
    assert.equal(!!client.readAttempt(), conflict); if (conflict) client.clearAttempt();
  }
});
test('entry bypass and form use anonymous DB transport before any protected or Google path', async () => {
  const form = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../../neon/auth-page.js', import.meta.url), 'utf8');
  const send = form.slice(form.indexOf('async function sendToBackend('), form.indexOf('async function sendToBackend(') + 1300);
  assert(send.indexOf("sandboxRequest('tpw_sandbox_submit'") < send.indexOf('authStateReady()'));
  assert.match(form, /isSandboxMode\(\) \|\| isNeonMode\(\) \|\| !!neonDemoUrl\(\)/);
  assert.match(entry, /if \(!sandboxEntry\) start\(\)/);
  assert.match(entry, /location\.replace\(new URL\('\.\.\/intake\/simple\.html\?backend=demo&account=org-1'/);
});
