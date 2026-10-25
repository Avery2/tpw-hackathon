// The page side of the dashboards: assets/dashboard-source.js. It reads TPW's Google Sheet
// through the receiver and adds the made-up sample organizations. The form's last-quarter
// prefill uses the same loader, so these tests also prove prefill comes from the sheet.
// Plain Node, no packages: the receiver is replaced by a stand-in that records each request.
//
//   node --test team-form/test/dashboard-source.mjs

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sampleFile = JSON.parse(fs.readFileSync(path.join(root, 'data/demo/dashboard-sample.json'), 'utf8'));
const RECEIVER = 'https://script.google.com/macros/s/TEST/exec';

let requests, sheetReply;
globalThis.window = {};
globalThis.fetch = async (url) => {
  const address = new URL(String(url));
  if (address.protocol === 'file:') {
    return new Response(fs.readFileSync(fileURLToPath(address)), { headers: { 'Content-Type': 'application/json' } });
  }
  requests.push(address);
  const reply = typeof sheetReply === 'function' ? sheetReply(address) : sheetReply;
  return new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } });
};

const { loadDashboard } = await import('../../assets/dashboard-source.js');
const dashboardData = await import('../../dashboard/js/data.js');
const teamDashboardData = await import('../../team-dashboard/js/data.js');
const { lastQuarterDraft } = await import('../js/last-quarter.js');

const sheetSubmission = (over = {}) => ({
  id: 'REF00001', organization: 'Org 1', orgId: 'org-1', submittedAt: '2026-11-03T18:00:00.000Z',
  reportingPeriod: { quarter: 4, year: 2026 }, previousSubmissionId: '',
  prisons: [{ code: 'SQ', name: 'San Quentin Rehabilitation Center (SQ)', yards: ['North', 'South'] }],
  programs: [{ id: 'new-prog', name: 'New From The Sheet', status: 'Completed', startDate: '2026-10-01', endDate: '2026-10-20',
    courseHours: 20, notes: '', participants: 15, participantsCompleted: 13, assignments: [{ code: 'SQ', yards: ['North', 'South'] }] }],
  ...over
});

beforeEach(() => {
  requests = [];
  window.TPW_BACKEND_URL = RECEIVER;
  sheetReply = { ok: true, orgs: [{ id: 'org-1', name: 'Org 1' }], submissions: [sheetSubmission()] };
});

test('the TPW view asks the sheet for everyone, and adds the sample organizations', async () => {
  const data = await loadDashboard(null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].origin + requests[0].pathname, RECEIVER);
  assert.equal(requests[0].searchParams.get('view'), 'dashboard');
  assert.equal(requests[0].searchParams.get('org'), null);
  assert.equal(data.org, null);
  assert.equal(data.submissions.length, sampleFile.submissions.length + 1);
  const fromSheet = data.submissions.filter((s) => s.id === 'REF00001');
  assert.equal(fromSheet.length, 1);
  assert.equal(fromSheet[0].synthetic, false, 'real submissions are never badged as sample data');
  assert.ok(data.submissions.filter((s) => s.id !== 'REF00001').every((s) => s.synthetic === true), 'every sample submission is badged');
  assert.deepEqual(data.orgs.map((o) => o.id), ['org-1', 'org-2'], 'Org 1 from the sheet is the same organization as the sample Org 1');
});

test('sheet rows marked as test data get the Sample data badge; real ones never do', async () => {
  sheetReply = { ok: true, orgs: [], submissions: [sheetSubmission({ testData: true }), sheetSubmission({ id: 'REF00002', testData: false }), sheetSubmission({ id: 'REF00003' })] };
  const data = await loadDashboard(null);
  const badge = (id) => data.submissions.find((s) => s.id === id).synthetic;
  assert.equal(badge('REF00001'), true);
  assert.equal(badge('REF00002'), false);
  assert.equal(badge('REF00003'), false, 'missing means real, not test');
});

