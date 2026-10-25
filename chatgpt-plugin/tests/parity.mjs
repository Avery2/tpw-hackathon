// The ChatGPT skills count the Sheet with a Python copy of the website's rules
// (chatgpt-plugin/source/tpw_data.py). This checks the copy still agrees with the real thing:
// the same made-up rows go through the receiver's Dashboard.gs and the Dashboard's data.js and
// rac.js, and through the Python, and every submission, program and credit estimate must match.
// Plain Node, no packages, no Google.
//
//   node chatgpt-plugin/tests/parity.mjs
//
// Every row in fixture-rows.json is made up.
//
// With --live FILE.xlsx it instead compares a downloaded copy of the real Sheet with what the
// live receiver's ?view=dashboard sends the website (a read: it never submits anything).
// Download the Sheet just before, or rows submitted in between will differ.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'chatgpt-plugin/tests/fixture-rows.json');
// The built copy inside a skill, so the test covers what ChatGPT actually runs.
const python = path.join(root, 'chatgpt-plugin/tpw/skills/tpw-quarter-numbers/scripts/tpw_data.py');

globalThis.window = {};
const { existingPrograms } = await import('../../team-dashboard/js/data.js');
const { estimateRac } = await import('../../team-dashboard/js/rac.js');

function receiver() {
  const context = vm.createContext({ console });
  for (const file of ['Rows.gs', 'Code.gs', 'Dashboard.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'team-form/receiver', file), 'utf8'), context, { filename: file });
  }
  return context;
}

function runPython(file) {
  const result = spawnSync('python3', ['-I', python, 'json', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Python failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const programKey = (program) => JSON.stringify([program.orgId || program.organization || program.submissionId, program.id || program.name.trim().toLowerCase()]);
const programFields = (program) => ({
  name: program.name, status: program.status, startDate: program.startDate, endDate: program.endDate,
  courseHours: program.courseHours, notes: program.notes, participants: program.participants,
  participantsCompleted: program.participantsCompleted, assignments: program.assignments,
  organization: program.organization, submissionId: program.submissionId, id: program.id,
});
const byKey = (programs) => Object.fromEntries(programs.map((program) => [programKey(program), programFields(program)]));

function compare(jsSubmissions, py) {
  const js = plain(jsSubmissions);
  assert.equal(py.submissions.length, js.length, 'same number of submissions');
  for (const [index, submission] of js.entries()) {
    assert.deepStrictEqual(py.submissions[index], submission, `submission ${submission.id} matches`);
  }
  const jsPrograms = plain(existingPrograms(js));
  assert.deepStrictEqual(byKey(py.programs), byKey(jsPrograms), 'latest program per organization matches');
  const jsRac = Object.fromEntries(jsPrograms.map((program) => [programKey(program), estimateRac(program)]));
  const pyRac = Object.fromEntries(py.programs.map((program, index) => [programKey(program), py.rac[index]]));
  assert.deepStrictEqual(pyRac, jsRac, 'credit-day estimates match');
  return { submissions: js.length, programs: jsPrograms.length };
}

const live = process.argv.indexOf('--live');
if (live >= 0) {
  const file = process.argv[live + 1];
  const backend = fs.readFileSync(path.join(root, 'team-form/backend.js'), 'utf8').match(/https:\/\/script\.google\.com\/[^'"\s]+/)[0];
  const address = new URL(backend);
  address.searchParams.set('view', 'dashboard');
  const reply = await (await fetch(address)).json();
  assert.equal(reply.ok, true, 'the live receiver answered');
  const counts = compare(reply.submissions, runPython(file));
  console.log(`Live Sheet: Python and the live receiver agree on ${counts.submissions} submissions and ${counts.programs} programs.`);
} else {
  const rows = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const reply = receiver().dashboardData_(rows, {});
  assert.equal(reply.ok, true);
  const counts = compare(reply.submissions, runPython(fixture));
  assert.ok(counts.submissions >= 7 && counts.programs >= 9, 'the fixture still covers updates, new IDs and older rows');
  console.log(`Python and the website agree on ${counts.submissions} submissions and ${counts.programs} programs.`);
}
