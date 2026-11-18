import { betterAuth } from 'better-auth';
import { database } from './db.js';

let auth;

export function getAuth() {
  const { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseURL } = process.env;
  if (!secret || !baseURL) return null;

  auth ??= betterAuth({
    secret,
    baseURL,
    database: database(),
    emailAndPassword: { enabled: true, disableSignUp: true },
  });
  return auth;
}

// Only the verified invitation handler calls this server-side instance.
export function getInviteSignupAuth() {
  return betterAuth({
    database: database(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true, autoSignIn: false },
  });
}
