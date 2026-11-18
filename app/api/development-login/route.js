import { getAuth } from '../../../lib/server/auth.js';
import { developmentAccounts, developmentLoginEnabled } from '../../../lib/server/development-login.js';

export async function POST(request) {
  if (!developmentLoginEnabled()) return new Response(null, { status: 404 });
  const baseURL = new URL(process.env.BETTER_AUTH_URL);
  if (request.headers.get('origin') !== baseURL.origin) return new Response(null, { status: 403 });

  const { role } = await request.json().catch(() => ({})) || {};
  if (!Object.hasOwn(developmentAccounts, role)) return new Response(null, { status: 400 });
  const password = process.env.AUTH_PILOT_PASSWORD;
  const auth = getAuth();
  if (!auth) return new Response(null, { status: 503 });
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  const signIn = await auth.handler(new Request(new URL('/api/auth/sign-in/email', baseURL), {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: developmentAccounts[role], password }),
  }));
  await signIn.body?.cancel();
  const response = Response.json({ ok: signIn.ok }, {
    status: signIn.status,
    headers: { 'Cache-Control': 'no-store' },
  });
  for (const cookie of signIn.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  return response;
}
