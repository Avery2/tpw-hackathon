import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TPW_BROWSER_URL || 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
try {
  const page = await browser.newPage();
  const org = { id: 'org-2', name: 'Org 2' };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/\/$/, '').split('/').at(-1);
    if (endpoint === 'dashboard') {
      assert.equal(url.searchParams.get('org'), org.id);
      return route.fulfill({ json: { org, orgs: [org], submissions: [] } });
    }
    if (endpoint === 'programs') {
      assert.equal(url.searchParams.get('org'), org.id);
      return route.fulfill({ json: { items: [], count: 0, total: 0, offset: 0, page: 1, pages: 1 } });
    }
    if (endpoint === 'submissions' && route.request().method() === 'POST') {
      const { id, submission } = route.request().postDataJSON();
      assert.equal(submission.orgId, org.id);
      assert.equal(submission.programs[0].sites[0].participants, 0);
      return route.fulfill({ json: { id } });
    }
    return route.abort();
  });

  for (const oldPath of ['/dashboard/', '/intake/simple.html/', '/team-dashboard/programs.html/', '/form-demo/']) {
    assert.equal((await page.request.get(base + oldPath)).status(), 404, oldPath);
  }
  await page.goto(base + '/');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/sign-in/');
  const websiteLinks = [
    ['Our Members', 'https://www.thetpw.org/our-members'],
    ['Our Story', 'https://www.thetpw.org/ourstory'],
    ['Our Work', 'https://www.thetpw.org/ourwork'],
    ['Our Team', 'https://www.thetpw.org/our-team'],
  ];
  async function checkHeader(destination) {
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    for (const [label, href] of websiteLinks) {
      const link = nav.getByRole('link', { name: label, exact: true });
      assert.equal(await link.getAttribute('href'), href);
      assert.equal(await link.getAttribute('aria-current'), null);
      assert(await link.isVisible());
    }
    assert.equal(await page.getByRole('link', { name: 'TPW home', exact: true }).getAttribute('href'), 'https://www.thetpw.org/');
    const tools = nav.getByRole('link', { name: 'Member tools', exact: true });
    assert.equal(await tools.getAttribute('href'), destination);
    assert.equal(await tools.getAttribute('aria-current'), 'location');
    assert.equal(await nav.locator('[aria-current]').count(), 1);
    assert((await tools.evaluate(link => getComputedStyle(link).textDecorationLine)).includes('underline'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await checkHeader('/sign-in/');
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  assert.equal((await page.request.get(base + '/accept-invite/?id=00000000-0000-4000-8000-000000000000')).status(), 200);
  assert.equal((await page.request.get(base + '/accept-invite/')).status(), 404);

  await page.goto(base + '/team-dashboard/#org-2');
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  await page.locator('.tpw-header').evaluate(header => { header.dataset.browserTest = 'retained'; });
  await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Programs' }).click();
  await page.getByText('No programs have been submitted yet.').waitFor();
  assert.equal(new URL(page.url()).pathname, '/team-dashboard/programs/');
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await checkHeader('/team-dashboard/#org-2');
  await page.goBack();
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Member tools', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#org-2');
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await page.getByRole('link', { name: 'Log data' }).click();
  await page.waitForURL('**/log-data/?account=org-2');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await checkHeader('/team-dashboard/#org-2');
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('dialog', { name: 'Account', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Use previous entries' }).click();
  await page.getByRole('heading', { name: 'Which quarter are you reporting for?' }).waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#facilities-step').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByLabel('Add a facility').selectOption('CCI');
  await page.getByRole('checkbox', { name: 'A Yard', exact: true }).check();
  await page.getByRole('button', { name: 'Continue to programs', exact: true }).click();
  await page.getByLabel('Program name').fill('Browser test program');
  await page.locator('.assignment-row').getByRole('checkbox').first().check();
  assert.equal(await page.getByRole('checkbox', { name: 'A Yard', exact: true }).isChecked(), false);
  await page.getByRole('checkbox', { name: 'A Yard', exact: true }).check();
  await page.getByLabel('Schedule Status').selectOption('Planned');
  await page.getByRole('button', { name: 'Done with program' }).click();
  await page.getByRole('button', { name: 'Finish and submit' }).click();
  await page.getByText(/Submitted to TPW. Reference/).waitFor();
  await page.reload();
  await page.getByText(/Submitted to TPW. Reference/).waitFor();
  await page.getByRole('button', { name: 'Start a new submission' }).click();
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  await page.getByRole('link', { name: 'Log data' }).click();
  await page.getByRole('button', { name: 'Use previous entries' }).click();
  await page.getByRole('heading', { name: 'Which quarter are you reporting for?' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: TPW website links, active Member tools underline, desktop/mobile header, account drawer, Programs navigation, back, and scoped Log Data quarter selection.');
} finally {
  await browser.close();
}
