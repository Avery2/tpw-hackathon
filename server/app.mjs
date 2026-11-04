import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, readFile } from 'node:fs/promises';
import { account, scope, resolveOrganization, prepare, ownedDocument, publicDocument, Problem } from './model.mjs';
import { csvExport } from './export.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BYTE_LIMIT = 250000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gif': 'image/gif' };
const PDFs = new Set(['/docs/TPW Collective Impact Report 2026.pdf', '/docs/RIGHT 4.0 RFA.pdf']);
export function publicPath(raw) {
  let pathname;
  try { pathname = decodeURIComponent(raw.split('?')[0]); } catch { throw new Problem(400, 'Invalid address.'); }
  if (!pathname.startsWith('/') || pathname.includes('\\') || /[\x00-\x1f\x7f]/.test(pathname) || pathname.split('/').some(p => p.startsWith('.') || /^(?:env(?:\.|$)|work$|server$|test$|receiver$)/i.test(p))) throw new Problem(403, 'That file is not public.');
  if (pathname.endsWith('/')) pathname += 'index.html';
  const allowed = pathname === '/index.html' || pathname === '/favicon.ico' || PDFs.has(pathname)
    || /^\/(assets|site|report)\//.test(pathname)
    || /^\/team-dashboard\/(?:[^/]+\.html|workspace\.css|loading\.css|js\/[^/]+\.js)$/.test(pathname)
    || /^\/team-form\/(?:index\.html|backend\.js|js\/[^/]+\.js)$/.test(pathname)
    || /^\/intake\/(?:simple\.html|js\/simple\.js)$/.test(pathname)
    || /^\/members\/index\.html$/.test(pathname)
    || ['/data/demo/dashboard-sample.json', '/data/public/tpw-members.csv'].includes(pathname);
  if (!allowed || !MIME[path.extname(pathname).toLowerCase()]) throw new Problem(404, 'That file is not public.');
  return pathname;
}

