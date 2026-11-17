export function developmentLoginEnabled() {
  const { BETTER_AUTH_URL, AUTH_PILOT_PASSWORD, VERCEL_ENV, TPW_ENABLE_PILOT_PICKER } = process.env;
  if (!BETTER_AUTH_URL || !AUTH_PILOT_PASSWORD) return false;
  if (VERCEL_ENV) return VERCEL_ENV === 'preview' && TPW_ENABLE_PILOT_PICKER === 'true';
  return ['localhost', '127.0.0.1'].includes(new URL(BETTER_AUTH_URL).hostname);
}

export const developmentAccounts = {
  staff: 'auth-pilot-staff@example.com',
  admin: 'auth-pilot@example.com',
  member: 'auth-pilot-invite@example.com',
};
