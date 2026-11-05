// Public branch addresses, not credentials. Sheets remains the default backend.
export const NEON_AUTH_BASE_URL = 'https://ep-restless-surf-arinnqli.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
export const NEON_AUTH_URL = NEON_AUTH_BASE_URL;
export const NEON_DATA_API_URL = 'https://ep-restless-surf-arinnqli.apirest.c-4.us-west-2.aws.neon.tech/neondb/rest/v1';
export const NEON_MODE_KEY = 'tpw.backend.v1';
export const NEON_CONTEXT_KEY = 'tpw.neon.context.v1';
export const NEON_SIGN_IN_HREF = new URL('../neon/', import.meta.url).href;

// Reading a query parameter never persists an opt-in. Only the auth page calls
// enableNeonMode(). An explicit Sheets link wins over both path and storage.
export function isNeonMode() {
  if (typeof window === 'undefined') return false;
  let location;
  try { location = new URL(window.location.href); } catch { return false; }
  const backend = location.searchParams.get('backend');
  if (backend === 'sheet') return false;
  if (backend === 'neon' || /\/neon(?:\/|$)/.test(location.pathname)) return true;
  try { return sessionStorage.getItem(NEON_MODE_KEY) === 'neon'; }
  catch { return false; }
}
