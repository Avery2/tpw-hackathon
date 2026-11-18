// Turns one guided-form submission into rows for TPW's sheet, and refuses anything that
// can't be true. Nothing in this file talks to Google, so the tests in test/ run it with plain Node.
//
// One row = one program at one yard at one prison, the same unit as TPW's own
// Collective Impact sheet (June 2026 glossary). Columns A–M are that sheet's Data Entry tab,
// same names, same order, so rows can be pasted across. N–Q record who filed what, and when;
// R is the reporting quarter the organization chose.
// (The glossary also mentions a "Funded by RIGHT 2.0" column; the real sheet doesn't have one.)

var HEADER = [
  'CDCR Facility', 'Yard', 'Organization Name', 'Program Name',
  'Schedule Status (Planned, In Progress, Completed)', 'Start Date', 'End Date',
  'Total Programming hours', 'Number of Participants', 'Number of Participants Completed',
  'CALC: Total Participant Programming hours (Participants Completed * Total Programming Hours',
  'CALC: Program Year (Year of Program Start Date)', 'Notes',
  'Submission ID', 'Submitted At', 'Submitted By', 'Sign-in Checked', 'Reporting Quarter'
];

// The CDCR Facilities list from the Constants tab of TPW's sheet. The form sends the code;
// the sheet gets the name TPW already uses.
var FACILITIES = {
  ASP: 'Avenal State Prison (ASP)',
  CCI: 'California Correctional Institution (CCI)',
  CHCF: 'California Health Care Facility (CHCF), Stockton',
  CIM: 'California Institution for Men (CIM)',
  CIW: 'California Institution for Women (CIW)',
  CMC: 'California Men’s Colony (CMC)',
  CMF: 'California Medical Facility (CMF)',
  CRC: 'California Rehabilitation Center (CRC)',
  COR: 'California State Prison, Corcoran (COR)',
  LAC: 'California State Prison, Los Angeles County (LAC)',
  SAC: 'California State Prison, Sacramento (SAC)',
  SOL: 'California State Prison, Solano (SOL)',
  CAL: 'Calipatria State Prison (CAL)',
  CEN: 'California State Prison, Centinela (CEN)',
  CCWF: 'Central California Women’s Facility (CCWF)',
  CTF: 'Correctional Training Facility (CTF)',
  FSP: 'Folsom State Prison (FSP)',
  HDSP: 'High Desert State Prison (HDSP)',
  ISP: 'Ironwood State Prison (ISP)',
  KVSP: 'Kern Valley State Prison (KVSP)',
  MCSP: 'Mule Creek State Prison (MCSP)',
  NKSP: 'North Kern State Prison (NKSP)',
  PBSP: 'Pelican Bay State Prison (PBSP)',
  PVSP: 'Pleasant Valley State Prison (PVSP)',
  RJD: 'Richard J. Donovan Correctional Facility (RJD)',
  SVSP: 'Salinas Valley State Prison (SVSP)',
  SQ: 'San Quentin Rehabilitation Center (SQ)',
  SCC: 'Sierra Conservation Center (SCC)',
  SATF: 'Substance Abuse Treatment Facility and State Prison, Corcoran (SATF-CSP, Corcoran)',
  VSP: 'Valley State Prison (VSP)',
  WSP: 'Wasco State Prison (WSP)'
};
// Yards aren't a fixed list: TPW's own sheet has "A Yard", "B", "North" and more, and they
// differ by prison. Any short name is accepted.
var STATUSES = ['Planned', 'In Progress', 'Completed'];
var LIMITS = { programs: 60, sitesPerProgram: 130, text: 120, yard: 40, hours: 5000, people: 100000, firstYear: 2000, lastYear: 2099 };

