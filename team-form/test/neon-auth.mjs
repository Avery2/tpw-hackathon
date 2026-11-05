// Offline tests only. Every request is intercepted; never contact Auth or Sheets.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const memory = new Map();
const events = [];
globalThis.sessionStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};
globalThis.localStorage = { getItem() { throw new Error('Auth must not use local storage'); }, setItem() { throw new Error('Auth must not use local storage'); } };
globalThis.window = { location: { href: 'http://localhost:8826/tpw-hackathon/intake/simple.html' }, dispatchEvent(event) { events.push(event); } };
const config = await import('../../assets/neon-config.js?v=data-api-1');
const client = await import('../../assets/neon-auth-client.js?v=data-api-1');
let calls, cookieSession, handlers;
const context = (userId = 'test-user') => ({ ok: true, userId, isStaff: false, orgs: [{ id: 'org-1', name: 'Synthetic organization' }], accountKey: 'org-1' });
const session = (id = 'test-user', expiresAt = new Date(Date.now() + 3600000).toISOString()) => ({ user: { id, email: 'sandbox@example.test', name: 'Sandbox' }, session: { expiresAt, token: 'SESSION-TOKEN-DO-NOT-PERSIST' } });
const token = (sub = 'test-user', exp = Math.floor(Date.now() / 1000) + 120) => `eyJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function route(path, handler) { handlers.set(path, handler); }
beforeEach(() => {
  client.disableNeonMode(); memory.clear(); events.length = 0;
  window.location.href = 'http://localhost:8826/tpw-hackathon/intake/simple.html';
  calls = []; cookieSession = session(); handlers = new Map();
  route('/get-session', () => json(cookieSession));
  route('/token', () => json({ token: token(cookieSession?.user?.id) }));
  route('/sign-in/email', () => json({ user: session().user, token: 'SIGNIN-SESSION-TOKEN' }));
  route('/sign-up/email', () => json({ user: session().user, token: 'SIGNUP-SESSION-TOKEN' }));
  route('/sign-out', () => { cookieSession = null; return json({ success: true }); });
  route('/rpc/tpw_context', () => json(context()));
  route('/rpc/tpw_dashboard', () => json({ ok: true, orgs: context().orgs, submissions: [] }));
  route('/rpc/tpw_submit', () => json({ ok: true, reference: 'synthetic-receipt' }));
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith(config.NEON_AUTH_BASE_URL + '/') || String(url).startsWith(config.NEON_DATA_API_URL + '/'), 'No unexpected host may be contacted');
    const path = String(url).startsWith(config.NEON_AUTH_BASE_URL) ? String(url).slice(config.NEON_AUTH_BASE_URL.length) : String(url).slice(config.NEON_DATA_API_URL.length);
    calls.push({ url: String(url), path, options });
    const handler = handlers.get(path);
    assert.ok(handler, `Unexpected endpoint ${path}`);
    return handler(options);
  };
});

test('Sheets default; explicit opt-in is read-only; sheet query wins over path and preference', () => {
  assert.equal(client.isNeonMode(), false);
  for (const path of ['intake/simple.html?backend=neon', 'neon/', 'neon/index.html']) {
    window.location.href = `http://localhost:8826/tpw-hackathon/${path}`;
    assert.equal(client.isNeonMode(), true);
    assert.equal(memory.size, 0);
  }
  window.location.href = 'http://localhost:8826/tpw-hackathon/intake/simple.html';
  memory.set('tpw.member.demo.v1', 'tpw');
  client.enableNeonMode();
  assert.equal(memory.get(config.NEON_MODE_KEY), 'neon');
  assert.equal(memory.has('tpw.member.demo.v1'), false);
  assert.equal(client.isNeonMode(), true);
  window.location.href = 'http://localhost:8826/tpw-hackathon/neon/?backend=sheet';
  assert.equal(client.isNeonMode(), false);
  client.disableNeonMode(); assert.equal(memory.has(config.NEON_MODE_KEY), false);
});

