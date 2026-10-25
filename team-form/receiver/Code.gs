// Paste into Code.gs in the EXISTING Apps Script project. Keep Sheet.gs and
// Rows.gs unchanged. Sheets only: no Firebase or dashboard dependency.
// The sheet/tab IDs still come from Script Properties and Sheet.gs respectively.

function getFormCapabilities() {
  return {
    ok: true, service: 'TPW guided form submissions', formVersion: 2,
    features: { programNotes: true, currentQuarter: true, additionalData: true, headerRecovery: true }
  };
}

// ?view=summary is the dashboard's only view of the private Sheet. Anyone can call
// it, so it returns combined figures across all organizations: never organization
// names, program names or one organization's numbers.
function doGet(e) {
  if (e && e.parameter && e.parameter.view === 'summary') {
    try {
      return json({ ok: true, service: 'TPW guided form submissions', summary: dashboardSummary_() });
    } catch (error) {
      console.error(error);
      return json({ ok: false, errors: ['The dashboard figures could not be read from the Sheet. Try again in a minute.'] });
    }
  }
  return json(getFormCapabilities());
}

// Cached for five minutes so a busy dashboard doesn't read the whole Sheet on every visit.
function dashboardSummary_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('dashboard-summary-v1');
  if (cached) return JSON.parse(cached);
  var values = Sheets.Spreadsheets.Values.get(spreadsheetId_(), submissionRange_('A:ZZ')).values || [];
  var summary = summarizeRows_(values);
  try { cache.put('dashboard-summary-v1', JSON.stringify(summary), 300); }
  catch (error) { console.error('Could not cache the dashboard summary.'); }
  return summary;
}

// One row per program, per prison, per yard. A later filing for the same
// organization, program, prison and yard replaces the earlier counts.
function summarizeRows_(values) {
  var headings = (values[0] || []).map(normalizeFormHeader_);
  var at = {};
  [['facility', 'CDCR Facility'], ['yard', 'Yard'], ['org', 'Organization Name'], ['program', 'Program Name'],
   ['start', 'Start Date'], ['hours', 'Total Programming hours'], ['participants', 'Number of Participants'],
   ['completed', 'Number of Participants Completed'], ['submission', 'Submission ID'], ['submittedAt', 'Submitted At']
  ].forEach(function (pair) {
    at[pair[0]] = headings.indexOf(normalizeFormHeader_(pair[1]));
    if (at[pair[0]] < 0) throw formSetupError_('The Sheet heading "' + pair[1] + '" is missing.');
  });
  var cell = function (row, key) { var value = row[at[key]]; return value === undefined || value === null ? '' : String(value).trim(); };
  var count = function (row, key) { var number = Number(cell(row, key).replace(/,/g, '')); return isFinite(number) && number > 0 ? number : 0; };
  var latest = {};
  var submissions = {};
  values.slice(1).forEach(function (row) {
    var org = cell(row, 'org').toLowerCase();
    var program = cell(row, 'program').toLowerCase();
    if (!org || !program) return;
    if (cell(row, 'submission')) submissions[cell(row, 'submission')] = true;
    var key = JSON.stringify([org, program, cell(row, 'facility').toLowerCase(), cell(row, 'yard').toLowerCase()]);
    if (!latest[key] || cell(latest[key], 'submittedAt') <= cell(row, 'submittedAt')) latest[key] = row;
  });
  var rows = Object.keys(latest).map(function (key) { return latest[key]; });
  var programs = {};
  var facilities = {};
  var months = {};
  var totals = { participants: 0, completed: 0, hoursCompleted: 0 };
  rows.forEach(function (row) {
    var participants = count(row, 'participants');
    var completed = Math.min(count(row, 'completed'), participants);
    var hours = count(row, 'hours');
    totals.participants += participants;
    totals.completed += completed;
    totals.hoursCompleted += hours * completed;
    if (cell(row, 'facility')) facilities[cell(row, 'facility').toLowerCase()] = true;
    var programKey = JSON.stringify([cell(row, 'org').toLowerCase(), cell(row, 'program').toLowerCase()]);
    var entry = programs[programKey] || (programs[programKey] = { courseHours: 0, completed: 0 });
    entry.courseHours = Math.max(entry.courseHours, hours);
    entry.completed += completed;
    var month = startMonth_(cell(row, 'start'));
    if (month) months[month] = (months[month] || 0) + participants;
  });
  var running = 0;
  var history = Object.keys(months).sort().map(function (month) {
    running += months[month];
    return { day: month + '-01', participants: running };
  });
  return {
    submissions: Object.keys(submissions).length,
    programs: Object.keys(programs).length,
    facilities: Object.keys(facilities).length,
    participants: totals.participants,
    completed: totals.completed,
    hoursCompleted: totals.hoursCompleted,
    // Sorted pairs of numbers only, with no names, so none can be traced to a program.
    racInputs: Object.keys(programs).map(function (key) { return programs[key]; })
      .sort(function (a, b) { return a.courseHours - b.courseHours || a.completed - b.completed; }),
    history: history,
    updatedAt: new Date().toISOString()
  };
}

