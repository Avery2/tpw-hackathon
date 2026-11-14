import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, programHistoryCsv } from '../../assets/dashboard-exports.js';

test('CSV protects formula-like text and escapes quotes/newlines', () => {
  for (const value of ['=1+1', '  =1+1', '\t@bad', '\r\n+bad', '-5', '\tplain']) assert.ok(csvCell(value).startsWith('"\''), value);
  assert.equal(csvCell('a,"b\nc'), '"a,""b\nc"');
  assert.equal(csvCell(0), '"0"'); assert.equal(csvCell(-5), '"-5"');
});
const submission = () => ({
  id: 'test-reference', orgId: 'org-1', organization: 'Org 1', synthetic: true,
  reportingPeriod: { year: 2026, quarter: 4 }, submittedAt: '2026-10-01T00:00:00Z',
  programs: [{ id: 'a', name: '=literal', participants: 0, participantsCompleted: 0, courseHours: 12, assignments: [{ code: 'SQ', yards: ['A', 'B'] }] }]
});
test('program-history CSV has one aggregate row per program, not repeated yard totals', () => {
  const csv = programHistoryCsv([submission()]);
  assert.equal(csv.split('\r\n').length, 3);
  assert.match(csv, /"0","0"/); assert.match(csv, /"'=literal"/);
  assert.match(csv, /history, not latest-only/); assert.match(csv, /"Yes"/);
});
test('missing or explicitly unreported counts stay blank, not zero', () => {
  const s = submission(); delete s.programs[0].participants;
  assert.match(programHistoryCsv([s]), /"12","","0"/);
  s.programs[0].unreported = true;
  assert.match(programHistoryCsv([s]), /"12","",""/);
});
test('multiple historical filings remain separate and clearly labeled', () => {
  const s = submission(); s.synthetic = false;
  const csv = programHistoryCsv([s, { ...s, id: 'another-reference' }]);
  assert.equal(csv.split('\r\n').length, 4);
  assert.match(csv, /another-reference/); assert.match(csv, /"No"/);
  assert.match(csv, /Do not sum revisions/);
});
