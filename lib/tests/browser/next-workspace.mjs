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
    if (endpoint === 'submissions' && route.request().method() === 'GET') {
      assert.equal(url.searchParams.get('org'), org.id);
      if (url.searchParams.get('detail')) return route.fulfill({ json: { programs: [] } });
      return route.fulfill({ json: {
        count: 1, total: 1, page: 1, pages: 1, offset: 0,
        items: [{
          key: '["org-2",2026,1]', organization: org.name,
          reportingPeriod: { year: 2026, quarter: 1, inferred: false },
          submittedAt: '2026-02-01T00:00:00.000Z',
          metrics: { programs: 1, participants: 0, completed: 0, hours: 0 }, facilities: 1
        }],
        totals: { programs: 1, participants: 0, completed: 0, hours: 0 },
        years: [2026]
      } });
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
    await page.goto(base + '/team-dashboard/#org-2');
    await page.locator('nav[aria-label="Main navigation"] [aria-current]').waitFor();
    await checkPublicLinks();
    const nav = mainNav();
    const portal = nav.getByRole('link', { name: 'Member Portal', exact: true });
    assert.equal(await portal.getAttribute('href'), '/team-dashboard/member-portal/#org-2');
    assert.equal(await portal.getAttribute('aria-current'), 'location');
    assert.equal(await nav.locator('[aria-current]').count(), 1, 'only the portal marks your location');
    assert((await portal.evaluate(link => getComputedStyle(link).textDecorationLine)).includes('underline'), 'the active portal is underlined');
    assert.equal(await page.getByRole('dialog').count(), 0, 'no side drawer: the portal is a page');
  }
  async function checkPortalPage() {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await mainNav().getByRole('link', { name: 'Member Portal', exact: true }).click();
    await page.waitForURL('**/team-dashboard/member-portal/**');
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Member Portal' }).isVisible(), true);
    for (const id of ['initiatives', 'resources', 'announcements', 'help']) {
      assert.equal(await page.locator('#' + id).isVisible(), true, id);
    }
    assert.equal(await page.locator('#resources a').count() >= 5, true, 'resource links are present');
    assert.equal(await page.getByRole('link', { name: /membership@thetpw\.org/ }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Sign out' }).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: 'AB 581 Clearance Reporting Form' }).getAttribute('href'), 'https://forms.gle/6V48HgrJC8e3Xqja7');
    await page.setViewportSize({ width: 390, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'portal reflows on a phone');
    await page.setViewportSize({ width: 1280, height: 1000 });
    assert.equal(await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Portal' }).getAttribute('aria-current'), 'page');
    await page.goto(base + '/log-data/?account=org-2');
    await page.getByRole('heading', { name: 'Reporting period', exact: true }).waitFor();
  }
  for (const width of [1280, 390]) await checkSignedInHeader(width);
  await checkPortalPage();
  // One page: no chooser, and every section is visible from the start.
  assert.equal(await page.getByRole('button', { name: 'Use previous entries' }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'What would you like to do?' }).count(), 0);
  await page.getByRole('heading', { name: 'Reporting period', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Facilities and yards', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Programs', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Submit', exact: true }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  const facilityYards = page.locator('#facility-rows');
  const assignment = page.locator('.assignment-row');
  await page.locator('#facilities select').selectOption('CCI');
  await facilityYards.getByRole('checkbox', { name: 'A Yard', exact: true }).check();
  await page.getByLabel('Program name').fill('Browser test program');
  await assignment.getByRole('checkbox').first().check();
  assert.equal(await assignment.getByRole('checkbox', { name: 'A Yard', exact: true }).isChecked(), false);
  await assignment.getByRole('checkbox', { name: 'A Yard', exact: true }).check();
  await page.getByLabel('Schedule status').selectOption('Planned');
  // Numbers are required now, so enter an explicit 0 for each.
  await page.getByLabel('Participants enrolled', { exact: true }).fill('0');
  await page.getByLabel('Completed', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Done with program' }).click();
  await page.getByRole('button', { name: 'Finish and submit' }).click();
  await page.getByText(/Submitted to TPW. Reference/).waitFor();
  await page.reload();
  await page.getByText(/Submitted to TPW. Reference/).waitFor();
  await page.getByRole('button', { name: 'Start a new submission' }).click();
  await page.getByRole('heading', { name: 'Reporting period', exact: true }).waitFor();
  // Submissions shows the member's history directly, with no chooser in the way.
  await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Submissions' }).click();
  await page.waitForURL('**/team-dashboard/submissions/**');
  await page.getByRole('heading', { name: 'Your submission history' }).waitFor();
  await page.getByText('1 of 1 submissions').waitFor();
  assert.equal(await page.getByRole('link', { name: 'View your data' }).count(), 0);
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
  console.log('PASS: TPW website links, Member Portal as a tab with content, no side drawer, desktop/mobile header, dense single-page Log data, inline submission history, and the embedded annual report.');
} finally {
  await browser.close();
}
