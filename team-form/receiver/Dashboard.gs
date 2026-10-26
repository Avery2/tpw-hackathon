// Reads TPW's submissions sheet back out for the dashboards, in the shape they already use.
// The sheet is the only place submissions live; Firebase was retired on 25 Oct 2026.
//
//   GET <web app address>?view=dashboard                      every organization (TPW view)
//   GET <web app address>?view=dashboard&org=org-1&name=Org%201   one organization
//
// One sheet row is one program at one yard. Rows sharing a Submission ID are one submission;
// inside it, a program's participants and completions are its yards added up. The Submitted
// By email and anything about sign-in never leave this file.

function dashboardView_(params) {
  try {
    return dashboardData_(readSubmissionRows_(), { org: params && params.org, name: params && params.name });
  } catch (error) {
    console.error(error);
    return { ok: false, errors: ['The dashboard couldn’t read TPW’s sheet. Please try again in a minute.'] };
  }
}

// Numbers as numbers and dates as day counts, whatever the sheet's display format.
function readSubmissionRows_() {
  var result = Sheets.Spreadsheets.Values.get(spreadsheetId_(), submissionRange_('A:ZZ'), {
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  return result.values || [];
}

// rows: the tab's values, headings first. filter: { org, name } or nothing for every organization.
function dashboardData_(rows, filter) {
  if (!rows || !rows.length) return { ok: true, orgs: [], submissions: [] };
  var headings = rows[0].map(normalizeFormHeader_);
  var col = function (heading) { return headings.indexOf(normalizeFormHeader_(heading)); };
  var at = {
    facility: col(HEADER[0]), yard: col(HEADER[1]), organization: col(HEADER[2]), program: col(HEADER[3]),
    status: col(HEADER[4]), start: col(HEADER[5]), end: col(HEADER[6]), hours: col(HEADER[7]),
    participants: col(HEADER[8]), completed: col(HEADER[9]), notes: col('Notes'),
    reference: col('Submission ID'), submittedAt: col('Submitted At'),
    quarter: col('Reporting Quarter'), extra: col('Additional data (JSON)'), test: col('Test data')
  };
  var missing = ['facility', 'yard', 'organization', 'program', 'participants', 'completed', 'reference']
    .filter(function (key) { return at[key] < 0; });
  if (missing.length) {
    return { ok: false, errors: ['TPW’s sheet is missing a column the dashboard needs. Check the heading row hasn’t been edited.'] };
  }
  var codeFor = {};
  Object.keys(FACILITIES).forEach(function (code) { codeFor[FACILITIES[code]] = code; });

  var byReference = {};
  var order = [];
  rows.slice(1).forEach(function (row) {
    var cell = function (index) { return index >= 0 && index < row.length ? row[index] : ''; };
    var reference = dashboardText_(cell(at.reference));
    var programName = dashboardText_(cell(at.program));
    if (!reference || !programName) return; // a blank or hand-typed line, not a filing
    var saved = dashboardSnapshot_(cell(at.extra));
    var submission = byReference[reference];
    if (!submission) {
      submission = byReference[reference] = {
        id: reference,
        organization: dashboardText_(cell(at.organization)),
        orgId: dashboardText_(saved.submission.orgId),
        submittedAt: dashboardMoment_(cell(at.submittedAt)),
        reportingPeriod: dashboardPeriod_(saved.submission.reportingPeriod, cell(at.quarter)),
        previousSubmissionId: dashboardText_(saved.submission.previousSubmissionId),
        testData: false,
        prisons: [],
        programs: [],
        byProgram: {},
        byPrison: {}
      };
      order.push(reference);
    }
    // A submission is test data if any of its rows says so in the Test data column.
    if (/^yes$/i.test(dashboardText_(cell(at.test)))) submission.testData = true;
    var facility = dashboardText_(cell(at.facility));
    var code = dashboardText_(saved.site.facilityCode) || codeFor[facility] || facility;
    var yard = dashboardText_(cell(at.yard));
    var programId = dashboardText_(saved.program.id);
    var key = programId || programName.toLowerCase();
    var program = submission.byProgram[key];
    if (!program) {
      program = submission.byProgram[key] = {
        name: programName,
        status: dashboardText_(cell(at.status)),
        startDate: dashboardDay_(cell(at.start)),
        endDate: dashboardDay_(cell(at.end)),
        courseHours: dashboardNumber_(cell(at.hours)),
        notes: dashboardText_(cell(at.notes)),
        participants: 0,
        participantsCompleted: 0,
        assignments: []
      };
      if (programId) program.id = programId;
      submission.programs.push(program);
    }
    program.participants += dashboardCount_(cell(at.participants));
    program.participantsCompleted += dashboardCount_(cell(at.completed));
    // A blank cell means "not reported", not 0: say so, so the dashboard doesn't show it as a real zero.
    if ([at.participants, at.completed, at.hours].some(function (column) { return dashboardText_(cell(column)) === ''; })) program.unreported = true;
    var assignment = program.assignments.filter(function (item) { return item.code === code; })[0];
    if (!assignment) { assignment = { code: code, yards: [] }; program.assignments.push(assignment); }
    if (yard && assignment.yards.indexOf(yard) < 0) assignment.yards.push(yard);
    var prison = submission.byPrison[code];
    if (!prison) { prison = submission.byPrison[code] = { code: code, name: facility || code, yards: [] }; submission.prisons.push(prison); }
    if (yard && prison.yards.indexOf(yard) < 0) prison.yards.push(yard);
  });

  var wantOrg = dashboardText_(filter && filter.org);
  var wantName = dashboardText_(filter && filter.name).toLowerCase();
  var submissions = order.map(function (reference) {
    var submission = byReference[reference];
    delete submission.byProgram;
    delete submission.byPrison;
    return submission;
  }).filter(function (submission) {
    if (!wantOrg && !wantName) return true;
    if (submission.orgId) return submission.orgId === wantOrg;
    return Boolean(wantName) && submission.organization.toLowerCase() === wantName;
  });

  var orgs = [];
  var seen = {};
  submissions.forEach(function (submission) {
    var key = submission.orgId || 'name:' + submission.organization.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    orgs.push({ id: submission.orgId, name: submission.organization });
  });
  return { ok: true, orgs: orgs, submissions: submissions };
}

function dashboardText_(value) {
  return value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
}

// Participant counts: whole numbers from 0 up. Anything else typed into the sheet counts as 0.
function dashboardCount_(value) {
  var number = typeof value === 'number' ? value : Number(dashboardText_(value));
  return isFinite(number) && number >= 0 && Math.floor(number) === number && dashboardText_(value) !== '' ? number : 0;
}

function dashboardNumber_(value) {
  var number = typeof value === 'number' ? value : Number(dashboardText_(value));
  return isFinite(number) && number >= 0 && dashboardText_(value) !== '' ? number : 0;
}

// A day as yyyy-mm-dd: from the sheet's day count, or from text in either common form.
function dashboardDay_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  var text = dashboardText_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  var us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return us[3] + '-' + ('0' + us[1]).slice(-2) + '-' + ('0' + us[2]).slice(-2);
  return '';
}

// The time a submission arrived, as an ISO timestamp the dashboards can sort and chart.
function dashboardMoment_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString();
  }
  var text = dashboardText_(value);
  var date = new Date(text);
  return text && !isNaN(date.getTime()) ? date.toISOString() : '';
}

// { quarter, year } from the form's own record of it, or from a "2026 Q4" Reporting Quarter cell.
function dashboardPeriod_(saved, cell) {
  if (saved && Number(saved.quarter) >= 1 && Number(saved.quarter) <= 4 && Number(saved.year) > 1999) {
    return { quarter: Number(saved.quarter), year: Number(saved.year) };
  }
  var match = dashboardText_(cell).match(/^(\d{4})\s*Q([1-4])$/i);
  return match ? { quarter: Number(match[2]), year: Number(match[1]) } : null;
}

// The Additional data (JSON) cell, or empty parts if it is missing or unreadable.
function dashboardSnapshot_(value) {
  var empty = { submission: {}, program: {}, site: {} };
  var text = dashboardText_(value);
  if (!text) return empty;
  try {
    var parsed = JSON.parse(text);
    return {
      submission: parsed && typeof parsed.submission === 'object' && parsed.submission ? parsed.submission : {},
      program: parsed && typeof parsed.program === 'object' && parsed.program ? parsed.program : {},
      site: parsed && typeof parsed.site === 'object' && parsed.site ? parsed.site : {}
    };
  } catch (error) {
    return empty;
  }
}
