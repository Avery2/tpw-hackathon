import { getAuth } from '../../../../lib/server/auth.js';

export const runtime = 'nodejs';

function dispatch(request) {
  const auth = getAuth();
  if (!auth) return Response.json({ error: 'Authentication is not configured.' }, { status: 503 });
  // Next.js adds a trailing slash, while Better Auth matches slashless endpoints.
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/$/, '');
  return auth.handler(new Request(url, request));
}

export { dispatch as GET, dispatch as POST };
