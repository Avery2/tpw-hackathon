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
