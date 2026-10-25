// Writes rows to the "Submissions" tab with the Google Sheets API, as the Google account
// that deployed this script (TPW's own account once it's handed over).
//
// The spreadsheet's ID goes in Project Settings → Script Properties as SPREADSHEET_ID: the
// long code in the sheet's address, between /d/ and /edit.

var TAB = 'Submissions';

function spreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not set in Script Properties.');
  return id;
}

// Makes the tab and its header row if they aren't there yet, so a blank sheet just works.
function ensureSubmissionsTab(id) {
  var book = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties.title' });
  var exists = (book.sheets || []).some(function (sheet) { return sheet.properties.title === TAB; });
  if (!exists) {
    Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] }, id);
  }
  var top = Sheets.Spreadsheets.Values.get(id, TAB + '!A1:A1');
  if (!top.values || !top.values.length) {
    Sheets.Spreadsheets.Values.update({ values: [HEADER] }, id, TAB + '!A1', { valueInputOption: 'RAW' });
  }
}

function appendRows(rows) {
  var id = spreadsheetId();
  ensureSubmissionsTab(id);
  // USER_ENTERED so MM/DD/YYYY becomes a real date. Rows.gs keeps typed text from turning into formulas.
  Sheets.Spreadsheets.Values.append({ values: rows }, id, TAB + '!A1', {
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS'
  });
}
