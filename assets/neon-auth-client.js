// Buildless email/password client for Managed Better Auth's HTTP API.
// Cookie auth only: session tokens from sign-in/up are deliberately discarded.
// /token supplies a separate Data API JWT, held ONLY in this module's memory.
import {
  NEON_AUTH_BASE_URL, NEON_DATA_API_URL, NEON_MODE_KEY, NEON_CONTEXT_KEY,
  NEON_SIGN_IN_HREF
} from './neon-config.js?v=data-api-1';
export { isNeonMode, NEON_AUTH_BASE_URL, NEON_DATA_API_URL, NEON_SIGN_IN_HREF } from './neon-config.js?v=data-api-1';

const ALLOWED_RPC = new Set(['tpw_context', 'tpw_dashboard', 'tpw_submit']);
const DEMO_KEY = 'tpw.member.demo.v1';
const TIMEOUT_MS = 20000;
const JWT_MARGIN_MS = 30000;
let jwt = null;
let verifiedUserId = null;
let generation = 0;
let signingOut = false;
let contextMemory = null;

export class AuthRequiredError extends Error {
  constructor() {
    super('Sign in to Neon to continue. Your answers are still here.');
    this.name = 'AuthRequiredError';
    this.href = NEON_SIGN_IN_HREF;
    this.status = 401;
  }
}
export class NeonRequestError extends Error {
  constructor(message, status = 0, sqlCode = null, retryConflict = false) {
    super(message);
    this.name = 'NeonRequestError';
    this.status = status;
    this.sqlCode = sqlCode;
    this.retryConflict = retryConflict;
    // Only known PostgreSQL errors guarantee this RPC transaction rolled back.
    // A reused request ID may already have saved different answers: retain it.
    this.definitiveRejection = !retryConflict && ((status === 400 && sqlCode === '22023') || (status === 403 && sqlCode === '42501'));
  }
}
export class AuthCookieError extends Error {
  constructor() {
    super('Neon could not keep you signed in. Your browser may be blocking the secure sign-in cookies. Allow cookies for this site and try again, or try another browser. If it continues, contact TPW.');
    this.name = 'AuthCookieError';
  }
}
function storageRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* Storage is optional for auth. */ }
}
function emitChange(context) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('tpw:neon-change', { detail: { context } }));
  }
}
function clearDemoIdentity() {
  // No member-session import: that module may itself consume this client.
  // Consumers also clear their in-memory demo label on tpw:neon-change.
  storageRemove(DEMO_KEY);
}
function resetAuth() {
  generation += 1;
  jwt = null;
  verifiedUserId = null;
  setCachedContext(null);
}
function assertGeneration(expected) {
  if (generation !== expected || signingOut) throw new AuthRequiredError();
}
export function enableNeonMode() {
  clearDemoIdentity();
  try { sessionStorage.setItem(NEON_MODE_KEY, 'neon'); } catch { /* Links carry backend=neon too. */ }
  emitChange(getCachedContext());
}
export function disableNeonMode() {
  storageRemove(NEON_MODE_KEY);
  clearDemoIdentity();
  resetAuth();
  // This is a view switch, NOT remote sign-out. The auth page signs out first.
}

// Deadline includes body consumption, even if a fetch implementation ignores abort.
// Never forward network exceptions or server response bodies into displayed errors.
export async function boundedFetch(url, options = {}, timeout = TIMEOUT_MS, consume = response => response.json()) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new NeonRequestError('Neon took too long to respond. Your answers are still here. Please try again or contact TPW.'));
    }, timeout);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetch(url, { ...options, signal: controller.signal })).then(consume),
      deadline
    ]);
  } catch (error) {
    if (error instanceof NeonRequestError || error instanceof AuthRequiredError) throw error;
    throw new NeonRequestError('Neon could not be reached. Your answers are still here. Please try again or contact TPW.');
  } finally { clearTimeout(timer); }
}
async function requestJson(url, options, fallback) {
  return boundedFetch(url, { cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', ...options }, TIMEOUT_MS, async response => {
    // Do not reflect raw server messages, which can contain submitted credentials.
    if (!response.ok) {
      if (response.status === 401) throw new AuthRequiredError();
      let code = null, conflict = false;
      try {
        const error = await response.json();
        if (typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)) code = error.code;
        conflict = typeof error?.message === 'string' && error.message.startsWith('TPW_RETRY_CONFLICT:');
      } catch { /* Unknown rejection must keep the pending attempt. */ }
      throw new NeonRequestError(conflict ? 'This saved attempt conflicts with an earlier receipt. Keep these answers and contact TPW before starting another submission.' : fallback, response.status, code, conflict);
    }
    try { return await response.json(); }
    catch { throw new NeonRequestError('Neon returned an unreadable response. Your answers are still here. Please try again or contact TPW.'); }
  });
}
function authRequest(path, body, fallback = 'Neon could not complete sign-in. Check your details and try again, or contact TPW.') {
  return requestJson(NEON_AUTH_BASE_URL + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }, fallback);
}

