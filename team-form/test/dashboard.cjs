// The dashboard read (receiver/Dashboard.gs), tested as a round trip through the real
// receiver: a submission goes in through Code.gs / Rows.gs / Sheet.gs into a pretend sheet,
// and comes back out through ?view=dashboard. Plain Node, no packages, no Google.
//
//   node team-form/test/dashboard.cjs

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');

const RECEIVER = path.resolve(__dirname, '../receiver');
const FILES = ['Rows.gs', 'Session.gs', 'Sheet.gs', 'Code.gs', 'Dashboard.gs'];
const TAB = 'Submissions; comes from website form DO NOT RENAME';
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---- a pretend Google Sheet, one tab, that behaves like the real one where it matters ----
const colIndex = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
// What a typed (USER_ENTERED) value becomes when read back UNFORMATTED with SERIAL_NUMBER dates.
function readBack(cell) {
  if (typeof cell !== 'string') return cell;
  if (cell.startsWith("'")) return cell.slice(1);
  const iso = cell.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return (Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) - SERIAL_EPOCH) / 86400000;
  if (/^-?\d+(\.\d+)?$/.test(cell)) return Number(cell);
  return cell;
}

function makeReceiver({ props = {}, session = null, clock = '2026-11-03T18:00:00Z', failRead = false } = {}) {
  const grid = [];
  let columnCount = 26;
  const reads = [];
  const sheetName = (range) => range.slice(0, range.lastIndexOf('!')).replace(/^'|'$/g, '').replace(/''/g, "'");
  const cellsOf = (range) => range.slice(range.lastIndexOf('!') + 1);
  const writeAt = (a1, values) => {
    const m = a1.match(/^([A-Z]+)(\d+)$/);
    const c0 = colIndex(m[1]); const r0 = +m[2] - 1;
    values.forEach((row, i) => { grid[r0 + i] = grid[r0 + i] || []; row.forEach((v, j) => { grid[r0 + i][c0 + j] = v; }); });
  };
  const Sheets = { Spreadsheets: {
    get: () => ({ sheets: [{ properties: { title: TAB, sheetId: 7, gridProperties: { columnCount } } }] }),
    batchUpdate: (body) => { for (const r of body.requests) if (r.appendDimension) columnCount += r.appendDimension.length; },
    Values: {
      get: (id, range, options) => {
        assert.equal(sheetName(range), TAB, 'every read is from the website-submissions tab');
        if (failRead && /A:ZZ$/.test(range)) throw new Error('Service Spreadsheets timed out');
        const cells = cellsOf(range);
        reads.push({ cells, options: options && plain(options) });
        const width = Math.max(0, ...grid.map((r) => (r ? r.length : 0)));
        const full = grid.map((r) => Array.from({ length: width }, (_, i) => (r && r[i] !== undefined ? r[i] : '')));
        if (cells === 'A1:A1') return grid[0] ? { values: [[grid[0][0]]] } : {};
        if (cells === '1:1') return grid[0] ? { values: [full[0]] } : {};
        if (/^[A-Z]+2:[A-Z]+$/.test(cells)) { const c = colIndex(cells.match(/^[A-Z]+/)[0]); return { values: full.slice(1).map((r) => [r[c]]) }; }
        if (cells === 'A:ZZ') {
          assert.deepEqual(plain(options), { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
          return { values: full.map((r) => r.map(readBack)) };
        }
        throw new Error('test sheet: unexpected range ' + range);
      },
      update: (body, id, range) => writeAt(cellsOf(range), body.values),
      append: (body) => { for (const row of body.values) grid.push([...row]); }
    }
  } };
  const cache = new Map();
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return Date.parse(clock); } }
  const context = vm.createContext({
    Date: Clock, console: { error() {}, log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ SPREADSHEET_ID: 'sheet-1', ALLOW_UNSIGNED: 'true', ...props })[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (date, zone, format) => {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit' }).formatToParts(date);
        return format === 'yyyy-MM' ? `${p.find((v) => v.type === 'year').value}-${p.find((v) => v.type === 'month').value}` : String(date);
      }
    },
    Sheets
  });
  for (const file of FILES) vm.runInContext(fs.readFileSync(path.join(RECEIVER, file), 'utf8'), context, { filename: file });
  if (session) context.getSession_ = () => session;
  const post = (payload, token = '') => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token, payload }) } }).text);
  const get = (parameter = {}) => JSON.parse(context.doGet({ parameter }).text);
  return { context, grid, reads, post, get };
}

const site = (facilityCode, yard, participants, completed) => ({ facilityCode, yard, participants, completed });
const program = (over = {}) => ({ id: 'prog-a', name: 'Restorative Circle', notes: '', status: 'Completed', startDate: '2026-10-01', endDate: '2026-10-20', courseHours: 20,
  sites: [site('SQ', 'North', 10, 8), site('SQ', 'South', 5, 5), site('FSP', 'A Yard', 12, 0)], ...over });
