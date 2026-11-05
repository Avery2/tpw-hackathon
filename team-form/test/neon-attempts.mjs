import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const session = new Map(), persistent = new Map();
const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
globalThis.sessionStorage = storage(session); globalThis.localStorage = storage(persistent);
globalThis.window = { location: { href: 'https://example.test/team-form/?backend=neon' }, addEventListener() {}, dispatchEvent() {} };
const auth = await import('../../assets/neon-auth-client.js?v=data-api-1');
const client = await import('../../assets/neon-demo-client.js');
const context = (userId = 'synthetic-user-a', org = 'sample-generic-org') => ({ ok: true, userId, isStaff: false, accountKey: org, orgs: [{ id: org, name: 'Synthetic organization' }] });
beforeEach(() => { session.clear(); persistent.clear(); auth.setCachedContext(context()); });
test('authenticated first/blank identity supports generic organizations without a local demo', () => {
  assert.equal(client.neonDemoUrl(), null); assert.deepEqual(client.memberSubmissionIdentity(), { orgId: 'sample-generic-org' });
  auth.setCachedContext({ ...context(), isStaff: true, accountKey: 'tpw' }); assert.deepEqual(client.memberSubmissionIdentity(), {});
  auth.setCachedContext(null); assert.throws(() => client.memberSubmissionIdentity(), /Sign in/);
});
test('completed attempts are isolated by actual user ID and account, not demo labels', () => {
  const payload = { submissionId: 'stable-request-id', programs: [{ participants: 5 }] };
  client.prepareAttempt(payload, { organization: 'Synthetic organization', programs: [], prisons: [] });
  auth.setCachedContext(context('synthetic-user-b')); assert.equal(client.readAttempt(), null);
  auth.setCachedContext(context('synthetic-user-a', 'another-org')); assert.equal(client.readAttempt(), null);
  auth.setCachedContext(context()); assert.equal(client.readAttempt().payload.submissionId, payload.submissionId);
  assert.equal(client.prepareAttempt({ ...payload, submissionId: 'replacement' }, {}).payload.submissionId, payload.submissionId);
  assert.throws(() => client.prepareAttempt({ ...payload, programs: [] }, {}), /answers changed/);
  client.confirmAttempt({ ok: true, reference: 'receipt' }); assert.equal(client.readAttempt().receipt.reference, 'receipt');
});
for (const [status, code] of [[400, '22023'], [403, '42501']]) test(`known SQL rollback ${status}/${code} releases the rejected attempt`, () => {
  client.prepareAttempt({ submissionId: 'rejected', programs: [] }, {});
  assert(client.releaseRejectedAttempt(new auth.NeonRequestError('Rejected', status, code)));
  assert.equal(client.readAttempt(), null);
});
for (const error of [new auth.NeonRequestError('Unknown 400', 400), new auth.NeonRequestError('Unknown 403', 403), new auth.NeonRequestError('Gateway', 503), new auth.NeonRequestError('Conflict', 400, '22023', true), new auth.NeonRequestError('Conflict', 409), new auth.AuthRequiredError(), new Error('Network timeout')]) test(`uncertain/retry/auth outcome retains pending attempt: ${error.message}`, () => {
  client.prepareAttempt({ submissionId: 'pending', programs: [] }, {});
  assert.equal(client.releaseRejectedAttempt(error), false); assert.equal(client.readAttempt().payload.submissionId, 'pending');
});
test('a Postgres retry-conflict response retains the original UUID without reflecting raw errors', async () => {
  const userId = context().userId;
  const token = 'e30.' + Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.signature';
  globalThis.fetch = async url => {
    if (url.endsWith('/get-session')) return Response.json({ user: { id: userId }, session: { expiresAt: new Date(Date.now() + 3600000).toISOString() } });
    if (url.endsWith('/token')) return Response.json({ token });
    return Response.json({ code: '22023', message: 'TPW_RETRY_CONFLICT: secret-diagnostic-not-to-display' }, { status: 400 });
  };
  await auth.authStateReady().catch(() => {}); // prime verified identity before preparing the attempt
  auth.setCachedContext(context()); client.prepareAttempt({ submissionId: 'original', programs: [] }, {});
  await assert.rejects(auth.dataApiRequest('tpw_submit', {}), error => {
    assert.equal(error.retryConflict, true); assert.equal(client.releaseRejectedAttempt(error), false); assert(!error.message.includes('secret-diagnostic')); return true;
  });
  assert.equal(client.readAttempt().payload.submissionId, 'original');
});
