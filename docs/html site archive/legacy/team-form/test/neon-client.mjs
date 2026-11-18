// Local, fake-environment tests: never call Google or a real database.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const memory = new Map();
globalThis.sessionStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key)
};
globalThis.localStorage = sessionStorage;
globalThis.window = { location: { href: 'http://127.0.0.1:8830/team-form/', pathname: '/team-form/' } };
const client = await import('../../assets/neon-demo-client.js');
const { setDemoAccount, clearDemoAccount } = await import('../../assets/member-session.js');
const { loadDashboard } = await import('../../assets/dashboard-source.js');
let requests;
beforeEach(() => {
  memory.clear(); clearDemoAccount(); setDemoAccount('org-1');
  window.TPW_NEON_DEMO = true;
  window.TPW_BACKEND_URL = 'http://127.0.0.1:8830/api/';
  window.location.href = 'http://127.0.0.1:8830/team-form/';
  requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return new Response(JSON.stringify({ ok: true, orgs: [{ id: 'org-1', name: 'Server profile' }], submissions: [{ orgId: 'org-1', id: 'saved' }] }));
  };
});
test('local mode requires explicit opt-in, same origin, exact API path and loopback host', () => {
  assert.ok(client.neonDemoUrl());
  for (const url of ['http://localhost:8830/api/', 'http://127.0.0.1:8830/other', 'https://example.com/api/', 'http://127.0.0.1:8830/api/?x=1']) {
    window.TPW_BACKEND_URL = url; assert.equal(client.neonDemoUrl(), null);
  }
  window.TPW_BACKEND_URL = 'http://127.0.0.1:8830/api/';
  window.TPW_NEON_DEMO = false; assert.equal(client.neonDemoUrl(), null);
  window.TPW_NEON_DEMO = true; window.location.href = 'https://example.com/team-form/';
  assert.equal(client.neonDemoUrl(), null);
});
test('missing accounts never become staff; organization filter can only narrow scope', async () => {
  clearDemoAccount();
  await assert.rejects(client.neonRequest(), /Choose a demo account/);
  assert.equal(requests.length, 0);
  setDemoAccount('org-1');
  await assert.rejects(client.neonRequest({ orgId: 'org-2' }), /cannot view/);
  setDemoAccount('tpw');
  await client.neonRequest({ orgId: 'org-2' });
  assert.equal(requests[0].url.searchParams.get('account'), 'tpw');
  assert.equal(requests[0].url.searchParams.get('org'), 'org-2');
});
test('dashboard uses only server profiles and records, marks demo data, no sample fetch', async () => {
  const data = await loadDashboard('org-1');
  assert.equal(data.org.name, 'Server profile');
  assert.equal(data.submissions.length, 1);
  assert.equal(data.submissions[0].synthetic, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, '/api/');
});
test('server failure rejects without any fallback', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, errors: ['Demo unavailable'] }), { status: 503 });
  await assert.rejects(loadDashboard('org-1'), /Demo unavailable/);
});
test('POST carries only a demo label token and existing payload', async () => {
  await client.neonRequest({ payload: { submissionId: 'test-uuid', programs: [] } });
  assert.deepEqual(JSON.parse(requests[0].options.body), { token: 'demo:org-1', payload: { submissionId: 'test-uuid', programs: [] } });
  assert.ok(requests[0].options.signal);
});
test('pending attempt survives module reload, reuses UUID, refuses changed answers and retains receipt', async () => {
  const payload = { submissionId: 'first-uuid', programs: [{ name: 'Demo program' }] };
  client.prepareAttempt(payload, { organization: 'Org 1', programs: [], prisons: [] });
  const reloaded = await import('../../assets/neon-demo-client.js?reload-test');
  assert.equal(reloaded.readAttempt().payload.submissionId, 'first-uuid');
  assert.equal(reloaded.prepareAttempt({ ...payload, submissionId: 'new-uuid' }, {}).payload.submissionId, 'first-uuid');
  assert.throws(() => client.prepareAttempt({ ...payload, programs: [] }, {}), /answers changed/);
  client.confirmAttempt({ ok: true, reference: 'demo-receipt' });
  assert.equal(client.readAttempt().receipt.reference, 'demo-receipt');
  assert.ok(![...memory.values()].some(value => value.includes('demo:org-1')));
  setDemoAccount('org-2'); assert.equal(client.readAttempt(), null);
  setDemoAccount('org-1'); client.clearAttempt(); assert.equal(client.readAttempt(), null);
});
test('disabled storage prevents preparing a submission rather than sending an untracked save', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('Storage unavailable'); } };
  try { assert.throws(() => client.prepareAttempt({ submissionId: 'test' }, {}), /Storage unavailable/); }
  finally { globalThis.localStorage = original; }
});
test('first and blank member submissions resolve identity without prefill; staff is not an organization', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const toPayload = new Function(`${source.match(/function toPayload\(submission, submissionId\) \{[\s\S]*?\n\}/)[0]}; return toPayload;`)();
  assert.match(source, /Object\.assign\(submission, memberSubmissionIdentity\(\)\)/);
  for (const account of ['org-1', 'org-2']) {
    setDemoAccount(account);
    const submission = { organization: 'Typed name is not replaced', programs: [], ...client.memberSubmissionIdentity() };
    assert.equal(toPayload(submission, 'first').orgId, account);
    assert.equal(toPayload(submission, 'first').organization, 'Typed name is not replaced');
  }
  setDemoAccount('tpw'); assert.deepEqual(client.memberSubmissionIdentity(), {});
  window.TPW_NEON_DEMO = false; assert.deepEqual(client.memberSubmissionIdentity(), {});
});