test('one organization\'s view asks the sheet for that organization only, by ID and name', async () => {
  const data = await loadDashboard('org-2');
  assert.equal(requests[0].searchParams.get('org'), 'org-2');
  assert.equal(requests[0].searchParams.get('name'), 'Org 2');
  assert.equal(data.org.id, 'org-2');
  assert.ok(data.submissions.every((s) => s.orgId === 'org-2'));
});

test('another organization\'s rows are dropped even if the sheet sends them by mistake', async () => {
  sheetReply = { ok: true, orgs: [], submissions: [sheetSubmission(), sheetSubmission({ id: 'REF00002', orgId: 'org-2', organization: 'Org 2' })] };
  const data = await loadDashboard('org-2');
  assert.ok(!data.submissions.some((s) => s.id === 'REF00001'));
  assert.ok(data.submissions.some((s) => s.id === 'REF00002'));
});

test('a filing from before organization IDs is matched to its organization by name', async () => {
  sheetReply = { ok: true, orgs: [{ id: '', name: 'Org 1' }], submissions: [sheetSubmission({ orgId: '' })] };
  const tpw = await loadDashboard(null);
  assert.equal(tpw.submissions.find((s) => s.id === 'REF00001').orgId, 'org-1');
  const own = await loadDashboard('org-1');
  assert.ok(own.submissions.some((s) => s.id === 'REF00001'));
});

test('if the sheet can\'t be read, the dashboard is told why instead of showing sample data as if it were everything', async () => {
  sheetReply = { ok: false, errors: ['The dashboard couldn’t read TPW’s sheet. Please try again in a minute.'] };
  await assert.rejects(loadDashboard(null), /couldn’t read TPW’s sheet/);
  await assert.rejects(loadDashboard('org-1'), /couldn’t read TPW’s sheet/);
});

test('with no back-end address set, only the sample data shows and nothing is requested', async () => {
  window.TPW_BACKEND_URL = '   ';
  const data = await loadDashboard(null);
  assert.equal(requests.length, 0);
  assert.equal(data.submissions.length, sampleFile.submissions.length);
});

test('an organization with no profile is an error, as before', async () => {
  await assert.rejects(loadDashboard('org-99'), /not found/);
});

test('both dashboards use this loader, so neither can drift back to Firebase', async () => {
  assert.equal(dashboardData.loadDashboard, loadDashboard);
  assert.equal(teamDashboardData.loadDashboard, loadDashboard);
});

test('the form\'s last-quarter prefill comes from the sheet: a program filed in the sheet is carried forward', async () => {
  const draft = lastQuarterDraft(await loadDashboard('org-1'), new Date('2027-01-15T12:00:00Z'));
  assert.equal(requests.length, 1, 'prefill read the sheet');
  const carried = draft.programs.find((p) => p.name === 'New From The Sheet');
  assert.ok(carried, `prefill didn't include the sheet's program; got ${draft.programs.map((p) => p.name).join(', ')}`);
  assert.equal(carried.id, 'new-prog');
  assert.deepEqual(carried.assignments, [{ code: 'SQ', yards: ['North', 'South'] }]);
  assert.equal(draft.previousSubmissionId, 'REF00001', 'the sheet\'s newest submission is the one carried forward from');
  const value = (key) => Object.entries(carried.values).find(([name]) => name.endsWith(`[${key}]`))?.[1];
  assert.equal(value('program_name'), 'New From The Sheet');
  assert.equal(value('participants'), '0', 'numbers start at zero each quarter');
  assert.equal(value('participants_completed'), '0');
  assert.deepEqual(draft.reportingPeriod, { quarter: 1, year: 2027 });
});

test('no page in the site still loads Firebase', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'site', 'node_modules', 'docs'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|html)$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)) {
        const text = fs.readFileSync(full, 'utf8');
        if (/firebasejs|firestoreClient|getFirestore|firebaseapp\.com/.test(text)) offenders.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
