// Account-free browser -> Data API -> isolated sandbox. Explicit synthetic writes only.
// No application server: the ephemeral server below serves static files only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, AUTH, api } from './live-test.mjs';
if (process.env.TPW_LIVE_DATA_API_TEST !== '1') throw Error('Set TPW_LIVE_DATA_API_TEST=1 for explicit synthetic sandbox browser writes.');
const response = await fetch(AUTH + '/token/anonymous', { credentials: 'omit' });
assert.equal(response.status, 200);
const identity = { jwt: (await response.json()).token };
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (!/^\/(assets|neon|team-form|team-dashboard|intake|data|img|images|fonts)\//.test(name) || name.includes('..') || name.includes('/.')) { res.writeHead(404).end(); return; }
  if (name.endsWith('/')) name += 'index.html';
  try { const body = await readFile(path.join(root, name)); res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.TPW_LIVE_PAGES_TEST === '1' ? 'https://www.averychan.site/tpw-hackathon' : `http://localhost:${server.address().port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'tpw-data-api-browser-'));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let socket;
try {
  let port;
  for (let n = 0; n < 150; n++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {} await sleep(100); }
  assert(port, 'Chrome did not start');
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0, loseNextSuccessfulPost = false;
  const pending = new Map(), exceptions = [], externalRequests = [], badResources = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (item) message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && message.params.response.url.startsWith(base) && !message.params.response.url.endsWith('/favicon.ico')) badResources.push(message.params.response.url);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request, responseStatusCode } = message.params;
      try {
        if (![new URL(base).origin + '/', AUTH + '/token/anonymous', API + '/'].some(prefix => request.url.startsWith(prefix))) { externalRequests.push(new URL(request.url).origin); await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
        else if (loseNextSuccessfulPost && request.url === API + '/rpc/tpw_sandbox_submit' && request.method === 'POST' && responseStatusCode === 200) { loseNextSuccessfulPost = false; await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionClosed' }); }
        else await send('Fetch.continueRequest', { requestId });
      } catch (error) { exceptions.push(error.message); }
    }
  });
  const ev = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const wait = async expression => { for (let n = 0; n < 450; n++) { if (await ev(expression)) return; await sleep(100); } throw Error('Timed out waiting for browser state: ' + expression); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: API + '/rpc/tpw_sandbox_submit', requestStage: 'Response' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.append(s);});` });

  await send('Page.addScriptToEvaluateOnNewDocument', { source: "sessionStorage.setItem('tpw.backend.v1','neon');" });
  const own = async () => {
    const result = await api(identity, '/rpc/tpw_sandbox_dashboard', { p_org_id: 'org-1' });
    assert.equal(result.status, 200); return result.data;
  };
  const before = (await own()).submissions.length;
  assert.equal((await api(identity, '/rpc/tpw_context', {})).status, 403);
  assert.equal((await api(identity, '/submissions?select=*')).status, 403);
  assert.equal((await api(identity, '/rpc/tpw_sandbox_dashboard', { p_org_id: 'not-a-fictional-org' })).status, 403);
  await send('Page.navigate', { url: base + '/neon/' + (process.env.TPW_LIVE_PAGES_TEST === '1' ? '' : '?backend=demo') });
  await wait("location.pathname.endsWith('/intake/simple.html') && document.querySelector('iframe')?.getAttribute('src')?.includes('backend=demo')");
  console.log('PASS entry bypasses sign-in, including an old saved login preference; no email/account required');
  await send('Page.navigate', { url: base + '/team-form/?embed=1&backend=demo&blank=1' });
  await wait("!!document.querySelector('#quarter-summary')?.textContent && document.querySelector('#organization').value==='Org 1'");
  await ev("document.querySelector('#demo-form').requestSubmit()");
  await wait("!document.querySelector('#facilities-step').hidden");
  await ev("const p=document.querySelector('#facility');p.value='SQ';p.dispatchEvent(new Event('change'));document.querySelector('.yard-choices input[value=North]').click();document.querySelector('#continue-programs').click();");
  await wait("!document.querySelector('#programs-step').hidden");
  await ev("(()=>{const p=document.querySelector('#program-list > section');p.querySelector('[id$=\"-program-name\"]').value='SYNTHETIC account-free DB test';p.querySelector('[id$=\"-scheduled-status\"]').value='Completed';p.querySelector('[id$=\"-start-date\"]').value='2026-10-01';p.querySelector('[id$=\"-end-date\"]').value='2026-10-02';p.querySelector('[id$=\"-course-hours\"]').value='10';p.querySelector('[data-kind=participants]').value='5';p.querySelector('[data-kind=completed]').value='4';p.querySelector('textarea').value='Synthetic browser test; not member evidence.';p.querySelector('.continue-button').click();})()");
  await wait("!document.querySelector('#program-next').hidden");
  loseNextSuccessfulPost = true;
  await ev("document.querySelector('#finish-form').click()");
  await wait("document.querySelector('#program-feedback').textContent.includes('could not confirm')");
  assert.equal((await own()).submissions.length, before + 1);
  const pendingKey = 'tpw.neon.pending.sandbox.v1:org-1';
  const attempt = await ev("JSON.parse(localStorage.getItem('" + pendingKey + "'))");
  assert(attempt.payload.submissionId); assert.equal(attempt.receipt, null);
  await send('Page.reload', { ignoreCache: true });
  await wait("document.querySelector('#demo-form')?.textContent.includes('Recovered the completed answers')");
  await ev("document.querySelector('#finish-form').click()");
  await wait("!document.querySelector('#submission-result').hidden");
  assert.equal((await own()).submissions.length, before + 1);
  const confirmed = await ev("JSON.parse(localStorage.getItem('" + pendingKey + "'))");
  assert.equal(confirmed.payload.submissionId, attempt.payload.submissionId); assert(confirmed.receipt.ok);
  assert.equal(confirmed.receipt.signedIn, false);
  console.log('PASS real form -> DB commit -> lost reply -> reload/retry -> original receipt; one synthetic record');
  await send('Page.navigate', { url: base + '/team-dashboard/?backend=demo#org-1' });
  await wait("!!document.querySelector('#dashboard-exports button') && document.querySelector('#view-sections').textContent.includes('SYNTHETIC account-free DB test')");
  assert.equal(await ev("document.querySelector('#profile-heading').textContent"), 'Org 1');
  const exported = await ev("import('" + base + "/assets/neon-sandbox-client.js?v=sandbox-1').then(m=>m.sandboxRequest('tpw_sandbox_dashboard',{p_org_id:'org-1'}))");
  assert(exported.submissions.every(doc => doc.orgId === 'org-1' && (doc.synthetic || doc.testData)));
  const csv = await ev("import('" + base + "/assets/dashboard-exports.js?v=sandbox-1').then(m=>m.programHistoryCsv(" + JSON.stringify(exported.submissions) + "))");
  assert(csv.includes('SYNTHETIC account-free DB test')); assert(!csv.includes('Org 2')); assert(csv.includes('"5","4"'));
  await send('Page.navigate', { url: base + '/team-dashboard/?backend=demo#org-2' });
  await wait("document.querySelector('#profile-heading')?.textContent==='Org 2' && document.querySelector('#dashboard-status').hidden");
  assert(!await ev("document.querySelector('#view-sections').textContent.includes('SYNTHETIC account-free DB test')"));
  assert.deepEqual(externalRequests, [], 'Only anonymous-token endpoint, Data API and static site may be contacted; no sign-in, signup, session or Google request');
  assert.deepEqual(badResources, [], 'Required static assets load'); assert.deepEqual(exceptions, []);
  console.log('PASS Neon dashboard and exports, fictional-org scope, protected APIs denied; no account/session/Google calls');
  console.log('ACCOUNT-FREE SANDBOX PASS: one synthetic submission retained on avery-neon-connection only.');
} finally {
  socket?.close(); chrome.kill('SIGTERM');
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
