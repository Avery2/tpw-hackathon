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

  await page.goto(base + '/team-dashboard/#org-2');
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  await page.locator('.tpw-header').evaluate(header => { header.dataset.browserTest = 'retained'; });
  await page.getByRole('navigation', { name: 'Member navigation' }).getByRole('link', { name: 'Programs' }).click();
  await page.getByText('No programs have been submitted yet.').waitFor();
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await page.goBack();
  await page.locator('#profile-heading').filter({ hasText: 'Org 2' }).waitFor();
  assert.equal(await page.locator('.tpw-header').getAttribute('data-browser-test'), 'retained');
  await page.getByRole('link', { name: 'Log data' }).click();
  await page.getByRole('button', { name: 'Use previous entries' }).click();
  await page.getByRole('heading', { name: 'Which quarter are you reporting for?' }).waitFor();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.locator('#facilities-step').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByLabel('Add a facility').selectOption('CCI');
  await page.getByRole('checkbox', { name: 'A Yard', exact: true }).check();
  await page.getByRole('button', { name: 'Continue to programs →' }).click();
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
  console.log('PASS: shared header, Programs navigation, back, and scoped Log Data quarter selection.');
} finally {
  await browser.close();
}
