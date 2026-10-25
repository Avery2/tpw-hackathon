// Do the dashboard tests catch bugs? Plants one deliberate bug at a time in the dashboard
// read (Dashboard.gs) or the page loader (dashboard-source.js), runs both test files, and
// expects a failure each time. Restores every file afterwards, even if interrupted by an error.
//
//   node team-form/test/dashboard-mutants.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TESTS = ['team-form/test/dashboard.cjs', 'team-form/test/dashboard-source.mjs'];
const MUTANTS = [
  ['team-form/receiver/Dashboard.gs', 'program.participants += dashboardCount_(cell(at.participants));', 'program.participants = dashboardCount_(cell(at.participants));', 'keeps only the last yard\'s participants'],
  ['team-form/receiver/Dashboard.gs', 'program.participantsCompleted += dashboardCount_(cell(at.completed));', 'program.participantsCompleted += dashboardCount_(cell(at.participants));', 'counts participants as completions'],
  ['team-form/receiver/Dashboard.gs', "if (submission.orgId) return submission.orgId === wantOrg;", "if (submission.orgId) return true;", 'shows every organization in one organization\'s view'],
  ['team-form/receiver/Dashboard.gs', "return Boolean(wantName) && submission.organization.toLowerCase() === wantName;", "return true;", 'gives unlabelled filings to anyone who asks'],
  ['team-form/receiver/Dashboard.gs', "        organization: dashboardText_(cell(at.organization)),", "        organization: dashboardText_(cell(at.organization)), email: row.join(' '),", 'leaks the whole row, email included'],
  ['team-form/receiver/Dashboard.gs', 'Math.floor(value) * 86400000', '(Math.floor(value) + 1) * 86400000', 'shifts every date by a day'],
  ['team-form/receiver/Dashboard.gs', "if (!reference || !programName) return;", "if (!programName) return;", 'treats hand-typed lines as filings'],
  ['team-form/receiver/Dashboard.gs', "isFinite(number) && number >= 0 && Math.floor(number) === number", "isFinite(number)", 'counts negative and fractional people'],
  ['team-form/receiver/Dashboard.gs', "var key = programId || programName.toLowerCase();", "var key = programName.toLowerCase() + yard;", 'splits one program into one per yard'],
  ['team-form/receiver/Dashboard.gs', "  if (missing.length) {", "  if (false) {", 'carries on when a core column is missing'],
  ['team-form/receiver/Dashboard.gs', "valueRenderOption: 'UNFORMATTED_VALUE',", "valueRenderOption: 'FORMATTED_VALUE',", 'reads numbers as display text'],
  ['team-form/receiver/Code.gs', "if (e && e.parameter && e.parameter.view === 'dashboard')", "if (false)", 'never answers the dashboard'],
  ['assets/dashboard-source.js', "(record => ({ ...record, synthetic: true }))", "(record => ({ ...record }))", 'stops badging sample data'],
  ['assets/dashboard-source.js', "(record => ({ ...record, synthetic: false }))", "(record => ({ ...record, synthetic: true }))", 'badges real submissions as sample data'],
  ['assets/dashboard-source.js', "const own = record => (record.orgId ? record.orgId === orgId : record.organization === org.name);", "const own = () => true;", 'trusts the sheet to filter organizations'],
  ['assets/dashboard-source.js', "  if (!data || data.ok !== true) {", "  if (false) {", 'shows sample data when the sheet can\'t be read'],
  ['assets/dashboard-source.js', "    address.searchParams.set('org', org.id);\n", "", 'asks the sheet for everyone in an organization\'s view'],
  ['dashboard/js/data.js', "export { loadDashboard } from '../../assets/dashboard-source.js';", "export async function loadDashboard() { return { org: null, orgs: [], submissions: [] }; }", 'the original dashboard stops using the sheet']
];

const run = () => TESTS.every((t) => spawnSync(process.execPath, ['--test', t], { cwd: root, encoding: 'utf8' }).status === 0);
if (!run()) { console.log('The tests fail before any bug is planted; fix that first.'); process.exit(1); }
let caught = 0;
const missed = [];
for (const [file, find, replace, bug] of MUTANTS) {
  const full = path.join(root, file);
  const original = fs.readFileSync(full, 'utf8');
  if (!original.includes(find)) { missed.push(`${bug} (line not found)`); continue; }
  try {
    fs.writeFileSync(full, original.replace(find, replace));
    if (run()) missed.push(bug); else caught++;
  } finally {
    fs.writeFileSync(full, original);
  }
}
console.log(`${caught} of ${MUTANTS.length} planted bugs caught.`);
if (missed.length) { console.log('Missed:\n  ' + missed.join('\n  ')); process.exitCode = 1; }
