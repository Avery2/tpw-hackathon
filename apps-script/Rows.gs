// Turns one guided-form submission into rows for TPW's sheet, and refuses anything that
// can't be true. Nothing in this file talks to Google, so tests.js can run it with plain Node.
//
// One row = one program at one yard at one prison, the same unit as TPW's own
// Collective Impact sheet (June 2026 glossary). Columns A–N match that sheet's Data Entry
// tab in order, so rows can be pasted across. O–R record who filed what, and when.

var HEADER = [
  'CDCR Facility', 'Yard', 'Organization Name', 'Program Name', 'Schedule Status',
  'Start Date', 'End Date', 'Course Hours (per Participant)', 'Number of Participants',
  'Number of Participants Completed', 'Funded by RIGHT 2.0',
  'CALC: Total Participant Hours Delivered', 'CALC: Program Year', 'Notes',
  'Submission ID', 'Submitted At', 'Submitted By', 'Sign-in Checked'
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
var LIMITS = { programs: 60, sitesPerProgram: 130, text: 120, yard: 40, hours: 5000, people: 100000 };

// payload: what the form sends (see form-demo/index.html, toPayload).
// filer: { organization, email, signedIn } — decided by the server, never by the page.
// meta: { submissionId, submittedAt } — decided by the server.
// Returns { errors: [...], rows: [...] }. Any error means nothing should be written.
function buildRows(payload, filer, meta) {
  var errors = [];
  var rows = [];
  if (!filer || !cleanText(filer.organization)) errors.push('No organization for this submission.');
  var programs = payload && payload.programs;
  if (!Array.isArray(programs) || !programs.length) errors.push('The submission has no programs.');
  else if (programs.length > LIMITS.programs) errors.push('Too many programs in one submission.');
  if (errors.length) return { errors: errors, rows: [] };

  programs.forEach(function (program, index) {
    var label = 'Program ' + (index + 1);
    var name = cleanText(program && program.name);
    if (!name) { errors.push(label + ' has no name.'); return; }
    label = '"' + name + '"';
    if (name.length > LIMITS.text) errors.push(label + ': the name is too long.');
    var status = program.status;
    if (STATUSES.indexOf(status) === -1) errors.push(label + ': the schedule status must be Planned, In Progress or Completed.');
    var start = program.startDate || '';
    var end = program.endDate || '';
    if (start && !isIsoDate(start)) errors.push(label + ': the start date isn’t a real date.');
    if (end && !isIsoDate(end)) errors.push(label + ': the end date isn’t a real date.');
    if (status !== 'Planned' && !start) errors.push(label + ': a start date is needed unless the program is Planned.');
    if (status === 'Completed' && !end) errors.push(label + ': an end date is needed once the program is Completed.');
    if (start && end && end < start) errors.push(label + ': the end date is before the start date.');
    var hours = Number(program.courseHours);
    if (!isFinite(hours) || hours < 0 || hours > LIMITS.hours) errors.push(label + ': course hours must be between 0 and ' + LIMITS.hours + '.');

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
        FACILITIES[code], safeCell(yard), safeCell(cleanText(filer.organization)), safeCell(name), status,
        toUsDate(start), toUsDate(end), hours, participants, completed, '',
        round2(hours * completed), start ? Number(start.slice(0, 4)) : '', '',
        meta.submissionId, meta.submittedAt, safeCell(filer.email || ''), filer.signedIn ? 'Yes' : 'No'
      ]);
    });
  });
  return errors.length ? { errors: errors, rows: [] } : { errors: [], rows: rows };
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// Rows are written as if typed, so dates become real dates in the sheet. A name typed as
// "=IMPORTDATA(...)" would then run as a formula; a leading apostrophe keeps it as text.
function safeCell(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function isIsoDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  var parts = text.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

// TPW's sheet uses MM/DD/YYYY.
function toUsDate(iso) {
  return iso ? iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4) : '';
}

function isCount(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= LIMITS.people;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
