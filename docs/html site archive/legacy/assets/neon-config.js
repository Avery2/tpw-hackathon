// Public branch addresses, not credentials.
export const NEON_AUTH_BASE_URL = 'https://ep-restless-surf-arinnqli.neonauth.c-4.us-west-2.aws.neon.tech/neondb/auth';
export const NEON_AUTH_URL = NEON_AUTH_BASE_URL;
export const NEON_DATA_API_URL = 'https://ep-restless-surf-arinnqli.apirest.c-4.us-west-2.aws.neon.tech/neondb/rest/v1';
export const NEON_MODE_KEY = 'tpw.backend.v1';
export const NEON_CONTEXT_KEY = 'tpw.neon.context.v1';
export const NEON_SIGN_IN_HREF = new URL('../neon/?backend=neon', import.meta.url).href;

// This integrated preview always uses the same-origin reporting API.
export function isSandboxMode() { return true; }
export function isNeonMode() { return false; }
export function enableSandboxMode() {}
