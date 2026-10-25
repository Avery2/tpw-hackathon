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
  // Mock TPW's Google Sheet (the receiver's ?view=dashboard reply) and the sample file, not the
  // dashboard's rendering or data calculations.
  const sheetFixture = JSON.stringify({ ok: true, orgs: [{ id: 'org-1', name: 'Org 1' }], submissions: [{
    id: 'fixture', orgId: 'org-1', organization: 'Org 1', submittedAt: '2026-10-01T12:00:00Z',
    reportingPeriod: { quarter: 4, year: 2026 }, previousSubmissionId: '', testData: false,
    prisons: [{ code: 'SQ', name: 'San Quentin Rehabilitation Center (SQ)', yards: ['North'] }],
    programs: [{ id: 'fixture-program', name: 'Synthetic program', status: 'Completed',
      participants: 5, participantsCompleted: 4, courseHours: 52,
      assignments: [{ code: 'SQ', yards: ['North'] }] }] }] });
  const sampleFixture = JSON.stringify({ orgs: [{ id: 'org-1', name: 'Org 1' }, { id: 'org-2', name: 'Org 2' }], submissions: [] });
  const json = body => ({ responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(body).toString('base64') });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  socket.addEventListener('message', async event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      const address = new URL(request.url);
      if (request.url.startsWith('https://script.google.com/') && request.method === 'GET' && address.searchParams.get('view') === 'dashboard') await send('Fetch.fulfillRequest', { requestId, ...json(sheetFixture) });
      else if (request.url.startsWith('https://script.google.com/')) { submissions.push(request.url); await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
      else if (address.pathname.endsWith('/data/demo/dashboard-sample.json')) await send('Fetch.fulfillRequest', { requestId, ...json(sampleFixture) });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://docs.google.com/spreadsheets/*' }, { urlPattern: 'https://script.google.com/macros/s/*' }, { urlPattern: '*/data/demo/dashboard-sample.json' }] });
  for (const width of [1512, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
    // Signed out, Members Login opens the copy of TPW's own sign-in box (25 Oct 2026), not the
    // account drawer. No password is ever asked for; from the front page a demo account goes to Log data.
    await go('/'); await ev('sessionStorage.clear()');
    // Signed out on a copied page, Members Login must carry no account, or a new tab would sign in as Org 1.
    const mirrorLogin = 'a.user-accounts-text-link, .customerAccountLoginDesktop a, .customerAccountLoginMobile a';
    await go('/site/ourstory/index.html'); await wait(`!!document.querySelector('${mirrorLogin}')?.href.includes('/intake/simple.html')`);
    assert(await ev(`[...document.querySelectorAll('${mirrorLogin}')].every(a => !a.href.includes('account='))`), 'signed-out Members Login must not carry an account');
    await go('/'); await wait('!!document.querySelector(".tpw-header .login")');
    assert.equal(await ev('document.querySelector(".tpw-header .login").textContent'), 'Members Login');
    await click('.tpw-header .login'); await wait('!!document.querySelector(".tpw-signin:modal")');
    assert.equal(await ev('document.querySelector(".tpw-signin h2").textContent'), 'Welcome to TPW');
    assert(await ev('document.querySelector(".tpw-signin-password").disabled'), 'the password box must stay switched off');
    assert(await ev('!document.querySelector(".tpw-account-drawer")?.open'));
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
    await ev('document.querySelector(".tpw-signin-email").value="someone@example.invalid"');
    await click('.tpw-signin-submit'); await wait('document.querySelector(".tpw-signin-message").textContent.includes("only has three accounts")');
    assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), null);
    if (width !== 1024) await screenshot(`sign-in-${width}`);
    await click('.tpw-signin-demo button[data-account="org-1"]');
    await wait('location.pathname.endsWith("/intake/simple.html") && location.search.includes("account=org-1")');
    assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), 'org-1');
    console.log('PASS signed-out Members Login opens the TPW-style sign-in; a demo account goes to Log data:', width);
    for (const route of ['/', '/site/ourstory/index.html', '/site/our-members/index.html', '/site/ourwork/index.html', '/site/our-team/index.html']) {
      await go(route); await wait('!!document.querySelector(".tpw-header .login,a.user-accounts-text-link")');
      if (width < 760 && route.startsWith('/site/')) { await click('.header-burger-btn'); await sleep(400); }
      const before = await ev('location.href');
      await click('.tpw-header .login,a.user-accounts-text-link'); await wait('!!document.querySelector(".tpw-account-drawer:modal")');
      assert.equal(await ev('location.href'), before);
      assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-account-row h3")].map(n=>n.textContent)'), ['Orders', 'Payment Methods', 'Address', 'Profile']);
      assert.equal(await ev('document.querySelector(".tpw-new-badge").textContent'), 'New');
      assert.equal(await ev('document.querySelector(".tpw-account-caption").textContent'), 'Quarterly totals');
      assert.equal(await ev('document.querySelector(".tpw-account-greeting h3").textContent'), 'Hi, Org 1');
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
      // Data shows TPW's whole Google Sheet, so member accounts don't get the tab (25 Oct 2026).
      assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-member-nav a")].map(n=>n.textContent)'), ['Log data', 'Dashboard', 'Annual report']);
      // The top menu stays TPW's own when signed in; the member links are only in the bar below it.
      assert(await ev('![...document.querySelectorAll(".tpw-header nav a")].some(a => /Log data|Dashboard|Annual report/.test(a.textContent))'));
      const left = await ev('document.querySelector(".tpw-header .logo").getBoundingClientRect().left');
      assert(Math.abs(await ev('document.querySelector("iframe").getBoundingClientRect().left') - left) < 2);
      const frameWidth = await ev('document.querySelector("iframe").getBoundingClientRect().width');
      assert(await ev('document.querySelector("iframe").contentDocument.querySelector(".demo-form").getBoundingClientRect().width') >= frameWidth - 20);
      console.log('PASS original account drawer → Intake, keyboard close/focus, normal page gutters:', width, route);
    }
    // Quarterly totals is the only tab since the Session form was removed (25 Oct 2026).
    assert.deepEqual(await ev('[...document.querySelectorAll("#tabs a")].map(n=>n.textContent)'), ['Quarterly totals']);
    if (width !== 1024) await screenshot(`wide-log-data-${width}`);
    const draft = 'document.querySelector("iframe").contentDocument.querySelector("#organization")';
    await ev(`${draft}.value="SYNTHETIC UNSUBMITTED DRAFT"`);
    await click('.tpw-header .login'); await wait('!!document.querySelector(".tpw-account-drawer:modal")');
    await click('.tpw-account-close'); await wait('!document.querySelector(".tpw-account-drawer").open');
    assert.equal(await ev(`${draft}.value`), 'SYNTHETIC UNSUBMITTED DRAFT');
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
    // Sign out sticks: ?account=org-1 leaves the address and the tabs, or the page signs Org 1 back in.
    assert(await ev('!location.search.includes("account=") && ![...document.querySelectorAll(".tpw-member-nav a")].some(a => /org-1/.test(a.href))'));
    await go('/team-dashboard/#org-1');
    await wait('!!document.querySelector(".participants-chart svg") && !!document.querySelector(".rac-panel")');
    assert.equal(await ev('document.querySelector(".dashboard-heading h1").textContent'), 'Dashboard');
    assert(await ev('document.querySelector(".dashboard-heading").textContent.includes("Live from TPW’s Google Sheet")'));
    assert.deepEqual(await ev('[...document.querySelectorAll(".program-stats strong")].map(n=>n.textContent)'), ['1', '1', '1']);
    assert.equal(await ev('document.querySelector(".chart-latest").textContent'), '5 participants');
    assert.deepEqual(await ev('[...document.querySelectorAll(".rac-total")].map(n=>n.textContent)'), ['40', '$2,360']);
    assert.equal(await ev('document.querySelector(".tpw-member-nav [aria-current]").textContent'), 'Dashboard');
    assert(await ev('!document.querySelector(".overview-sheet") && document.documentElement.scrollWidth<=innerWidth'));
    console.log('PASS original dashboard chart, totals, RAC and savings retained, with source notice:', width);
    if (width !== 1024) await screenshot(`restored-dashboard-${width}`);
    assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-member-nav a")].map(n=>n.textContent)'), ['Log data', 'Dashboard', 'Annual report']);
    assert.equal(await ev('document.querySelector(".tpw-member-nav a[target=_blank]").getAttribute("href").replace(/^.*\\/report\\//, "report/")'), 'report/organizations/org-1-annual-report-2026.pdf');
    // A member who opens Data directly lands on their own Dashboard instead.
    await go('/team-dashboard/raw-data.html#org-1');
    await wait('location.pathname.endsWith("/team-dashboard/") && location.hash === "#org-1" && !!document.querySelector(".participants-chart svg")');
    assert(await ev('!document.querySelector(".overview-sheet")'));
    console.log('PASS members see no Data tab; opening Data directly goes to their Dashboard:', width);
    // The TPW staff view keeps the Data tab.
    await go('/team-dashboard/#tpw'); await wait('!!document.querySelector(".tpw-member-nav a[href*=\\"raw-data.html\\"]")');
    assert.deepEqual(await ev('[...document.querySelectorAll(".tpw-member-nav a")].map(n=>n.textContent)'), ['Log data', 'Dashboard', 'Annual report', 'Data']);
    const beforeRaw = requests.length;
    await click('.tpw-member-nav a[href*="raw-data.html"]'); await wait('!!document.querySelector(".overview-sheet") && !!document.querySelector(".tpw-member-nav [aria-current]")');
    assert.equal(await ev('document.querySelector("h1").textContent'), 'Data');
    assert.equal(await ev('document.querySelector(".tpw-member-nav [aria-current]").textContent'), 'Data');
    assert(await ev('document.querySelector("#sheet-access").textContent.includes("Google Sheet data, embedded")'));
    assert(!requests.slice(beforeRaw).some(url => /dashboard\/js\/main\.js|firestore\.googleapis\.com/.test(url)));
    assert.equal(await ev('document.querySelector(".overview-sheet").src'), 'https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/preview?gid=0');
    assert.equal(await ev('document.querySelector(".sheet-heading a").target'), '_blank');
    assert(await ev('document.querySelector(".sheet-heading a").href.includes("/edit?gid=0#gid=0")'));
    assert(await ev('!document.querySelector("#profile-view,#impact-view,.impact-card")'));
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
    console.log('PASS separate Data Sheet embed and direct link, without dashboard modules:', width);
    await click('.tpw-member-nav a[href*="team-dashboard/#"]');
    await wait('!!document.querySelector(".participants-chart svg")');
  }
  // Signed out, Data also sends people to the Dashboard, which asks them to sign in: no
  // organization's numbers, and nobody is quietly signed in as Org 1 (fixed 25 Oct 2026).
  await ev('sessionStorage.clear()'); await go('/team-dashboard/raw-data.html');
  await wait('location.pathname.endsWith("/team-dashboard/") && document.querySelector("#dashboard-status")?.textContent.includes("Sign in to see")');
  assert(await ev('!document.querySelector(".overview-sheet, .tpw-member-nav a[href*=raw-data]")'));
  await go('/team-dashboard/'); await wait('document.querySelector("#dashboard-status")?.textContent.includes("Sign in to see")');
  assert(await ev('location.pathname.endsWith("/team-dashboard/") && !document.querySelector(".participants-chart svg, .rac-panel")'));
  assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), null);
  assert(await ev('![...document.querySelectorAll(".tpw-member-nav a")].some(a => /org-1/.test(a.href))'));
  await click('#view-sections button'); await wait('!!document.querySelector(".tpw-signin:modal")');
  await go('/members/'); await wait('!!document.querySelector(".tpw-signin:modal")');
  assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), null);
  console.log('PASS signed out: Dashboard and members/ ask to sign in, never Org 1');
  // Signing in on the Dashboard stays on the Dashboard (25 Oct 2026); from TPW's pages it goes to Log data (above).
  await go('/team-dashboard/'); await wait('document.querySelector("#dashboard-status")?.textContent.includes("Sign in to see")');
  await click('#view-sections button'); await wait('!!document.querySelector(".tpw-signin:modal")');
  await click('.tpw-signin-demo button[data-account="tpw"]');
  await wait('location.pathname.endsWith("/team-dashboard/") && location.hash === "#tpw" && !!document.querySelector(".participants-chart svg") && !document.querySelector(".tpw-signin:modal")');
  assert.equal(await ev('sessionStorage.getItem("tpw.member.demo.v1")'), 'tpw');
  console.log('PASS signing in on the Dashboard stays on the Dashboard');
  await go('/team-dashboard/#tpw'); await wait('!!document.querySelector(".participants-chart svg")');
  assert(await ev('!!document.querySelector(".rac-panel")'));
  // The printable roster, scanner and packet reader were removed (25 Oct 2026); old links land on Log data.
  for (const page of ['sheet', 'scan', 'upload']) { await go(`/intake/${page}.html`); await wait('location.pathname.endsWith("/intake/simple.html")'); }
  assert(requests.some(url => /dashboard\/js\/main\.js/.test(url)));
  assert(!requests.some(url => /firestore\.googleapis\.com/.test(url)));
  assert.deepEqual(submissions, []); assert.deepEqual(exceptions, []);
  console.log('PASS default and coalition dashboard routes, removed pages redirect, no exceptions, zero live submissions.');
} finally {
  socket?.close(); chrome.kill();
  await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 3000); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
