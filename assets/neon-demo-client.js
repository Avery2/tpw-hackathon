// Local demo transport plus durable attempts shared with the authenticated Data API.
// Demo labels never authorize Data API requests; PostgreSQL enforces membership.
import { isSandboxMode } from './neon-config.js?v=sandbox-1';
import { getDemoAccount } from './member-session.js?v=sandbox-1';
import { isNeonMode, getCachedContext, NeonRequestError as DataApiRequestError } from './neon-auth-client.js?v=sandbox-1';
import { appendSheetsLink } from './dashboard-exports.js?v=sandbox-1';

export function neonDemoUrl() {
  try {
    if (window.TPW_NEON_DEMO !== true) return null;
    const page = new URL(window.location.href);
    const url = new URL(window.TPW_BACKEND_URL);
    if (page.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(page.hostname)) return null;
    if (url.origin !== page.origin || url.pathname !== '/api/' || url.search || url.hash || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export function demoAccount(orgId) {
  const account = getDemoAccount();
  if (!account) throw new Error('Choose a demo account using Members Login first.');
  if (orgId && (account !== 'tpw' && account !== orgId)) throw new Error('This demo account cannot view that organization.');
  return account;
}

// Identity comes from the local demo account, never from whether prefill succeeded.
// The server still checks the typed organization name against its own profile.
export function memberSubmissionIdentity() {
  if (isNeonMode()) {
    const context = getCachedContext();
    if (!context?.ok || !context.userId) throw new Error('Sign in to recover or submit these answers.');
    if (context.isStaff || context.orgs?.length > 1) return {};
    const organization = context.orgs?.find(org => org.id === context.accountKey);
    if (!organization) throw new Error('Your account needs an assigned organization. Contact TPW.');
    return { orgId: organization.id };
  }
  if (!isSandboxMode() && !neonDemoUrl()) return {};
  const account = demoAccount();
  return ['org-1', 'org-2'].includes(account) ? { orgId: account } : {};
}

export class NeonRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'NeonRequestError';
    this.status = status;
    // Only these local server responses are guaranteed to precede any write.
    this.definitiveRejection = [400, 403, 413].includes(status);
  }
}

// Consume the body inside the same deadline as the headers. HEAD callers need no body.
export async function boundedFetch(url, options = {}, timeout = 20000, consume = response => response) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('The request timed out.'));
    }, timeout);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetch(url, { ...options, signal: controller.signal })).then(consume),
      deadline
    ]);
  } finally { clearTimeout(timer); }
}

export async function neonRequest({ orgId, payload } = {}) {
  const url = neonDemoUrl();
  if (!url) throw new Error('The local demo service is not enabled.');
  const account = demoAccount(orgId);
  let options = { cache: 'no-store' };
  if (payload) {
    options = { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: `demo:${account}`, payload }) };
  } else {
    url.searchParams.set('view', 'dashboard');
    url.searchParams.set('account', account);
    if (orgId) url.searchParams.set('org', orgId);
  }
  return boundedFetch(url, options, 20000, async response => {
    const fallback = 'The local demo could not save or load data. Your answers are still here. Please try again or contact TPW.';
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (!response.ok) throw new NeonRequestError(fallback, response.status);
      throw error;
    }
    if (!response.ok || data?.ok !== true) {
      throw new NeonRequestError(Array.isArray(data?.errors) ? data.errors.join(' ') : fallback, response.status);
    }
    return data;
  });
}

const PREFIX = 'tpw.neon.pending.v1:';
function attemptKey() {
  if (isSandboxMode()) return 'tpw.neon.pending.sandbox.v1:' + demoAccount();
  if (isNeonMode()) {
    const context = getCachedContext();
    if (!context?.ok || !context.userId || !context.accountKey) throw new Error('Sign in with your assigned account to recover these answers.');
    return 'tpw.neon.pending.data-api.v1:' + encodeURIComponent(context.userId) + ':' + encodeURIComponent(context.accountKey);
  }
  if (!neonDemoUrl()) throw new Error('The local demo is not enabled.');
  return PREFIX + demoAccount();
}
export function readAttempt() {
  const raw = localStorage.getItem(attemptKey());
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (data.version !== 1 || !data.payload?.submissionId || !data.submission || typeof data.canonical !== 'string') throw new Error('The saved demo attempt could not be read. Do not submit again until it has been checked.');
  return data;
}
export function prepareAttempt(payload, submission) {
  const previous = readAttempt();
  // The quarter is generated, not edited. A recovered retry across a quarter boundary
  // must keep the original period; every actual answer must still match.
  const candidate = previous ? { ...payload, reportingPeriod: previous.payload.reportingPeriod } : payload;
  const canonical = JSON.stringify({ ...candidate, submissionId: '' });
  if (previous) {
    if (previous.canonical !== canonical) throw new Error('These answers changed after a save attempt. To avoid a duplicate, reload to recover the saved attempt and retry it first. After its receipt, choose Log more data for a new submission.');
    return previous;
  }
  const attempt = { version: 1, canonical, payload, submission, receipt: null };
  localStorage.setItem(attemptKey(), JSON.stringify(attempt));
  return attempt;
}
export function confirmAttempt(receipt) {
  const attempt = readAttempt();
  if (!attempt) throw new Error('The saved demo attempt is missing.');
  localStorage.setItem(attemptKey(), JSON.stringify({ ...attempt, receipt }));
}
export function clearAttempt() { localStorage.removeItem(attemptKey()); }
export function releaseRejectedAttempt(error) {
  if (!(error instanceof NeonRequestError || error instanceof DataApiRequestError) || !error.definitiveRejection) return false;
  clearAttempt();
  return true;
}

// Mount only on dashboard pages. Resolve the account on EACH click, not when mounted:
// a hash navigation can switch accounts without reloading this module.
export function mountDemoExports() {
  if (!neonDemoUrl() || typeof document === 'undefined' || !window.location.pathname.includes('/team-dashboard/')) return;
  const heading = document.querySelector('.dashboard-heading');
  if (!heading || document.querySelector('#neon-demo-exports')) return;
  const container = document.createElement('div'); container.id = 'neon-demo-exports'; container.className = 'tpw-data-exports';
  container.setAttribute('aria-label', 'Local demo data exports');
  const label = document.createElement('span'); label.textContent = 'Local demo (not real sign-in) · ';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  container.append(label);
  for (const format of ['csv', 'json']) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `Export ${format.toUpperCase()}`;
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = '';
      try {
        const account = demoAccount();
        const url = new URL('export', neonDemoUrl());
        url.searchParams.set('account', account); url.searchParams.set('format', format);
        const blob = await boundedFetch(url, { cache: 'no-store' }, 20000, response => {
          if (!response.ok) throw new Error('The local demo export could not be loaded. Please try again.');
          return response.blob();
        });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = blobUrl; link.download = `tpw-demo-${account}.${format}`;
        link.click(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
    container.append(button);
  }
  appendSheetsLink(container);
  container.append(status); (heading.querySelector('.shell') || heading).append(container);
}