const payload = (over = {}) => ({ submissionId: crypto.randomUUID(), organization: 'Org 1', orgId: 'org-1', previousSubmissionId: '',
  reportingPeriod: { quarter: 4, year: 2026 }, programs: [program()], ...over });

// ------------------------------------------------------------------------------------------

test('a submission comes back out exactly as the dashboard expects it', () => {
  const r = makeReceiver();
  const receipt = r.post(payload({ programs: [program({ notes: 'Two new facilitators' }), program({ id: 'prog-b', name: 'Peer Mentoring', status: 'In Progress', endDate: '', courseHours: 2.5, sites: [site('CIW', 'C Yard', 6, 0)] })] }));
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  const view = r.get({ view: 'dashboard' });
  assert.equal(view.ok, true);
  assert.equal(view.submissions.length, 1);
  const [s] = view.submissions;
  assert.equal(s.id, receipt.submissionId, 'the dashboard uses the same reference as the receipt');
  assert.equal(s.organization, 'Org 1');
  assert.equal(s.orgId, 'org-1');
  assert.deepEqual(s.reportingPeriod, { quarter: 4, year: 2026 });
  assert.equal(s.submittedAt, '2026-11-03T18:00:00.000Z');
  assert.deepEqual(plain(s.programs), [
    { name: 'Restorative Circle', status: 'Completed', startDate: '2026-10-01', endDate: '2026-10-20', courseHours: 20, notes: 'Two new facilitators',
      participants: 27, participantsCompleted: 13, assignments: [{ code: 'SQ', yards: ['North', 'South'] }, { code: 'FSP', yards: ['A Yard'] }], id: 'prog-a' },
    { name: 'Peer Mentoring', status: 'In Progress', startDate: '2026-10-01', endDate: '', courseHours: 2.5, notes: '',
      participants: 6, participantsCompleted: 0, assignments: [{ code: 'CIW', yards: ['C Yard'] }], id: 'prog-b' }
  ]);
  assert.deepEqual(plain(s.prisons), [
    { code: 'SQ', name: 'San Quentin Rehabilitation Center (SQ)', yards: ['North', 'South'] },
    { code: 'FSP', name: 'Folsom State Prison (FSP)', yards: ['A Yard'] },
    { code: 'CIW', name: 'California Institution for Women (CIW)', yards: ['C Yard'] }
  ]);
  assert.deepEqual(plain(view.orgs), [{ id: 'org-1', name: 'Org 1' }]);
});

test('participants are added up per program, never counted twice across yards or programs', () => {
  const r = makeReceiver();
  r.post(payload());
  r.post(payload({ organization: 'Org 2', orgId: 'org-2', programs: [program({ sites: [site('SQ', 'North', 3, 3)] })] }));
  const { submissions } = r.get({ view: 'dashboard' });
  assert.deepEqual(submissions.map((s) => s.programs.map((p) => [p.participants, p.participantsCompleted])), [[[27, 13]], [[3, 3]]]);
});

test('each submission stays separate, in the order it arrived, even with the same program name', () => {
  const r = makeReceiver();
  const first = r.post(payload());
  const second = r.post(payload({ programs: [program({ sites: [site('SQ', 'North', 1, 1)] })] }));
  const { submissions } = r.get({ view: 'dashboard' });
  assert.deepEqual(submissions.map((s) => s.id), [first.submissionId, second.submissionId]);
  assert.equal(submissions[1].programs[0].participants, 1);
});

test('one organization\'s view gets only its own submissions', () => {
  const r = makeReceiver();
  r.post(payload());
  r.post(payload({ organization: 'Org 2', orgId: 'org-2' }));
  r.post(payload({ organization: 'Old Name Org', orgId: undefined }));
  assert.deepEqual(r.get({ view: 'dashboard', org: 'org-1', name: 'Org 1' }).submissions.map((s) => s.organization), ['Org 1']);
  assert.deepEqual(r.get({ view: 'dashboard', org: 'org-2', name: 'Org 2' }).submissions.map((s) => s.organization), ['Org 2']);
  assert.deepEqual(r.get({ view: 'dashboard', org: 'org-9', name: 'old name org' }).submissions.map((s) => s.organization), ['Old Name Org'],
    'filings made before IDs existed are matched by name, ignoring case');
  assert.deepEqual(r.get({ view: 'dashboard', org: 'org-9', name: 'Org 1' }).submissions, [],
    'a name match never pulls in a filing that belongs to another ID');
  assert.equal(r.get({ view: 'dashboard' }).submissions.length, 3, 'TPW view gets everyone');
  assert.deepEqual(plain(r.get({ view: 'dashboard' }).orgs), [{ id: 'org-1', name: 'Org 1' }, { id: 'org-2', name: 'Org 2' }, { id: '', name: 'Old Name Org' }]);
});