// "2026-10-08", "10/8/2026" or a Sheets date serial number → "2026-10".
function startMonth_(value) {
  var text = String(value || '').replace(/^'/, '');
  var iso = /^(\d{4})-(\d{2})/.exec(text);
  if (iso) return iso[1] + '-' + iso[2];
  var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return us[3] + '-' + ('0' + us[1]).slice(-2);
  return '';
}

function doPost(e) {
  var body;
  try {
    var text = e && e.postData ? e.postData.contents : '';
    if (text.length > 250000) return json({ ok: false, errors: ['The submission is too large.'] });
    body = JSON.parse(text);
  } catch (error) {
    return json({ ok: false, errors: ['The submission was not readable.'] });
  }
  try {
    return json(handleSubmission_(body && body.token, body && body.payload));
  } catch (error) {
    console.error(error);
    return json({ ok: false, errors: ['The receiver could not process this submission. Check its execution log before retrying.'] });
  }
}

function submitForm(token, payload) { return handleSubmission_(token, payload); }

function handleSubmission_(token, payload) {
  var session = getSession_(token);
  var allowUnsigned = PropertiesService.getScriptProperties().getProperty('ALLOW_UNSIGNED') === 'true';
  if (!session && !allowUnsigned) {
    return { ok: false, signInNeeded: true, errors: ['Please sign in again before submitting. Your answers are still on the page.'] };
  }
  var filer = session
    ? { organization: session.organization, email: session.email, signedIn: true }
    : { organization: cleanText(payload && payload.organization), email: '', signedIn: false };
  var meta = { submissionId: Utilities.getUuid().slice(0, 8).toUpperCase(), submittedAt: new Date().toISOString() };
  var result = buildFormRows_(payload, filer, meta);
  if (result.errors.length) return { ok: false, errors: result.errors };

  var retryKey = payload && typeof payload.submissionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.submissionId)
    ? 'form-v2:' + (session ? token : 'unsigned') + ':' + payload.submissionId.toLowerCase() : '';
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, errors: ['The sheet is busy. Please try again in a minute.'] };
  try {
    var earlier = retryKey ? cache.get(retryKey) : null;
    if (earlier) return JSON.parse(earlier);
    appendFormRows_(result);
    var reply = { ok: true, submissionId: meta.submissionId, rows: result.rows.length, organization: filer.organization, signedIn: filer.signedIn };
    // Never turn a confirmed write into an error just because its receipt cache failed.
    if (retryKey) {
      try { cache.put(retryKey, JSON.stringify(reply), 21600); }
      catch (error) { console.error('Saved to Sheets, but could not cache the receipt.'); }
    }
    return reply;
  } catch (error) {
    console.error(error);
    return { ok: false, errors: [error.userMessage || 'Could not confirm the Sheet write. Check the sheet before retrying. Your answers are still on the page.'] };
  } finally {
    lock.releaseLock();
  }
}

function currentReportingPeriod_(now) {
  var parts = Utilities.formatDate(now || new Date(), 'America/Los_Angeles', 'yyyy-MM').split('-');
  return { quarter: Math.floor((Number(parts[1]) - 1) / 3) + 1, year: Number(parts[0]) };
}

// Wrap either existing Rows.gs contract; do not change its column order or formulas.
function buildFormRows_(payload, filer, meta) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { errors: ['The submission was not readable.'], rows: [] };
  }
  var period = currentReportingPeriod_(new Date(meta.submittedAt));
  var normalized = Object.assign({}, payload, { reportingPeriod: period });
  var problems = [];
  var programs = Array.isArray(payload.programs) ? payload.programs : [];
  programs.forEach(function (program, index) {
    if (!program || (program.status !== 'In Progress' && program.status !== 'Completed')) {
      problems.push('Program ' + (index + 1) + ': choose In Progress or Completed.');
    }
    if (program && program.notes !== undefined && typeof program.notes !== 'string') {
      problems.push('Program ' + (index + 1) + ': optional context must be text.');
    } else if (program && String(program.notes || '').length > 2000) {
      problems.push('Program ' + (index + 1) + ': use no more than 2,000 characters for optional context.');
    }
  });
  if (problems.length) return { errors: problems, rows: [] };
  var result = buildRows(normalized, filer, meta);
  if (result.errors.length) return result;
  var notesColumn = HEADER.indexOf('Notes');
  if (notesColumn < 0) return { errors: ['The receiver needs a Notes column in its Rows.gs contract.'], rows: [] };
  result.snapshots = [];
  var rowIndex = 0;
  programs.forEach(function (program) {
    var notes = String(program.notes || '').trim();
    program.sites.forEach(function (site) {
      // Apostrophe forces literal text under USER_ENTERED, including =formula-like notes.
      result.rows[rowIndex++][notesColumn] = notes ? "'" + notes : '';
      var extra = formSnapshot_(normalized, program, site, filer);
      if (extra.length > 20000) problems.push('Additional program data exceeds 20,000 characters per row.');
      result.snapshots.push(extra);
    });
  });
  return problems.length ? { errors: problems, rows: [] } : result;
}