test('sign-in and sign-up use documented cookie endpoints and discard response tokens', async () => {
  for (const kind of ['signIn', 'signUp']) {
    calls.length = 0;
    const result = kind === 'signIn'
      ? await client.signIn('sandbox@example.test', 'not-a-real-password')
      : await client.signUp('Sandbox', 'sandbox@example.test', 'not-a-real-password');
    assert.deepEqual(result.session, { expiresAt: cookieSession.session.expiresAt });
    assert.equal(result.user.id, 'test-user');
    assert.equal(calls[0].path, kind === 'signIn' ? '/sign-in/email' : '/sign-up/email');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), kind === 'signIn'
      ? { email: 'sandbox@example.test', password: 'not-a-real-password' }
      : { email: 'sandbox@example.test', password: 'not-a-real-password', name: 'Sandbox' });
    assert.equal(calls[1].path, '/get-session');
    for (const call of calls) {
      assert.equal(call.options.credentials, 'include');
      assert.equal(call.options.headers.Authorization, undefined);
      assert.equal(call.options.cache, 'no-store');
      assert.equal(call.options.redirect, 'error');
    }
    assert.doesNotMatch(JSON.stringify(result), /TOKEN/);
    assert.doesNotMatch(JSON.stringify([...memory]), /password|TOKEN|sandbox@example/);
  }
});

test('cookie failure after successful sign-in explains cookie support without leaking tokens', async () => {
  cookieSession = null;
  await assert.rejects(client.signIn('sandbox@example.test', 'keep-input'), error => {
    assert.ok(error instanceof client.AuthCookieError);
    assert.match(error.message, /cookies/);
    assert.doesNotMatch(error.message, /TOKEN|keep-input/);
    return true;
  });
  assert.equal(client.getCachedContext(), null);
});

test('session then /token cookie request then exact RPC with JWT, never session bearer', async () => {
  const result = await client.dataApiRequest('tpw_dashboard', { p_org_id: 'org-1' });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(call => call.path), ['/get-session', '/token', '/rpc/tpw_dashboard']);
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  const api = calls[2];
  assert.equal(api.url, `${config.NEON_DATA_API_URL}/rpc/tpw_dashboard`);
  assert.equal(api.options.method, 'POST');
  assert.equal(api.options.credentials, 'omit');
  assert.equal(api.options.headers.Authorization, `Bearer ${token()}`);
  assert.deepEqual(JSON.parse(api.options.body), { p_org_id: 'org-1' });
  await client.dataApiRequest('tpw_submit', { p_payload: { submissionId: 'test-only' } });
  assert.equal(calls.filter(call => call.path === '/token').length, 1, 'Unexpired JWT may be reused in memory');
  assert.equal(calls.filter(call => call.path === '/get-session').length, 2, 'Still check the cookie session');
  assert.doesNotMatch(JSON.stringify([...memory]), /signature|SESSION-TOKEN/);
});

test('RPC allowlist rejects paths, other functions, inherited keys and arbitrary origins before fetching', async () => {
  for (const name of ['tpw_context?x=1', '../tpw_submit', 'tpw_context/', 'organizations', 'toString', 'https://evil.example/rpc/tpw_submit', '/rpc/tpw_submit', null]) {
    await assert.rejects(client.dataApiRequest(name, {}), /not supported/);
  }
  assert.equal(calls.length, 0);
});

test('null, malformed and expired sessions fail closed; cached labels never authorize calls', async () => {
  for (const invalid of [null, {}, { user: session().user, session: {} }, session('test-user', 'invalid'), session('test-user', new Date(Date.now() - 1000).toISOString())]) {
    client.setCachedContext(context());
    cookieSession = invalid;
    calls.length = 0;
    await assert.rejects(client.authStateReady(), error => error instanceof client.AuthRequiredError && /Sign in to Neon/.test(error.message) && /\/neon\//.test(error.href));
    assert.equal(client.getCachedContext(), null);
    assert.deepEqual(calls.map(call => call.path), ['/get-session']);
    await assert.rejects(client.dataApiRequest('tpw_dashboard'), client.AuthRequiredError);
  }
});

test('invalid, expired, nearly expired and wrong-subject JWTs never reach Data API', async () => {
  for (const jwt of [null, 'not-a-jwt', token('test-user', Math.floor(Date.now() / 1000) - 1), token('test-user', Math.floor(Date.now() / 1000) + 10), token('different-user')]) {
    client.disableNeonMode(); calls.length = 0;
    route('/token', () => json({ token: jwt }));
    await assert.rejects(client.dataApiRequest('tpw_dashboard'), client.AuthRequiredError);
    assert.equal(calls.some(call => call.path.startsWith('/rpc/')), false);
    assert.equal(client.getCachedContext(), null);
  }
});

test('JWT refresh uses a conservative expiry margin', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    await client.dataApiRequest('tpw_dashboard');
    now += 100000;
    await client.dataApiRequest('tpw_dashboard');
    assert.equal(calls.filter(call => call.path === '/token').length, 2);
  } finally { Date.now = originalNow; }
});