// Return a deliberately small session shape, never the session's bearer token.
export async function getSession() {
  if (signingOut) throw new AuthRequiredError();
  const expected = generation;
  try {
    const data = await authRequest('/get-session', undefined, 'Neon could not check your sign-in. Please try again or contact TPW.');
    assertGeneration(expected);
    if (data === null || !data?.session || typeof data?.user?.id !== 'string' || !data.user.id ||
        !Number.isFinite(Date.parse(data.session.expiresAt)) || Date.parse(data.session.expiresAt) <= Date.now()) {
      resetAuth();
      return null;
    }
    if (verifiedUserId !== data.user.id) {
      if (verifiedUserId !== null) generation += 1;
      jwt = null;
      // A cached label is never proof of the current identity.
      setCachedContext(null);
      verifiedUserId = data.user.id;
    }
    return {
      session: { expiresAt: data.session.expiresAt },
      user: { id: data.user.id, name: typeof data.user.name === 'string' ? data.user.name : '', email: typeof data.user.email === 'string' ? data.user.email : '' }
    };
  } catch (error) {
    // An old request must not erase a newer sign-in.
    if (generation === expected) resetAuth();
    throw error;
  }
}
async function authenticate(path, body) {
  if (signingOut) throw new AuthRequiredError();
  clearDemoIdentity();
  resetAuth();
  const expected = generation;
  try {
    // Do not return, cache, or persist the sign-in/up response's session token.
    try { await authRequest(path, body); }
    catch (error) {
      if (error instanceof AuthRequiredError) {
        throw new NeonRequestError('Neon could not sign you in. Check your email and password and try again, or contact TPW.', 401);
      }
      throw error;
    }
    assertGeneration(expected);
    const session = await getSession();
    if (!session) throw new AuthCookieError();
    return session;
  } catch (error) {
    if (generation === expected) resetAuth();
    throw error;
  }
}
export function signIn(email, password) {
  return authenticate('/sign-in/email', { email, password });
}
export function signUp(name, email, password) {
  return authenticate('/sign-up/email', { email, password, name });
}
export async function signOut() {
  signingOut = true;
  clearDemoIdentity();
  resetAuth();
  try {
    await authRequest('/sign-out', {}, 'Neon could not confirm sign-out. Please try again before leaving this shared device.');
  } finally {
    resetAuth();
    signingOut = false;
  }
}

// Decode ONLY to bound the local cache. The Data API verifies signature and RLS.
function tokenMetadata(token) {
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3) return null;
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && typeof payload.sub === 'string'
      ? { expiresAt: payload.exp * 1000, userId: payload.sub } : null;
  } catch { return null; }
}
async function dataToken(session, expected) {
  const now = Date.now();
  if (jwt && jwt.userId === session.user.id && jwt.expiresAt > now + JWT_MARGIN_MS) return jwt.token;
  jwt = null;
  const data = await authRequest('/token', undefined, 'Neon could not confirm access. Please sign in again or contact TPW.');
  assertGeneration(expected);
  const metadata = tokenMetadata(data?.token);
  if (!metadata || metadata.userId !== session.user.id || metadata.expiresAt <= Date.now() + JWT_MARGIN_MS) {
    throw new AuthRequiredError();
  }
  jwt = { token: data.token, userId: metadata.userId, expiresAt: Math.min(metadata.expiresAt, Date.parse(session.session.expiresAt)) };
  return jwt.token;
}
export async function dataApiRequest(rpcName, body = {}) {
  // Exact names only; never accept a path, table name, query string or URL.
  if (!ALLOWED_RPC.has(rpcName)) throw new NeonRequestError('This Neon request is not supported.');
  const session = await getSession();
  if (!session) throw new AuthRequiredError();
  const expected = generation;
  try {
    const token = await dataToken(session, expected);
    assertGeneration(expected);
    const data = await requestJson(`${NEON_DATA_API_URL}/rpc/${rpcName}`, {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }, 'Neon could not save or load these answers. Your answers are still here. Check your organization access and try again, or contact TPW.');
    assertGeneration(expected);
    return data;
  } catch (error) {
    if (error instanceof AuthRequiredError && generation === expected) resetAuth();
    throw error;
  }
}

// UX metadata only. Never use this cache to authorize a request. Copy only the
// named nonsecret fields, so passing an auth response cannot persist its tokens.
function contextMetadata(context) {
  if (!context || context.ok === false || typeof context.userId !== 'string' || !context.userId ||
      typeof context.isStaff !== 'boolean' || !Array.isArray(context.orgs)) return null;
  const orgs = context.orgs.filter(org => org && typeof org.id === 'string' && org.id && typeof org.name === 'string')
    .map(org => ({ id: org.id, name: org.name }));
  const accountKey = context.isStaff ? 'tpw' :
    (orgs.some(org => org.id === context.accountKey) ? context.accountKey : orgs[0]?.id || null);
  return { ok: true, userId: context.userId, isStaff: context.isStaff, orgs, accountKey };
}
export function getCachedContext() {
  let context = contextMemory;
  try {
    const stored = sessionStorage.getItem(NEON_CONTEXT_KEY);
    if (stored) context = contextMetadata(JSON.parse(stored));
  } catch { /* Disabled storage or invalid cache: only an in-memory UX label. */ }
  return context ? contextMetadata(context) : null;
}
export function setCachedContext(context) {
  contextMemory = contextMetadata(context);
  try {
    if (contextMemory) sessionStorage.setItem(NEON_CONTEXT_KEY, JSON.stringify(contextMemory));
    else sessionStorage.removeItem(NEON_CONTEXT_KEY);
  } catch { /* Auth works without storage; callers still receive verified context. */ }
  emitChange(contextMemory ? contextMetadata(contextMemory) : null);
  return contextMemory ? contextMetadata(contextMemory) : null;
}
export async function fetchContext() {
  const data = await dataApiRequest('tpw_context', {});
  const context = contextMetadata(data);
  if (data?.ok !== true || !context || context.userId !== verifiedUserId) {
    resetAuth();
    throw new NeonRequestError('Neon could not check your organization access. Please sign in again or contact TPW.');
  }
  return setCachedContext(context);
}
export async function authStateReady() {
  const session = await getSession();
  if (!session) throw new AuthRequiredError();
  return fetchContext();
}
