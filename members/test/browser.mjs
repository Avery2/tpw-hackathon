// Run against a built preview: MEMBER_TEST_BASE=http://127.0.0.1:8091 node members/test/browser.mjs
// Google Sheet preview is mocked; any submission endpoint is blocked. Zero live writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const base = process.env.MEMBER_TEST_BASE || 'http://127.0.0.1:8091';
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'tpw-member-browser-'));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let socket;
try {
  let port;
  for (let n = 0; n < 100; n++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {} await sleep(100); }
  assert(port, 'Chrome did not start');
  const target = await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0; const pending = new Map(), exceptions = [], requests = [], submissions = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', async event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.url.startsWith('https://script.google.com/')) { submissions.push(request.url); await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
      else await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>Mock Sheet preview</title><p>Sheet preview intercepted for layout tests.</p>').toString('base64') });
    }
  });
  const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
  const wait = async expression => { for (let n = 0; n < 150; n++) { if (await ev(expression)) return; await sleep(100); } throw Error('Timed out: ' + expression); };
  const go = async route => { await send('Page.navigate', { url: base + route }); await wait('document.readyState === "complete"'); };
  const click = async selector => {
    const point = await ev(`(()=>{const a=[...document.querySelectorAll(${JSON.stringify(selector)})].find(a=>{const r=a.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&getComputedStyle(a).visibility!=='hidden';});if(!a)return null;const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert(point, 'Visible control required: ' + selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const screenshot = async name => { const image = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(process.env.MEMBER_SCREENSHOT_DIR || tmpdir(), `tpw-${name}.png`), Buffer.from(image.data, 'base64')); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://docs.google.com/spreadsheets/*' }, { urlPattern: 'https://script.google.com/macros/s/*' }] });
  for (const width of [1512, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
    for (const route of ['/', '/site/ourstory/index.html', '/site/our-members/index.html', '/site/ourwork/index.html', '/site/our-team/index.html']) {
      await go(route); await wait('!!document.querySelector(".tpw-header .login,a.user-accounts-text-link")');
      if (width < 760 && route.startsWith('/site/')) { await click('.header-burger-btn'); await sleep(400); }
      const before = await ev('location.href');
      await click('.tpw-header .login,a.user-accounts-text-link'); await wait('!!document.querySelector(".tpw-account-drawer:modal")');
      assert.equal(await ev('location.href'), before);
      assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-account-row h3")].map(n=>n.textContent)'), ['Orders', 'Payment Methods', 'Address', 'Profile']);
      assert.equal(await ev('document.querySelector(".tpw-new-badge").textContent'), 'New');
      assert(await ev('!document.querySelector(".tpw-account-drawer input,.tpw-account-drawer form")'));
      assert(await ev('document.querySelector(".tpw-account-drawer").contains(document.activeElement)'));
      assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
      if (route === '/site/ourstory/index.html' && width !== 1024) await screenshot(`account-drawer-${width}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await wait(`!document.querySelector('.tpw-account-drawer').open && !document.documentElement.classList.contains('tpw-account-open')`);
      await wait('document.activeElement.matches(".tpw-header .login,a.user-accounts-text-link,.customerAccountLoginMobile a,.customerAccountLoginDesktop a,.header-burger-btn")');
      if (width < 760 && route.startsWith('/site/') && !await ev('document.body.classList.contains("header--menu-open")')) { await click('.header-burger-btn'); await sleep(400); }
      await click('.tpw-header .login,a.user-accounts-text-link'); await wait('document.querySelector(".tpw-account-drawer").open');
      await click('.tpw-account-intake');
      await wait('location.pathname.endsWith("/intake/simple.html")&&!!document.querySelector("iframe")?.contentDocument?.querySelector("#organization")');
      assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-member-nav a")].map(n=>n.textContent)'), ['Log data', 'Overview']);
      const left = await ev('document.querySelector(".tpw-header .logo").getBoundingClientRect().left');
      assert(Math.abs(await ev('document.querySelector("iframe").getBoundingClientRect().left') - left) < 2);
      const frameWidth = await ev('document.querySelector("iframe").getBoundingClientRect().width');
      assert(await ev('document.querySelector("iframe").contentDocument.querySelector(".demo-form").getBoundingClientRect().width') >= frameWidth - 20);
      console.log('PASS original account drawer → Intake, keyboard close/focus, normal page gutters:', width, route);
    }
    await click('#tabs a[href="#session"]'); await wait('!!document.querySelector("#f-org")');
    if (width !== 1024) await screenshot(`wide-session-${width}`);
    await ev('document.querySelector("#f-org").value="SYNTHETIC UNSUBMITTED DRAFT"');
    await click('.tpw-header .login'); await wait('!!document.querySelector(".tpw-account-drawer:modal")');
    await click('.tpw-account-close'); await wait('!document.querySelector(".tpw-account-drawer").open');
    assert.equal(await ev('document.querySelector("#f-org").value'), 'SYNTHETIC UNSUBMITTED DRAFT');
    if (width > 440) {
      await click('.tpw-header .login'); await wait('document.querySelector(".tpw-account-drawer").open');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 10, y: 100 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 10, y: 100 });
      await wait('!document.querySelector(".tpw-account-drawer").open');
    }
    await click('.tpw-header .login'); await wait('document.querySelector(".tpw-account-drawer").open');
    await click('.tpw-account-signout'); await wait('!document.querySelector(".tpw-account-drawer").open');
    assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), null);
    assert.equal(await ev('document.querySelector(".tpw-header .login").textContent'), 'Members Login');
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
    if (width >= 900) assert.equal(await ev('document.querySelector("[data-key=org]").getBoundingClientRect().top'), await ev('document.querySelector("[data-key=program]").getBoundingClientRect().top'));
    await click('.tpw-member-nav a[href*="dashboard/"]'); await wait('!!document.querySelector(".overview-sheet")');
    assert.equal(await ev('document.querySelector(".overview-sheet").src'), 'https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/preview?gid=0');
    assert.equal(await ev('document.querySelector(".sheet-heading a").target'), '_blank');
    assert(await ev('document.querySelector(".sheet-heading a").href.includes("/edit?gid=0#gid=0")'));
    assert(await ev('!document.querySelector("#profile-view,#impact-view,.impact-card")'));
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
    console.log('PASS embedded Sheet and always-available direct link; no bespoke charts:', width);
  }
  await go('/intake/sheet.html'); await wait('!!document.querySelector(".tpw-member-nav")');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await ev('getComputedStyle(document.querySelector(".tpw-member-nav")).display'), 'none');
  assert.equal(await ev('document.querySelector(".page").getBoundingClientRect().width'), 816);
  assert.equal(await ev('getComputedStyle(document.querySelector(".page")).transform'), 'none');
  assert(!requests.some(url => /firestore\.googleapis\.com|dashboard\/js\/main\.js/.test(url)));
  assert.deepEqual(submissions, []); assert.deepEqual(exceptions, []);
  console.log('PASS print geometry, no Firebase/chart loads, no exceptions, zero live submissions.');
} finally {
  socket?.close(); chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 3000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