// Capture structured program data, not the HTTP envelope, tokens or uploaded files.
// One snapshot per program/yard row avoids repeating every other program/site.
function formSnapshot_(payload, program, site, filer) {
  var submission = Object.assign({}, payload, { organization: filer.organization });
  delete submission.programs;
  var details = Object.assign({}, program);
  delete details.sites;
  return JSON.stringify({ submission: submission, program: details, site: site }, function (key, value) {
    var name = key.replace(/[_\s-]/g, '').toLowerCase();
    if (/^(token|sessiontoken|accesstoken|idtoken|refreshtoken|authorization|password|secret|orgkey|organizationkey|files?|attachments?|pdf|signature|ssn|taxid|cdcrnumber|dateofbirth|dob|participantnames?)$/.test(name)) return undefined;
    return value;
  });
}

// Map existing report columns by heading, so inserting/reordering columns is safe.
// Missing or duplicate core headings fail explicitly rather than shifting values.
function appendFormRows_(result) {
  var id = spreadsheetId_();
  ensureSubmissionsTab_(id);
  var rows = Sheets.Spreadsheets.Values.get(id, submissionRange_('1:1')).values || [];
  var headings = rows[0] || [];
  recoverReportingQuarterHeader_(id, headings);
  var normalized = headings.map(normalizeFormHeader_);
  var columns = HEADER.map(function (heading) {
    var key = normalizeFormHeader_(heading);
    var at = normalized.indexOf(key);
    if (at < 0 || normalized.lastIndexOf(key) !== at) {
      throw formSetupError_('The Sheet heading "' + heading + '" is missing or duplicated. Restore that heading before submitting.');
    }
    return at;
  });
  var extraHeading = 'Additional data (JSON)';
  var extraKey = normalizeFormHeader_(extraHeading);
  var extraColumn = normalized.indexOf(extraKey);
  if (extraColumn >= 0 && normalized.lastIndexOf(extraKey) !== extraColumn) {
    throw formSetupError_('The Sheet has duplicate Additional data (JSON) headings. Keep just one.');
  }
  if (extraColumn < 0) {
    extraColumn = headings.length;
    // Usually still within the sheet's default 26 columns. Expand only if needed.
    var book = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties' });
    var target = book.sheets.filter(function (sheet) { return sheet.properties.title === TAB; })[0];
    var count = target.properties.gridProperties.columnCount;
    if (extraColumn >= count) {
      Sheets.Spreadsheets.batchUpdate({ requests: [{ appendDimension: {
        sheetId: target.properties.sheetId, dimension: 'COLUMNS', length: extraColumn + 1 - count
      } }] }, id);
    }
    Sheets.Spreadsheets.Values.update({ values: [[extraHeading]] }, id,
      submissionRange_(formColumnLetter_(extraColumn + 1) + '1'), { valueInputOption: 'RAW' });
  }
  var width = Math.max(headings.length, extraColumn + 1);
  var mapped = result.rows.map(function (row, index) {
    var output = Array(width).fill('');
    columns.forEach(function (destination, source) { output[destination] = row[source]; });
    output[extraColumn] = "'" + result.snapshots[index];
    return output;
  });
  appendRows_(mapped);
}

// A newer Rows.gs adds Reporting Quarter after the original columns. Recover its
// blank heading only when EVERY other core heading is uniquely in its canonical
// position and the candidate column contains only quarter values (or is empty).
// Never infer a metric column, rename a label, move data, or repair duplicates.
function recoverReportingQuarterHeader_(id, headings) {
  var key = normalizeFormHeader_('Reporting Quarter');
  var expected = HEADER.map(normalizeFormHeader_);
  var at = expected.indexOf(key);
  var actual = headings.map(normalizeFormHeader_);
  if (at < 0 || actual.indexOf(key) >= 0 || normalizeFormHeader_(headings[at])) return;
  var canonical = expected.every(function (heading, index) {
    return index === at || (actual.indexOf(heading) === index && actual.lastIndexOf(heading) === index);
  });
  if (!canonical) return;
  var letter = formColumnLetter_(at + 1);
  var cells = Sheets.Spreadsheets.Values.get(id, submissionRange_(letter + '2:' + letter)).values || [];
  var safe = cells.every(function (row) {
    var value = row[0] === undefined || row[0] === null ? '' : String(row[0]).trim().replace(/^'/, '');
    return !value || /^(?:\d{4}\s*Q[1-4]|Q[1-4]\s*\d{4})$/i.test(value);
  });
  if (!safe) {
    throw formSetupError_('Reporting Quarter has a blank heading, but that column contains other data. Restore its correct heading manually; no data was changed.');
  }
  Sheets.Spreadsheets.Values.update({ values: [[HEADER[at]]] }, id,
    submissionRange_(letter + '1'), { valueInputOption: 'RAW' });
  headings[at] = HEADER[at];
}

function normalizeFormHeader_(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function formSetupError_(message) { var error = new Error(message); error.userMessage = message; return error; }
function formColumnLetter_(number) {
  var text = '';
  while (number > 0) { number--; text = String.fromCharCode(65 + number % 26) + text; number = Math.floor(number / 26); }
  return text;
}
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