test('verified context is nonsecret, copied, scoped to user and announces changes', async () => {
  route('/rpc/tpw_context', () => json({ ...context(), token: 'secret-jwt', password: 'secret-password', user: session().user,
    orgs: [{ id: 'org-1', name: 'Synthetic organization', secret: 'extra-secret' }] }));
  const ready = await client.authStateReady();
  assert.deepEqual(ready, context());
  assert.deepEqual(client.getCachedContext(), context());
  assert.deepEqual(JSON.parse(memory.get(config.NEON_CONTEXT_KEY)), context());
  assert.doesNotMatch(JSON.stringify([...memory]), /secret|@example|expiresAt/);
  const event = events.findLast(event => event.type === 'tpw:neon-change' && event.detail.context);
  assert.deepEqual(event.detail.context, context());
  ready.orgs[0].name = 'mutated';
  assert.equal(client.getCachedContext().orgs[0].name, 'Synthetic organization');
  route('/rpc/tpw_context', () => json(context('some-other-user')));
  await assert.rejects(client.fetchContext(), /could not check/);
  assert.equal(client.getCachedContext(), null);
});

test('reload may restore a UX label but must acquire a new JWT from cookie auth', async () => {
  await client.authStateReady();
  calls.length = 0;
  const reloaded = await import('../../assets/neon-auth-client.js?reload-auth-test');
  assert.deepEqual(reloaded.getCachedContext(), context());
  await reloaded.dataApiRequest('tpw_dashboard');
  assert.deepEqual(calls.map(call => call.path), ['/get-session', '/token', '/rpc/tpw_dashboard']);
  cookieSession = null;
  await assert.rejects(reloaded.authStateReady(), reloaded.AuthRequiredError);
  assert.equal(reloaded.getCachedContext(), null);
});

test('context rejection is not upgraded to success from plausible metadata', async () => {
  client.setCachedContext(context());
  route('/rpc/tpw_context', () => json({ ...context(), ok: false }));
  await assert.rejects(client.authStateReady(), /could not check/);
  assert.equal(client.getCachedContext(), null);
});

test('unassigned users do not gain an account key or staff flag', async () => {
  route('/rpc/tpw_context', () => json({ ...context(), isStaff: false, orgs: [], accountKey: 'tpw' }));
  const result = await client.authStateReady();
  assert.equal(result.accountKey, null);
  assert.equal(result.isStaff, false);
  client.setCachedContext({ ...context(), isStaff: 'true', accountKey: 'tpw' });
  assert.equal(client.getCachedContext(), null);
});

test('storage disabled does not block cookie authentication or in-memory context', async () => {
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  try {
    client.enableNeonMode();
    await client.signIn('sandbox@example.test', 'synthetic-password');
    assert.deepEqual(await client.authStateReady(), context());
    assert.deepEqual(client.getCachedContext(), context());
    await client.signOut();
    assert.equal(client.getCachedContext(), null);
  } finally { globalThis.sessionStorage = original; }
});

