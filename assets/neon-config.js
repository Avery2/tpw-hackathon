// Public branch addresses, not credentials.
export const NEON_AUTH_BASE_URL = 'https://ep-restless-surf-arinnqli.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
export const NEON_AUTH_URL = NEON_AUTH_BASE_URL;
export const NEON_DATA_API_URL = 'https://ep-restless-surf-arinnqli.apirest.c-4.us-west-2.aws.neon.tech/neondb/rest/v1';
export const NEON_MODE_KEY = 'tpw.backend.v1';
export const NEON_CONTEXT_KEY = 'tpw.neon.context.v1';
export const NEON_SIGN_IN_HREF = new URL('../neon/?backend=neon', import.meta.url).href;

function backendMode() {
  if (typeof window === 'undefined') return 'sheet';
  let location;
  try { location = new URL(window.location.href); } catch { return 'sheet'; }
  const backend = location.searchParams.get('backend');
  if (backend === 'sheet') return 'sheet';
  if (backend === 'neon') return 'neon';
  if (backend === 'demo') return 'sandbox';
  let stored;
  try { stored = sessionStorage.getItem(NEON_MODE_KEY); } catch { /* Optional preference. */ }
  if (stored === 'sandbox') return 'sandbox';
  if (['www.averychan.site', 'averychan.site'].includes(location.hostname) && location.pathname.startsWith('/tpw-hackathon/')) return 'sandbox';
  if (stored === 'neon' || /\/neon(?:\/|$)/.test(location.pathname)) return 'neon';
  return 'sheet';
}
export function isSandboxMode() { return backendMode() === 'sandbox'; }
export function isNeonMode() { return backendMode() === 'neon'; }
export function enableSandboxMode() {
  try { sessionStorage.setItem(NEON_MODE_KEY, 'sandbox'); } catch { /* Links also carry backend=demo. */ }
}
