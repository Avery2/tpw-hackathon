// Account-free transport for the two fictional organizations only. No cookies,
// sign-in, session lookup, persisted JWTs, or protected RPCs belong in this client.
import { NEON_AUTH_BASE_URL, NEON_DATA_API_URL } from './neon-config.js?v=sandbox-1';
import { boundedFetch, NeonRequestError } from './neon-auth-client.js?v=sandbox-1';
const ALLOWED = new Set(['tpw_sandbox_dashboard', 'tpw_sandbox_submit']);
const FAILURE = 'The prototype could not save or load data. Your answers are still here. Please try again or contact TPW.';
let jwt = null;
let tokenRequest = null;

async function jsonRequest(url, options) {
  return boundedFetch(url, { cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', credentials: 'omit', ...options }, 20000, async response => {
    if (!response.ok) {
      let code = null, conflict = false;
      try {
        const error = await response.json();
        if (typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)) code = error.code;
        conflict = typeof error?.message === 'string' && error.message.startsWith('TPW_RETRY_CONFLICT:');
      } catch { /* Unknown outcome: retain the pending attempt. */ }
      throw new NeonRequestError(conflict
        ? 'This saved attempt conflicts with an earlier receipt. Keep these answers and contact TPW before starting another submission.'
        : FAILURE, response.status, code, conflict);
    }
    try { return await response.json(); }
    catch { throw new NeonRequestError(FAILURE); }
  });
}
async function anonymousToken() {
  if (jwt && jwt.expires > Date.now() + 30000) return jwt.token;
  if (!tokenRequest) tokenRequest = (async () => {
    const data = await jsonRequest(NEON_AUTH_BASE_URL + '/token/anonymous', { method: 'GET', headers: { Accept: 'application/json' } });
    let claims;
    try { claims = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
    catch { throw new NeonRequestError(FAILURE); }
    const suppliedExpiry = typeof data.expires_at === 'number'
      ? (data.expires_at < 1e12 ? data.expires_at * 1000 : data.expires_at) : Date.parse(data.expires_at);
    const expires = Math.min(claims.exp * 1000, Number.isFinite(suppliedExpiry) ? suppliedExpiry : claims.exp * 1000);
    if (claims.role !== 'anonymous' || !Number.isFinite(expires) || expires <= Date.now() + 30000) throw new NeonRequestError(FAILURE);
    jwt = { token: data.token, expires };
    return jwt.token;
  })().finally(() => { tokenRequest = null; });
  return tokenRequest;
}
export async function sandboxRequest(rpc, parameters = {}) {
  if (!ALLOWED.has(rpc)) throw new NeonRequestError(FAILURE);
  if (rpc === 'tpw_sandbox_dashboard' && parameters.p_org_id != null && !['org-1', 'org-2'].includes(parameters.p_org_id)) throw new NeonRequestError(FAILURE, 403, '42501');
  const token = await anonymousToken();
  let reply;
  try {
    reply = await jsonRequest(`${NEON_DATA_API_URL}/rpc/${rpc}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(parameters)
    });
  } catch (error) {
    if (error.status === 401) jwt = null;
    throw error; // Never fall back or automatically retry a write.
  }
  if (reply?.ok !== true) throw new NeonRequestError(FAILURE);
  if (rpc === 'tpw_sandbox_submit' && (!reply.reference || !reply.submissionId || !Number.isInteger(reply.rows) || reply.rows < 1 || reply.signedIn !== false)) throw new NeonRequestError(FAILURE);
  return reply;
}
