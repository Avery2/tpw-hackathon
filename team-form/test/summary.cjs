// No Google calls. Checks the dashboard summary (GET ?view=summary): combined
// figures only, later filings replace earlier counts, and no names ever leave.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(root, 'team-form/receiver/Code.gs'), 'utf8');
const TAB = 'Submissions; comes from website form DO NOT RENAME';
const HEAD = ['CDCR Facility', 'Yard', 'Organization Name', 'Program Name', 'Schedule Status (Planned, In Progress, Completed)',
  'Start Date', 'End Date', 'Total Programming hours', 'Number of Participants', 'Number of Participants Completed',
  'CALC: Total Participant Programming hours (Participants Completed * Total Programming Hours', 'CALC: Program Year (Year of Program Start Date)',
  'Notes', 'Submission ID', 'Submitted At', 'Submitted By', 'Sign-in Checked', 'Reporting Quarter', 'Additional data (JSON)'];
const row = (facility, yard, org, program, start, hours, participants, completed, submission, at) =>
  [facility, yard, org, program, 'Completed', start, '', String(hours), String(participants), String(completed), '', '', '', submission, at, '', 'No', '2026 Q4', '{}'];
// Every name is SYNTHETIC test data.
const SHEET = [HEAD,
  row('San Quentin Rehabilitation Center (SQ)', 'North', 'SYNTHETIC Org A', 'SYNTHETIC Circle', '2026-01-10', 52, 10, 4, 'AAAA0001', '2026-03-01T00:00:00.000Z'),
  row('San Quentin Rehabilitation Center (SQ)', 'South', 'SYNTHETIC Org A', 'SYNTHETIC Circle', '2026-01-10', 52, 6, 6, 'AAAA0001', '2026-03-01T00:00:00.000Z'),
  // A later filing for the same program and yard replaces the earlier counts (10 → 12).
  row('San Quentin Rehabilitation Center (SQ)', 'North', 'SYNTHETIC Org A', 'SYNTHETIC Circle', '2026-01-10', 52, 12, 5, 'AAAA0002', '2026-06-01T00:00:00.000Z'),
  row('Folsom State Prison (FSP)', 'A Yard', 'SYNTHETIC Org B', 'SYNTHETIC Art', '4/2/2026', 104, 1, 1, 'BBBB0001', '2026-04-05T00:00:00.000Z'),
  row('Folsom State Prison (FSP)', 'B Yard', 'SYNTHETIC Org B', 'SYNTHETIC Art', '4/2/2026', 104, '1,000', 'x', 'BBBB0001', '2026-04-05T00:00:00.000Z'),
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
];
function harness(values = SHEET, options = {}) {
  const cache = new Map(); let reads = 0;
  const ctx = vm.createContext({
    console: {error() {}}, TAB,
    spreadsheetId_: () => 'test-master', submissionRange_: cells => "'" + TAB + "'!" + cells,
    CacheService: {getScriptCache: () => ({get: key => cache.get(key) || null, put: (key, value, seconds) => {assert.equal(seconds, 300); cache.set(key, value);}})},
    Sheets: {Spreadsheets: {Values: {get: (id, range) => {
      assert.equal(id, 'test-master'); assert.equal(range, "'" + TAB + "'!A:ZZ"); reads++;
      if (options.fails) throw Error('Sheets offline');
      return {values: JSON.parse(JSON.stringify(values))};
    }}}},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({text, setMimeType() { return this; }})}
  });
  vm.runInContext(code, ctx);
  return {get: parameter => JSON.parse(ctx.doGet(parameter === undefined ? undefined : {parameter}).text), reads: () => reads};
}
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };

test('plain GET still returns the form capabilities', () => {
  const h = harness();
  for (const reply of [h.get(), h.get({})]) { assert.equal(reply.ok, true); assert.equal(reply.formVersion, 2); assert.equal(reply.summary, undefined); }
  assert.equal(h.reads(), 0);
});

test('summary combines figures; later filings replace earlier counts', () => {
  const s = harness().get({view: 'summary'}).summary;
  assert.equal(s.submissions, 3);
  assert.equal(s.programs, 2);
  assert.equal(s.facilities, 2);
  // Org A: North 12 (replaced 10) + South 6; Org B: 1 + 1,000.
  assert.equal(s.participants, 12 + 6 + 1 + 1000);
  // Completions never exceed participants; unreadable counts count as zero.
  assert.equal(s.completed, 5 + 6 + 1 + 0);
  assert.equal(s.hoursCompleted, 52 * 11 + 104 * 1);
  assert.deepEqual(s.racInputs, [{courseHours: 52, completed: 11}, {courseHours: 104, completed: 1}]);
  assert.deepEqual(s.history, [{day: '2026-01-01', participants: 18}, {day: '2026-04-01', participants: 1019}]);
  assert.match(s.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('no organization names, program names, prisons or IDs leave the script', () => {
  const text = JSON.stringify(harness().get({view: 'summary'}));
  for (const secret of ['SYNTHETIC', 'Org A', 'Circle', 'San Quentin', 'Folsom', 'North', 'AAAA0001', 'BBBB0001']) assert(!text.includes(secret), secret);
});

test('summary is cached for five minutes', () => {
  const h = harness();
  h.get({view: 'summary'}); h.get({view: 'summary'});
  assert.equal(h.reads(), 1);
});

test('missing headings or a Sheet error fail plainly, without detail', () => {
  const broken = harness([HEAD.filter(name => name !== 'Number of Participants')]).get({view: 'summary'});
  assert.equal(broken.ok, false); assert.match(broken.errors[0], /could not be read/);
  const offline = harness(SHEET, {fails: true}).get({view: 'summary'});
  assert.equal(offline.ok, false); assert(!JSON.stringify(offline).includes('offline'));
});

test('an empty Sheet gives zeros, not an error', () => {
  const s = harness([HEAD]).get({view: 'summary'}).summary;
  assert.deepEqual([s.submissions, s.programs, s.facilities, s.participants, s.completed, s.hoursCompleted], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.history, []); assert.deepEqual(s.racInputs, []);
});

console.log(`${passed} dashboard summary checks passed; zero Google calls.`);