// payload: what the form sends (see form-demo/index.html, toPayload).
// filer: { organization, email, signedIn } — decided by the server, never by the page.
// meta: { submissionId, submittedAt } — decided by the server.
// Returns { errors: [...], rows: [...], submission }. Any error means nothing should be written.
// submission is the checked copy that Dashboard.gs turns into the dashboard's record.
function buildRows(payload, filer, meta) {
  var errors = [];
  var rows = [];
  if (!filer || !cleanText(filer.organization)) errors.push('No organization for this submission.');
  var programs = payload && payload.programs;
  if (!Array.isArray(programs) || !programs.length) errors.push('The submission has no programs.');
  else if (programs.length > LIMITS.programs) errors.push('Too many programs in one submission.');
  if (errors.length) return { errors: errors, rows: [] };
  // The check-in fields are optional (a first filing has none), but never accepted half-formed.
  var quarter = quarterField(payload.reportingPeriod);
  if (quarter === null) errors.push('The reporting quarter isn\u2019t a real quarter.');
  var orgId = idField(payload.orgId, /^[a-z0-9][a-z0-9-]{0,63}$/);
  if (orgId === null) errors.push('The organization ID isn\u2019t valid.');
  var previous = idField(payload.previousSubmissionId, /^[A-Za-z0-9_-]{1,64}$/);
  if (previous === null) errors.push('The previous submission ID isn\u2019t valid.');
  var clean = { orgId: orgId || '', previousSubmissionId: previous || '', reportingPeriod: quarter ? { quarter: payload.reportingPeriod.quarter, year: payload.reportingPeriod.year } : null, programs: [] };

  programs.forEach(function (program, index) {
    var label = 'Program ' + (index + 1);
    var name = cleanText(program && program.name);
    if (!name) { errors.push(label + ' has no name.'); return; }
    label = '"' + name + '"';
    if (name.length > LIMITS.text) errors.push(label + ': the name is too long.');
    var status = program.status;
    if (STATUSES.indexOf(status) === -1) errors.push(label + ': the schedule status must be Planned, In Progress or Completed.');
    // A date is either missing (empty or absent) or a real yyyy-mm-dd day; anything else
    // is refused, never quietly dropped.
    var start = dateField(program.startDate);
    var end = dateField(program.endDate);
    if (start === null) errors.push(label + ': the start date isn’t a real date.');
    if (end === null) errors.push(label + ': the end date isn’t a real date.');
    if (start !== null && end !== null) {
      if (status !== 'Planned' && !start) errors.push(label + ': a start date is needed unless the program is Planned.');
      if (status === 'Completed' && !end) errors.push(label + ': an end date is needed once the program is Completed.');
      if (start && end && end < start) errors.push(label + ': the end date is before the start date.');
    }
    // Only a real number: Number(true) is 1 and Number(null) is 0, which would file made-up hours.
    var hours = program.courseHours;
    if (typeof hours !== 'number' || !isFinite(hours) || hours < 0 || hours > LIMITS.hours) {
      errors.push(label + ': course hours must be a number from 0 to ' + LIMITS.hours + '.');
    }

    var programId = idField(program.id, /^[A-Za-z0-9_-]{1,80}$/);
    if (programId === null) errors.push(label + ': its ID isn\u2019t valid.');
    var kept = { id: programId || '', name: name, status: status, startDate: start || '', endDate: end || '', courseHours: hours, sites: [] };
    clean.programs.push(kept);

    var sites = program.sites;
    if (!Array.isArray(sites) || !sites.length) { errors.push(label + ' has no prison and yard.'); return; }
    if (sites.length > LIMITS.sitesPerProgram) { errors.push(label + ' lists too many yards.'); return; }
    var seen = {};
    sites.forEach(function (site) {
      var code = site && site.facilityCode;
      var yard = cleanText(site && site.yard);
      var where = label + ' at ' + code + ' ' + yard;
      if (!Object.prototype.hasOwnProperty.call(FACILITIES, code)) { errors.push(label + ': unknown prison "' + code + '".'); return; }
      if (!yard || yard.length > LIMITS.yard) { errors.push(label + ' at ' + code + ': the yard name is missing or too long.'); return; }
      var key = code + '|' + yard.toLowerCase();
      if (seen[key]) { errors.push(where + ' is listed twice.'); return; }
      seen[key] = true;
      var participants = site.participants;
      var completed = site.completed;
      if (!isCount(participants) || !isCount(completed)) { errors.push(where + ': participants and completed must be whole numbers from 0 up.'); return; }
      if (completed > participants) { errors.push(where + ': completed (' + completed + ') is more than participants (' + participants + ').'); return; }
      rows.push([
        text(FACILITIES[code]), text(yard), text(cleanText(filer.organization)), text(name), text(status),
        start, end, hours, participants, completed,
        round2(hours * completed), start ? Number(start.slice(0, 4)) : '', '',
        text(String(meta.submissionId)), text(String(meta.submittedAt)), text(cleanText(filer.email)), filer.signedIn ? text('Yes') : text('No'),
        text(quarter || '')
      ]);
      kept.sites.push({ code: code, yard: yard, participants: participants, completed: completed });
    });
  });
  return errors.length ? { errors: errors, rows: [] } : { errors: [], rows: rows, submission: clean };
}

// '' if the form sent no quarter, '2026 Q4' for a real one, null for anything else.
function quarterField(period) {
  if (period === undefined || period === null || period === '') return '';
  if (typeof period !== 'object') return null;
  var q = period.quarter;
  var y = period.year;
  var whole = function (n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; };
  if (!whole(q) || q < 1 || q > 4 || !whole(y) || y < LIMITS.firstYear || y > LIMITS.lastYear) return null;
  return y + ' Q' + q;
}

// '' if missing, the ID if it matches the pattern, null for anything else.
function idField(value, pattern) {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// Rows are written as if typed, so that dates become real dates. Typed, a program called
// "2026" would become a number, "10/12" a date, "TRUE" a tick box and "=IMPORTDATA(...)" a
// formula. A leading apostrophe tells Sheets "this is text": it is stored, not shown.
function text(value) {
  return value ? "'" + value : '';
}

// '' for a missing date, the date itself (yyyy-mm-dd) for a real one, null for anything else.
// yyyy-mm-dd is read as the same day whatever the sheet's country setting; 09/01/2026 is
// 1 September in a US sheet but 9 January in a UK one.
function dateField(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  var parts = value.split('-').map(Number);
  if (parts[0] < LIMITS.firstYear || parts[0] > LIMITS.lastYear) return null;
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  var real = date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  return real ? value : null;
}

function isCount(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= LIMITS.people;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
