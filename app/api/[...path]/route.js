import { Readable } from 'node:stream';
import { handleApi } from '../../../server/api.js';

export const runtime = 'nodejs';

async function dispatch(request) {
  const input = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
  input.method = request.method;
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/$/, '');
  if (request.method === 'GET' && url.pathname === '/api/local-development' && process.env.NODE_ENV === 'development') {
    return Response.json({ localDevelopment: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  input.url = url.href;
  const headers = new Headers();
  let response;
  const output = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name, value); },
    end(body) { response = new Response(body, { status: this.statusCode, headers }); }
  };
  await handleApi(input, output);
  return response;
}

export { dispatch as GET, dispatch as POST };
