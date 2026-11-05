// Actual browser + actual Neon Auth/Data API, explicit sandbox-only synthetic writes.
// No application server: the ephemeral server below serves static files only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, AUTH, loadFixtures, signIn, api } from './live-test.mjs';
if (process.env.TPW_LIVE_DATA_API_TEST !== '1') throw Error('Set TPW_LIVE_DATA_API_TEST=1 for explicit synthetic sandbox browser writes.');
const users = await loadFixtures(), identity = await signIn(users['member-a']);
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
const base = `http://localhost:${server.address().port}`;
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
        if (![base + '/', AUTH + '/', API + '/'].some(prefix => request.url.startsWith(prefix))) { externalRequests.push(new URL(request.url).origin); await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
        else if (loseNextSuccessfulPost && request.url === API + '/rpc/tpw_submit' && request.method === 'POST' && responseStatusCode === 200) { loseNextSuccessfulPost = false; await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionClosed' }); }
        else await send('Fetch.continueRequest', { requestId });
      } catch (error) { exceptions.push(error.message); }
    }
  });
  const ev = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const wait = async expression => { for (let n = 0; n < 450; n++) { if (await ev(expression)) return; await sleep(100); } throw Error('Timed out waiting for browser state: ' + expression); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: API + '/rpc/tpw_submit', requestStage: 'Response' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.append(s);});` });
  await send('Page.navigate', { url: base + '/neon/' });
  await wait(`document.querySelector('#signed-out') && !document.querySelector('#signed-out').hidden`);
  await ev(`document.querySelector('#email').value=${JSON.stringify(users['member-a'].email)};document.querySelector('#password').value=${JSON.stringify(users['member-a'].password)};document.querySelector('#auth-form').requestSubmit();`);
  await wait(`!document.querySelector('#signed-in').hidden || !document.querySelector('#error').hidden`);
  assert(await ev(`!document.querySelector('#signed-in').hidden`), await ev(`document.querySelector('#error').textContent`));
  await wait(`!document.querySelector('#destinations').hidden && !document.querySelector('#refresh-access').disabled`);
  assert.equal(await ev(`document.querySelectorAll('#organizations li').length`), 1);
  assert(await ev(`document.querySelector('#access-message').textContent.includes('organization')`));
  await send('Page.reload', { ignoreCache: true });
  await wait(`document.querySelector('#signed-in') && !document.querySelector('#signed-in').hidden && !document.querySelector('#refresh-access').disabled`);
  console.log('PASS real browser sign-in, secure partitioned cookie, session reload and assigned organization');
  const own = async () => { const result = await api(identity, '/rpc/tpw_dashboard', { p_org_id: 'org-1' }); assert.equal(result.status, 200); return result.data; };
  const before = (await own()).submissions.length;
  await send('Page.navigate', { url: base + '/team-form/?embed=1&backend=neon&blank=1' });
  await wait(`!!document.querySelector('#quarter-summary')?.textContent && document.querySelector('#organization').value==='Org 1'`);
  await ev(`document.querySelector('#demo-form').requestSubmit()`);
  await wait(`!document.querySelector('#facilities-step').hidden`);
  await ev(`const p=document.querySelector('#facility');p.value='SQ';p.dispatchEvent(new Event('change'));document.querySelector('.yard-choices input[value=North]').click();document.querySelector('#continue-programs').click();`);
  await wait(`!document.querySelector('#programs-step').hidden`);
  await ev(`(()=>{const p=document.querySelector('#program-list > section');p.querySelector('[id$="-program-name"]').value='SYNTHETIC authenticated browser test';p.querySelector('[id$="-scheduled-status"]').value='Completed';p.querySelector('[id$="-start-date"]').value='2026-10-01';p.querySelector('[id$="-end-date"]').value='2026-10-02';p.querySelector('[id$="-course-hours"]').value='10';p.querySelector('[data-kind=participants]').value='5';p.querySelector('[data-kind=completed]').value='4';p.querySelector('textarea').value='Synthetic browser test; not member evidence.';p.querySelector('.continue-button').click();})()`);
  await wait(`!document.querySelector('#program-next').hidden`);
  loseNextSuccessfulPost = true;
  await ev(`document.querySelector('#finish-form').click()`);
  await wait(`document.querySelector('#program-feedback').textContent.includes('could not confirm')`);
  assert.equal((await own()).submissions.length, before + 1);
  const pendingKey = 'tpw.neon.pending.data-api.v1:' + encodeURIComponent(users['member-a'].id) + ':org-1';
  const attempt = await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(pendingKey)}))`);
  assert(attempt.payload.submissionId); assert.equal(attempt.receipt, null);
  await send('Page.reload', { ignoreCache: true });
  await wait(`document.querySelector('#demo-form')?.textContent.includes('Recovered the completed answers')`);
  await ev(`document.querySelector('#finish-form').click()`);
  await wait(`!document.querySelector('#submission-result').hidden`);
  assert.equal((await own()).submissions.length, before + 1);
  const confirmed = await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(pendingKey)}))`);
  assert.equal(confirmed.payload.submissionId, attempt.payload.submissionId); assert(confirmed.receipt.ok);
  console.log('PASS real form -> Neon commit -> deliberately lost reply -> reload/retry -> exact receipt, one record');
  await send('Page.navigate', { url: base + '/team-dashboard/?backend=neon#tpw' });
  await wait(`!!document.querySelector('#dashboard-exports button') && document.querySelector('#view-sections').textContent.includes('SYNTHETIC authenticated browser test')`);
  assert.equal(await ev(`document.querySelector('#profile-heading').textContent`), 'Org 1', 'Forged staff hash cannot change identity');
  const exported = await ev(`import('/assets/neon-auth-client.js?v=sandbox-1').then(m=>m.dataApiRequest('tpw_dashboard',{p_org_id:null}))`);
  assert(exported.submissions.every(doc => doc.orgId === 'org-1'));
  const csv = await ev(`import('/assets/dashboard-exports.js?v=sandbox-1').then(m=>m.programHistoryCsv(${JSON.stringify(exported.submissions)}))`);
  assert(csv.includes('SYNTHETIC authenticated browser test')); assert(!csv.includes('Org 2'));
  await send('Page.navigate', { url: base + '/intake/simple.html?backend=neon' });
  await wait(`document.querySelector('iframe')?.getAttribute('src')?.includes('backend=neon')`);
  await send('Page.navigate', { url: base + '/neon/' });
  await wait(`document.querySelector('#signed-in') && !document.querySelector('#signed-in').hidden && !document.querySelector('#refresh-access').disabled`);
  await ev(`document.querySelector('#sign-out').click()`);
  await wait(`!document.querySelector('#signed-out').hidden`);
  const noSession = await ev(`import('/assets/neon-auth-client.js?v=sandbox-1').then(m=>m.getSession())`); assert.equal(noSession, null);
  assert.deepEqual(externalRequests, [], 'Never contacts Google or an unrelated host');
  assert.deepEqual(badResources, [], 'Required static assets load'); assert.deepEqual(exceptions, []);
  console.log('PASS authenticated dashboard, forged URL denial, scoped exports, embedded form routing, real sign-out and no Google requests');
  console.log('LIVE BROWSER PASS: one synthetic sandbox submission retained; no production/demo-neon/Sheets changes.');
} finally {
  socket?.close(); chrome.kill('SIGTERM');
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
