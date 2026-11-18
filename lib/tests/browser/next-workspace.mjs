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
  function mainNav() { return page.getByRole('navigation', { name: 'Main navigation', exact: true }); }
  async function checkPublicLinks() {
    const nav = mainNav();
    for (const [label, href] of websiteLinks) {
      const link = nav.getByRole('link', { name: label, exact: true });
      assert.equal(await link.getAttribute('href'), href);
      assert.equal(await link.getAttribute('aria-current'), null);
      assert(await link.isVisible());
    }
    assert.equal(await page.getByRole('link', { name: 'TPW home', exact: true }).getAttribute('href'), 'https://www.thetpw.org/');
    assert.equal(await nav.getByRole('link', { name: 'Account', exact: true }).count(), 0, 'there is no separate Account entry');
    assert.equal(await nav.locator('a.login, button.login').count(), 1, 'one member entry point');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  async function checkSignedOutHeader() {
    await checkPublicLinks();
    const nav = mainNav();
    const portal = nav.getByRole('link', { name: 'Member Portal', exact: true });
    assert.equal(await portal.getAttribute('href'), '/sign-in/');
    assert.equal(await nav.locator('[aria-current]').count(), 0);
    assert.equal((await portal.evaluate(link => getComputedStyle(link).textDecorationLine)).includes('underline'), false);
  }
  async function checkSignedInHeader(width) {
    await page.setViewportSize({ width, height: 1000 });
    await checkPublicLinks();
    const nav = mainNav();
    const portal = nav.getByRole('button', { name: 'Member Portal', exact: true });
    assert.equal(await portal.getAttribute('aria-current'), 'location');
    assert.equal(await nav.locator('[aria-current]').count(), 1, 'only the portal marks your location');
    assert((await portal.evaluate(button => getComputedStyle(button).textDecorationLine)).includes('underline'), 'the active portal is underlined');
    await portal.click();
    const drawer = page.getByRole('dialog', { name: 'Member Portal', exact: true });
    await drawer.waitFor();
    const links = drawer.getByRole('navigation', { name: 'Member portal' }).getByRole('link');
    assert.deepEqual(await links.allTextContents().then(items => items.map(text => text.replace(/→\s*$/, '').trim())),
      ['Log data', 'Overview', 'Programs', 'Submissions', 'Annual report']);
    assert(await drawer.getByRole('link', { name: /membership@thetpw\.org/ }).isVisible());
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await drawer.isVisible(), false);
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await checkSignedOutHeader();
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  assert.equal((await page.request.get(base + '/accept-invite/?id=00000000-0000-4000-8000-000000000000')).status(), 200);
  assert.equal((await page.request.get(base + '/accept-invite/')).status(), 404);

  await page.goto(base + '/team-dashboard/#org-2');
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  await page.locator('.tpw-header').evaluate(header => { header.dataset.browserTest = 'retained'; });
  assert.equal(await page.getByRole('button', { name: /Export program history/ }).isVisible(), false, 'exports are not the first thing above the data');
  await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Programs' }).click();
  await page.getByText('No programs have been submitted yet.').waitFor();
  assert.equal(new URL(page.url()).pathname, '/team-dashboard/programs/');
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  const exportSummary = page.getByText('Download your data', { exact: true });
  assert.equal(await exportSummary.isVisible(), true);
  assert.equal(await page.getByRole('button', { name: /Export program history/ }).isVisible(), false);
  await exportSummary.click();
  assert.equal(await page.getByRole('button', { name: /Export program history/ }).isVisible(), true);
  await exportSummary.click();
  await page.goBack();
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await page.getByRole('link', { name: 'Log data' }).click();
  await page.waitForURL('**/log-data/?account=org-2');
  for (const width of [1280, 390]) await checkSignedInHeader(width);
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
  // The annual report is a tab with the PDF in the page, not an off-site link.
  await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Annual report' }).click();
  await page.waitForURL('**/team-dashboard/annual-report/**');
  assert.equal(await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Annual report' }).getAttribute('aria-current'), 'page');
  const pdf = page.locator('object[type="application/pdf"]');
  assert.equal(await pdf.count(), 1);
  assert.equal(await pdf.getAttribute('data'), '/report/organizations/org-2-annual-report-2026.pdf');
  assert.equal(await page.getByRole('link', { name: 'Download the PDF' }).getAttribute('href'), '/report/organizations/org-2-annual-report-2026.pdf');
  await page.setViewportSize({ width: 390, height: 1000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'annual report reflows at 390px');
  assert.deepEqual(errors, []);
  console.log('PASS: TPW website links, one Member Portal entry with active underline and portal drawer, desktop/mobile header, Programs navigation, back, and scoped Log Data quarter selection.');
} finally {
  await browser.close();
}