test('the signed-in email and sign-in details never reach the dashboard', () => {
  const r = makeReceiver({ props: { ALLOW_UNSIGNED: 'false' }, session: { email: 'private.person@member.example', organization: 'Org 1' } });
  const receipt = r.post(payload(), 'a'.repeat(64));
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.ok(JSON.stringify(r.grid).includes('private.person@member.example'), 'the sheet keeps it, for TPW staff');
  const text = JSON.stringify(r.get({ view: 'dashboard' }));
  for (const secret of ['private.person@member.example', 'aaaaaaaa', 'Sign-in', 'Submitted By']) assert.ok(!text.includes(secret), `dashboard reply contains ${secret}`);
});

test('the read asks Sheets for real numbers and dates, from the right tab', () => {
  const r = makeReceiver();
  r.post(payload());
  r.get({ view: 'dashboard' });
  const read = r.reads.find((x) => x.cells === 'A:ZZ');
  assert.deepEqual(read.options, { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
});

test('blank lines and lines staff typed by hand without a reference are skipped', () => {
  const r = makeReceiver();
  r.post(payload());
  r.grid.push([], ['San Quentin Rehabilitation Center (SQ)', 'North', 'Typed by staff', 'A note to self']);
  r.grid.push(Array(20).fill(''));
  const { submissions } = r.get({ view: 'dashboard' });
  assert.equal(submissions.length, 1);
});

test('columns are found by heading, so staff can add or move columns', () => {
  const r = makeReceiver();
  r.post(payload());
  // Move "Number of Participants" to the far right and add a staff column at the front.
  const head = r.grid[0];
  const from = head.indexOf('Number of Participants');
  for (const row of r.grid) { const [v] = row.splice(from, 1); row.push(v); row.unshift(row === r.grid[0] ? 'Staff notes' : 'checked'); }
  const [s] = r.get({ view: 'dashboard' }).submissions;
  assert.equal(s.programs[0].participants, 27);
});

test('a missing core column gives a plain message, not a crash or wrong numbers', () => {
  const r = makeReceiver();
  r.post(payload());
  r.grid[0][r.grid[0].indexOf('Number of Participants Completed')] = 'Completed (renamed)';
  const view = r.get({ view: 'dashboard' });
  assert.equal(view.ok, false);
  assert.match(view.errors.join(' '), /missing a column/);
});

test('if Google can\'t read the sheet, the dashboard gets a plain message', () => {
  const r = makeReceiver({ failRead: true });
  const view = r.get({ view: 'dashboard' });
  assert.equal(view.ok, false);
  assert.match(view.errors.join(' '), /couldn’t read TPW’s sheet/);
});

test('an empty sheet is an empty dashboard, not an error', () => {
  const view = makeReceiver().get({ view: 'dashboard' });
  assert.deepEqual(plain(view), { ok: true, orgs: [], submissions: [] });
});

test('without ?view=dashboard, the address still answers as the form receiver, and says it can serve dashboards', () => {
  const caps = makeReceiver().get({});
  assert.equal(caps.service, 'TPW guided form submissions');
  assert.equal(caps.features.dashboard, true);
  assert.equal(caps.features.programNotes, true);
});

test('older rows still read: no Additional data, no program IDs, quarter only in its column', () => {
  const r = makeReceiver();
  r.post(payload());
  const extra = r.grid[0].indexOf('Additional data (JSON)');
  for (const row of r.grid.slice(1)) row[extra] = '';
  const [s] = r.get({ view: 'dashboard' }).submissions;
  assert.equal(s.orgId, '', 'no ID without the saved details');
  assert.deepEqual(s.reportingPeriod, { quarter: 4, year: 2026 }, 'from the Reporting Quarter column');
  assert.equal(s.programs[0].participants, 27);
  assert.equal(s.programs[0].id, undefined);
  assert.deepEqual(plain(s.programs[0].assignments.map((a) => a.code)), ['SQ', 'FSP'], 'codes worked out from TPW\'s prison names');
});

test('garbled saved details are ignored, not crashed on', () => {
  const r = makeReceiver();
  r.post(payload());
  const extra = r.grid[0].indexOf('Additional data (JSON)');
  for (const row of r.grid.slice(1)) row[extra] = "'{not json";
  assert.equal(r.get({ view: 'dashboard' }).submissions[0].programs[0].participants, 27);
});

test('numbers and dates edited by hand in the sheet are read sensibly', () => {
  const view = makeReceiver().context.dashboardData_([
    ['CDCR Facility', 'Yard', 'Organization Name', 'Program Name', 'Schedule Status (Planned, In Progress, Completed)', 'Start Date', 'End Date',
      'Total Programming hours', 'Number of Participants', 'Number of Participants Completed', 'Submission ID', 'Submitted At'],
    ['Folsom State Prison (FSP)', 'B', 'Org X', 'P', 'Completed', '9/1/2026', 46296, '12', 'TBD', -3, 'R1', '2026-10-01T00:00:00Z'],
    ['Folsom State Prison (FSP)', 'C', 'Org X', 'P', 'Completed', '9/1/2026', 46296, '12', 2.5, '4', 'R1', '2026-10-01T00:00:00Z'],
    ['Folsom State Prison (FSP)', 'D', 'Org X', 'P', 'Completed', 'soon', '', 12, 7, 2, 'R1', 45931]
  ], {});
  const p = plain(view.submissions[0].programs[0]);
  assert.equal(p.participants, 7, '"TBD", 2.5 and -3 count as nothing; 7 counts');
  assert.equal(p.participantsCompleted, 6, '-3 counts as nothing; "4" and 2 count');
  assert.equal(p.startDate, '2026-09-01', 'US-style dates are read');
  assert.equal(p.endDate, '2026-10-01', 'a sheet day count is turned into a date');
  assert.equal(p.courseHours, 12);
});

// ---- the Test data column -----------------------------------------------------------------
const testColumn = (r) => r.grid[0].indexOf('Test data');
const flags = (r) => r.grid.slice(1).map((row) => readBack(row[testColumn(r)]));

test('with no TEST_DATA setting, rows are marked No (a fresh copy for real use never says Yes)', () => {
  const r = makeReceiver();
  r.post(payload());
  assert.ok(testColumn(r) >= 0, 'the Test data column is made on the first filing');
  assert.deepEqual(flags(r), ['No', 'No', 'No']);
  assert.equal(r.get({ view: 'dashboard' }).submissions[0].testData, false);
});

test('with TEST_DATA set to Yes, every row of a filing is marked Yes and the dashboard knows', () => {
  for (const value of ['Yes', 'yes', 'TRUE', ' true ']) {
    const r = makeReceiver({ props: { TEST_DATA: value } });
    r.post(payload());
    assert.deepEqual(flags(r), ['Yes', 'Yes', 'Yes'], JSON.stringify(value));
    assert.equal(r.get({ view: 'dashboard' }).submissions[0].testData, true);
  }
  for (const value of ['No', 'no', '', 'maybe', '0']) {
    const r = makeReceiver({ props: { TEST_DATA: value } });
    r.post(payload());
    assert.deepEqual(flags(r), ['No', 'No', 'No'], JSON.stringify(value));
  }
});

test('the Test data column is made once, after Additional data, however many filings follow', () => {
  const r = makeReceiver({ props: { TEST_DATA: 'Yes' } });
  r.post(payload());
  r.post(payload());
  const head = r.grid[0];
  assert.equal(head.filter((h) => h === 'Test data').length, 1);
  assert.equal(head.indexOf('Test data'), head.indexOf('Additional data (JSON)') + 1);
  assert.equal(flags(r).length, 6);
});

test('a Test data column staff already added, anywhere, is used where it is', () => {
  const r = makeReceiver();
  r.post(payload());
  // Staff move it to the front, as column A.
  const from = testColumn(r);
  for (const row of r.grid) { const [v] = row.splice(from, 1); row.unshift(v); }
  const before = r.grid[0].length;
  const r2rows = r.grid.length;
  r.context.PropertiesService.getScriptProperties = () => ({ getProperty: (k) => ({ SPREADSHEET_ID: 'sheet-1', ALLOW_UNSIGNED: 'true', TEST_DATA: 'Yes' })[k] ?? null });
  r.post(payload());
  assert.equal(r.grid[0].length, before, 'no second Test data column');
  assert.deepEqual(r.grid.slice(r2rows).map((row) => readBack(row[0])), ['Yes', 'Yes', 'Yes']);
});

test('two Test data headings stop the filing with a plain message, and nothing is written', () => {
  const r = makeReceiver();
  r.post(payload());
  r.grid[0].push('Test data');
  const rows = r.grid.length;
  const reply = r.post(payload());
  assert.equal(reply.ok, false);
  assert.match(reply.errors.join(' '), /duplicate Test data/);
  assert.equal(r.grid.length, rows);
});

test('a submission counts as test data if any of its rows says Yes, even if typed by staff', () => {
  const r = makeReceiver();
  r.post(payload());
  r.grid[2][testColumn(r)] = 'yes';
  assert.equal(r.get({ view: 'dashboard' }).submissions[0].testData, true);
});
