// Default: fake DB, real browser + HTTP. Opt-in live mode writes synthetic rows ONLY
// to the already-running sandbox server. It never deletes rows or contacts Google.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDemoServer } from './app.mjs';

const live = process.env.TPW_LIVE_BROWSER_TEST === '1';
let server;
const records = new Map();
let base = 'http://127.0.0.1:8830';
if (!live) {
  const organizations = [{ id: 'org-1', name: 'Org 1', profile: {} }, { id: 'org-2', name: 'Org 2', profile: {} }];
  server = createDemoServer({ db: {
    organizations: async () => structuredClone(organizations),
    records: async ids => [...records.values()].filter(r => ids.includes(r.orgId)),
    save: async (id, orgId, document, receivedAt) => {
      if (!records.has(id)) records.set(id, { id, orgId, document: structuredClone(document), receivedAt });
      return structuredClone(records.get(id));
    },
    health: async () => ({ organizations: organizations.length, submissions: records.size })
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'tpw-neon-browser-'));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });
let socket;
try {
  let port;
  for (let n = 0; n < 150; n++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {}
    await sleep(100);
  }
  assert(port, 'Chrome did not start');
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0, loseNextSuccessfulPost = false;
  const pending = new Map(), exceptions = [], externalRequests = [], badResources = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (item) message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      if (!message.params.response.url.includes('/api/') && !message.params.response.url.endsWith('/favicon.ico')) badResources.push(message.params.response.url);
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request, responseStatusCode } = message.params;
      try {
        if (!request.url.startsWith(base + '/')) {
          externalRequests.push(request.url);
          await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
        } else if (loseNextSuccessfulPost && request.method === 'POST' && responseStatusCode === 200) {
          loseNextSuccessfulPost = false;
          await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionClosed' });
        } else await send('Fetch.continueRequest', { requestId });
      } catch (error) { exceptions.push(error.message); }
    }
  });
  const ev = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    for (let n = 0; n < 300; n++) { if (await ev(expression)) return; await sleep(100); }
    throw Error('Timed out: ' + expression);
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  // Response-stage interception can simulate a lost acknowledgement after a committed save.
  // Block nonlocal requests BEFORE sending; intercept API responses separately.
  await send('Fetch.enable', { patterns: [
    { urlPattern: '*', requestStage: 'Request' },
    { urlPattern: base + '/api/*', requestStage: 'Response' }
  ] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    sessionStorage.setItem('tpw.member.demo.v1', 'org-1');
    addEventListener('DOMContentLoaded', () => { const style=document.createElement('style'); style.textContent='*{animation:none!important;transition:none!important}';document.head.append(style); });
  ` });
  const getOwn = () => fetch(base + '/api/?view=dashboard&account=org-1').then(r => r.json());
  const before = (await getOwn()).submissions.length;
  await send('Page.navigate', { url: base + '/team-form/?embed=1&account=org-1&blank=1' });
  await wait(`!!document.querySelector('#quarter-summary')?.textContent`);
  await ev(`document.querySelector('#organization').value='Wrong synthetic organization';document.querySelector('#demo-form').requestSubmit();`);
  await wait(`!document.querySelector('#facilities-step').hidden`);
  await ev(`const p=document.querySelector('#facility');p.value='SQ';p.dispatchEvent(new Event('change'));document.querySelector('.yard-choices input[value=North]').click();document.querySelector('#continue-programs').click();`);
  await wait(`!document.querySelector('#programs-step').hidden`);
  await ev(`(() => {const p=document.querySelector('#program-list > section');p.querySelector('[id$="-program-name"]').value='SYNTHETIC Neon connection test';p.querySelector('[id$="-scheduled-status"]').value='Completed';p.querySelector('[id$="-start-date"]').value='2026-10-01';p.querySelector('[id$="-end-date"]').value='2026-10-02';p.querySelector('[id$="-course-hours"]').value='10';p.querySelector('[data-kind=participants]').value='5';p.querySelector('[data-kind=completed]').value='4';p.querySelector('textarea').value='Synthetic integration test; not member evidence.';p.querySelector('.continue-button').click();})()`);
  await wait(`!document.querySelector('#program-next').hidden`);
  await ev(`document.querySelector('#finish-form').click()`);
  await wait(`document.querySelector('#program-feedback').textContent.includes('Nothing was saved')`);
  assert.equal(await ev(`localStorage.getItem('tpw.neon.pending.v1:org-1')`), null);
  assert.equal((await getOwn()).submissions.length, before);
  console.log('PASS first/blank member form reaches server, rejected identity preserves answers and releases pending attempt');

  await ev(`document.querySelector('#organization').value='Org 1'`);
  loseNextSuccessfulPost = true;
  await ev(`document.querySelector('#finish-form').click()`);
  await wait(`document.querySelector('#program-feedback').textContent.includes('could not confirm')`);
  assert.equal((await getOwn()).submissions.length, before + 1);
  const attempt = await ev(`JSON.parse(localStorage.getItem('tpw.neon.pending.v1:org-1'))`);
  assert(attempt.payload.submissionId); assert.equal(attempt.receipt, null);
  await send('Page.reload', { ignoreCache: true });
  await wait(`document.querySelector('#demo-form')?.textContent.includes('Recovered the completed answers')`);
  await ev(`document.querySelector('#finish-form').click()`);
  await wait(`!document.querySelector('#submission-result').hidden`);
  assert.equal((await getOwn()).submissions.length, before + 1);
  const confirmed = await ev(`JSON.parse(localStorage.getItem('tpw.neon.pending.v1:org-1'))`);
  assert.equal(confirmed.payload.submissionId, attempt.payload.submissionId); assert(confirmed.receipt.ok);
  await send('Page.reload', { ignoreCache: true });
  await wait(`document.querySelector('#submission-result') && !document.querySelector('#submission-result').hidden`);
  assert(await ev(`document.querySelector('#submission-receipt').textContent.includes('Submitted to TPW')`));
  console.log('PASS committed write with lost acknowledgement -> reload -> retry -> original receipt, one saved record, successful receipt survives refresh');

  await send('Page.navigate', { url: base + '/team-dashboard/#org-1' });
  await wait(`!!document.querySelector('#neon-demo-exports button')`);
  await wait(`document.querySelector('#view-sections').textContent.includes('SYNTHETIC Neon connection test')`);
  assert.equal(await ev(`getComputedStyle(document.querySelector('.tpw-member-nav')).display === 'none'`), false);
  const exported = await ev(`fetch('/api/export?account=org-1&format=json').then(r=>r.json())`);
  assert(exported.submissions.every(s => s.orgId === 'org-1'));
  const saved = exported.submissions.find(s => s.programs?.some(p => p.name === 'SYNTHETIC Neon connection test' && p.sites?.some(y => y.participants === 5)));
  assert(saved); assert(!JSON.stringify(exported).includes('_retry'));
  const csv = await ev(`fetch('/api/export?account=org-1&format=csv').then(r=>r.text())`);
  assert(csv.includes('SYNTHETIC Neon connection test')); assert(csv.includes('"5","4"'));
  const forged = await ev(`fetch('/api/export?account=org-1&org=org-2&format=json').then(r=>r.json())`);
  assert.equal(forged.submissions.length, 0);
  console.log('PASS Neon-backed dashboard, own-org JSON and CSV, cross-org filter cannot broaden scope');

  await send('Page.navigate', { url: base + '/team-dashboard/raw-data.html#tpw' });
  await wait(`document.querySelector('#data-status')?.textContent.includes('historical submissions')`);
  assert.equal(await ev(`document.querySelectorAll('iframe').length`), 0);
  assert(await ev(`document.querySelector('#neon-demo-exports button')?.textContent.includes('CSV')`));
  assert.deepEqual(externalRequests, [], 'Local demo must never request Google or external services');
  assert.deepEqual(badResources, [], 'Required static files must load');
  assert.deepEqual(exceptions, []);
  console.log('PASS Data page stays on Neon, required static assets load, no external browser requests or uncaught exceptions');
  console.log(live ? 'LIVE SANDBOX PASS: one synthetic submission retained on avery-neon-connection; no production/Sheets writes.' : 'PASS fake-database browser suite; no live database writes.');
} finally {
  socket?.close(); chrome.kill('SIGTERM');
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true });
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