test('sign-out always clears JWT and context; later requests cannot reuse them', async () => {
  await client.authStateReady();
  calls.length = 0;
  await client.signOut();
  assert.equal(calls[0].path, '/sign-out');
  assert.equal(calls[0].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
  assert.equal(client.getCachedContext(), null);
  await assert.rejects(client.dataApiRequest('tpw_dashboard'), client.AuthRequiredError);
  cookieSession = session();
  await client.dataApiRequest('tpw_dashboard');
  assert.equal(calls.filter(call => call.path === '/token').length, 1);
});

test('failed sign-out clears local state but never claims confirmed sign-out', async () => {
  await client.authStateReady();
  route('/sign-out', () => json({ secret: 'server-secret' }, 503));
  await assert.rejects(client.signOut(), /could not confirm sign-out/);
  assert.equal(client.getCachedContext(), null);
  calls.length = 0;
  await client.dataApiRequest('tpw_dashboard');
  assert.equal(calls.filter(call => call.path === '/token').length, 1);
});

test('401 and session network failures clear context and JWT, with no fallback', async () => {
  await client.authStateReady();
  route('/rpc/tpw_dashboard', () => json({ message: 'secret-token' }, 401));
  await assert.rejects(client.dataApiRequest('tpw_dashboard'), client.AuthRequiredError);
  assert.equal(client.getCachedContext(), null);
  route('/rpc/tpw_dashboard', () => json({ ok: true }));
  calls.length = 0;
  await client.dataApiRequest('tpw_dashboard');
  assert.equal(calls.filter(call => call.path === '/token').length, 1);
  client.setCachedContext(context());
  route('/get-session', () => { throw new Error('Network exception containing secret-password'); });
  await assert.rejects(client.getSession(), error => /could not be reached/.test(error.message) && !/secret-password/.test(error.message));
  assert.equal(client.getCachedContext(), null);
});

test('errors never reflect response bodies, rejected passwords, URLs or arbitrary exceptions', async () => {
  route('/sign-in/email', () => json({ message: 'secret-password secret-token' }, 401));
  await assert.rejects(client.signIn('sandbox@example.test', 'secret-password'), error => /Check your email and password/.test(error.message) && !/secret-|@example/.test(error.message));
  route('/rpc/tpw_submit', () => json({ code: '42501', message: 'secret-token database details' }, 403));
  await assert.rejects(client.dataApiRequest('tpw_submit', {}), error => error instanceof client.NeonRequestError && error.status === 403 && error.definitiveRejection && !/secret-|database details/.test(error.message));
  route('/get-session', () => new Response('secret-invalid-json'));
  await assert.rejects(client.getSession(), error => /unreadable response/.test(error.message) && !/secret/.test(error.message));
});

test('a changed cookie identity never reuses the old JWT or context', async () => {
  await client.authStateReady();
  cookieSession = session('new-user'); calls.length = 0;
  route('/rpc/tpw_context', () => json(context('new-user')));
  const next = await client.authStateReady();
  assert.equal(next.userId, 'new-user');
  assert.equal(calls.filter(call => call.path === '/token').length, 1);
  assert.equal(calls.find(call => call.path === '/rpc/tpw_context').options.headers.Authorization, `Bearer ${token('new-user')}`);
});

test('in-flight token response cannot resurrect access after sign-out', async () => {
  let release, requested;
  const started = new Promise(resolve => { requested = resolve; });
  route('/token', () => new Promise(resolve => { release = resolve; requested(); }));
  const pending = client.dataApiRequest('tpw_dashboard');
  await started;
  await client.signOut();
  release(json({ token: token() }));
  await assert.rejects(pending, client.AuthRequiredError);
  assert.equal(calls.some(call => call.path === '/rpc/tpw_dashboard'), false);
  assert.equal(client.getCachedContext(), null);
});

test('header and body stalls are both bounded, even if fetch ignores abort', async () => {
  for (const stage of ['headers', 'body']) {
    let signal;
    globalThis.fetch = async (_, options) => {
      signal = options.signal;
      if (stage === 'headers') return new Promise(() => {});
      return { json: () => new Promise(() => {}) };
    };
    await assert.rejects(client.boundedFetch(config.NEON_AUTH_BASE_URL + '/get-session', {}, 5), /too long/);
    assert.equal(signal.aborted, true);
  }
});

test('auth page has local assets, masked password, fixed destinations, no role picker or JWT paste', async () => {
  const html = await readFile(new URL('../../neon/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../../neon/auth-page.js', import.meta.url), 'utf8');
  assert.match(html, /Synthetic sandbox/);
  assert.match(html, /id="password"[^>]*type="password"/);
  assert.match(html, /id="destinations"[^>]*hidden/);
  assert.match(html, /Sheets demo labels are not authenticated/);
  assert.doesNotMatch(html, /<select|site-shell|cdn\.|<script[^>]*https?:/i);
  assert.doesNotMatch(js, /searchParams\.get\(['"](?:next|redirectTo)/);
  assert.match(js, /Account created, no organization access assigned yet/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /disableNeonMode\(\)/);
  assert.match(js, /showError\(error\)/);
});