for (const status of [400, 403, 413]) test(`HTTP ${status} releases rejection so edited answers can prepare and save`, async () => {
  const original = { submissionId: 'rejected', organization: 'Wrong name', programs: [] };
  client.prepareAttempt(original, { organization: original.organization });
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, errors: ['Use your profile organization name.'] }), { status });
  await assert.rejects(client.neonRequest({ payload: original }), error => {
    assert.ok(error instanceof client.NeonRequestError);
    assert.equal(error.status, status);
    assert.equal(error.message, 'Use your profile organization name.');
    assert.equal(client.releaseRejectedAttempt(error), true);
    return true;
  });
  assert.equal(client.readAttempt(), null);
  const corrected = client.prepareAttempt({ ...original, submissionId: 'corrected', organization: 'Org 1' }, {});
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, reference: 'saved' }));
  client.confirmAttempt(await client.neonRequest({ payload: corrected.payload }));
  assert.equal(client.readAttempt().receipt.reference, 'saved');
});

for (const status of [409, 500, 503]) test(`HTTP ${status} keeps the pending attempt`, async () => {
  const payload = { submissionId: 'pending', programs: [] };
  client.prepareAttempt(payload, {});
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, errors: ['Not confirmed'] }), { status });
  await assert.rejects(client.neonRequest({ payload }), error => {
    assert.equal(client.releaseRejectedAttempt(error), false); return true;
  });
  assert.equal(client.readAttempt().payload.submissionId, 'pending');
});

test('cross-quarter recovered retries send the original payload exactly but reject edited counts', async () => {
  const original = { submissionId: 'original', reportingPeriod: { year: 2026, quarter: 4 }, programs: [{ participants: 7 }] };
  client.prepareAttempt(original, { reportingPeriod: original.reportingPeriod });
  const reloaded = await import('../../assets/neon-demo-client.js?quarter-test');
  const retry = reloaded.prepareAttempt({ ...original, submissionId: 'new', reportingPeriod: { year: 2027, quarter: 1 } }, {});
  await client.neonRequest({ payload: retry.payload });
  assert.deepEqual(JSON.parse(requests[0].options.body).payload, original);
  assert.throws(() => reloaded.prepareAttempt({ ...original, programs: [{ participants: 8 }] }, {}), /answers changed/);
});

test('JSON and blob body stalls are bounded and timeout retains the attempt', async () => {
  client.prepareAttempt({ submissionId: 'pending', programs: [] }, {});
  for (const method of ['json', 'blob']) {
    globalThis.fetch = async () => ({ [method]: () => new Promise(() => {}) });
    await assert.rejects(client.boundedFetch('http://127.0.0.1:8830/api/', {}, 5, response => response[method]()), error => {
      assert.match(error.message, /timed out/);
      assert.equal(client.releaseRejectedAttempt(error), false); return true;
    });
    assert.equal(client.readAttempt().payload.submissionId, 'pending');
  }
});

test('confirmed database save is separate from receipt storage failure; original attempt remains', async () => {
  const payload = { submissionId: 'confirmed', programs: [] };
  client.prepareAttempt(payload, {});
  const result = await client.neonRequest({ payload });
  assert.equal(result.ok, true);
  const original = globalThis.localStorage;
  globalThis.localStorage = { ...original, setItem() { throw new Error('Storage full'); } };
  try { assert.throws(() => client.confirmAttempt(result), /Storage full/); }
  finally { globalThis.localStorage = original; }
  assert.equal(client.readAttempt().payload.submissionId, 'confirmed');
  assert.equal(client.readAttempt().receipt, null);
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(source, /The save is confirmed, but this browser could not store its receipt/);
});

test('bounded fetch aborts stalled requests', async () => {
  globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  await assert.rejects(client.boundedFetch('http://127.0.0.1:8830/api/', {}, 5), /Aborted|timed out/);
});