export function validateRequest(req) {
  const port = req.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) throw new Problem(403, 'Open this demo on its local address.');
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new Problem(403, 'Use the same local page to send this request.');
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) throw new Problem(403, 'Cross-site requests are not allowed.');
  if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new Problem(400, 'Invalid address.');
}
function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], stopped = false;
    const tooLarge = () => { stopped = true; chunks = []; req.pause(); reject(new Problem(413, 'The submission is too large.')); };
    if (Number(req.headers['content-length']) > BYTE_LIMIT) return tooLarge();
    req.on('data', chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > BYTE_LIMIT) return tooLarge();
      chunks.push(chunk);
    });
    req.on('error', () => reject(new Problem(400, 'The submission was not readable.')));
    req.on('end', () => {
      if (stopped) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Problem(400, 'The submission was not readable.')); }
    });
  });
}
function send(res, status, data, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(type.startsWith('application/json') && !Buffer.isBuffer(data) ? JSON.stringify(data) : data);
}
async function staticFile(req, res, root) {
  const pathname = publicPath(req.url);
  // Walk every path component with lstat, never follow directory or leaf symlinks.
  let filename = root;
  for (const part of pathname.slice(1).split('/')) {
    filename = path.join(filename, part);
    const entry = await lstat(filename);
    if (entry.isSymbolicLink()) throw new Problem(403, 'That file is not public.');
  }
  if (!(await lstat(filename)).isFile()) throw new Problem(404, 'File not found.');
  const data = pathname === '/team-form/backend.js'
    ? Buffer.from("window.TPW_BACKEND_URL = new URL('/api/', location.origin).href;\nwindow.TPW_NEON_DEMO = true;\n")
    : pathname === '/team-dashboard/raw-data.html'
      ? await readFile(new URL('./data.html', import.meta.url))
      : await readFile(filename);
  send(res, 200, req.method === 'HEAD' ? Buffer.alloc(0) : data, MIME[path.extname(filename).toLowerCase()]);
}
export function createDemoServer({ db, root = ROOT, now = () => new Date() }) {
  const server = http.createServer(async (req, res) => {
    try {
      validateRequest(req);
      // Check raw paths before URL normalization can erase traversal segments.
      const rawPath = req.url.split('?')[0];
      let decodedPath;
      try { decodedPath = decodeURIComponent(rawPath); } catch { throw new Problem(400, 'Invalid address.'); }
      if (decodedPath.split('/').some(p => p === '..' || p === '.') || rawPath.includes('\\')) throw new Problem(403, 'Invalid address.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') {
        if (!['GET', 'HEAD'].includes(req.method)) throw new Problem(405, 'Use GET for public files.');
        return await staticFile(req, res, root);
      }
      if (!['GET', 'POST'].includes(req.method)) throw new Problem(405, 'That request method is not supported.');
      if (req.method === 'POST') {
        if (!['/api', '/api/'].includes(url.pathname)) throw new Problem(404, 'Unknown API address.');
        const envelope = await body(req);
        const token = envelope?.token;
        const who = account(typeof token === 'string' && token.startsWith('demo:') ? token.slice(5) : null);
        if (url.searchParams.has('account') && url.searchParams.get('account') !== who) throw new Problem(403, 'Demo accounts do not match.');
        if (!envelope?.payload || typeof envelope.payload !== 'object') throw new Problem(400, 'The submission was not readable.');
        const org = resolveOrganization(await db.organizations(), who, envelope.payload);
        const prepared = prepare(envelope.payload, org, now());
        const saved = await db.save(prepared.id, org.id, prepared.document, prepared.document.submittedAt);
        if (saved.orgId !== org.id || saved.document?._retry?.hash !== prepared.hash) throw new Problem(409, 'This retry ID already belongs to different answers. Your answers are still here; start a new submission to change them.');
        return send(res, 200, saved.document._retry.receipt);
      }
      const who = account(url.searchParams.get('account'));
      if (url.pathname === '/api/health') {
        if (who !== 'tpw') throw new Problem(403, 'Only the TPW demo account can view health counts.');
        return send(res, 200, { ok: true, localDemo: true, counts: await db.health() });
      }
      if (!['/api', '/api/', '/api/export'].includes(url.pathname)) throw new Problem(404, 'Unknown API address.');
      if (url.pathname !== '/api/export' && url.searchParams.get('view') !== 'dashboard') return send(res, 200, {
        ok: true, service: 'TPW LOCAL synthetic demo', formVersion: 2, localDemo: true,
        features: { programNotes: true, currentQuarter: true, dashboard: true, testData: true, export: true }
      });
      if (url.pathname === '/api/export' && !['csv', 'json'].includes(url.searchParams.get('format'))) throw new Problem(400, 'Choose csv or json for the download.');
      const orgs = scope(await db.organizations(), who, url.searchParams);
      const records = await db.records(orgs.map(o => o.id));
      // Defense in depth: scope is based exclusively on database org_id, never document.orgId.
      const submissions = records.filter(r => orgs.some(o => o.id === r.orgId)).map(r => ownedDocument(r, orgs.find(o => o.id === r.orgId)));
      if (url.pathname === '/api/export') {
        const format = url.searchParams.get('format');
        const disposition = { 'Content-Disposition': `attachment; filename="tpw-demo-history.${format}"` };
        return format === 'csv'
          ? send(res, 200, csvExport(submissions), 'text/csv; charset=utf-8', disposition)
          : send(res, 200, { ok: true, localDemo: true, coverage: 'history (all owned submissions; not current-only)', orgs: orgs.map(o => ({ ...publicDocument(o.profile), id: o.id, name: o.name })), submissions }, undefined, disposition);
      }
      return send(res, 200, { ok: true, localDemo: true, orgs: orgs.map(o => ({ ...publicDocument(o.profile), id: o.id, name: o.name })), submissions });
    } catch (error) {
      const status = error instanceof Problem ? error.status : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 503;
      const message = error instanceof Problem ? error.message : status === 404 ? 'File not found.' : 'The local demo could not reach its data. No fallback data was used. Your answers are still on the page; ask the demo operator for help before retrying.';
      send(res, status, { ok: false, errors: [message] }, undefined, status === 413 ? { Connection: 'close' } : {});
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 20000;
  return server;
}
