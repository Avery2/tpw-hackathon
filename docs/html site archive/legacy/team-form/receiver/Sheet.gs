// Writes to the existing website-submissions tab. Do not rename it.
var TAB = 'Submissions; comes from website form DO NOT RENAME';

function spreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not set in Script Properties.');
  return id;
}

// Quote the tab name because it contains spaces and punctuation.
function submissionRange_(cells) {
  return "'" + TAB.replace(/'/g, "''") + "'!" + cells;
}

function ensureSubmissionsTab_(id) {
  var book = Sheets.Spreadsheets.get(id, {
    fields: 'sheets.properties.title'
  });
  var exists = (book.sheets || []).some(function (sheet) {
    return sheet.properties.title === TAB;
  });

  if (!exists) {
    Sheets.Spreadsheets.batchUpdate({
      requests: [{
        addSheet: {
          properties: {
            title: TAB,
            gridProperties: { frozenRowCount: 1 }
          }
        }
      }]
    }, id);
  }

  var top = Sheets.Spreadsheets.Values.get(id, submissionRange_('A1:A1'));
  if (!top.values || !top.values.length) {
    Sheets.Spreadsheets.Values.update(
      { values: [HEADER] },
      id,
      submissionRange_('A1'),
      { valueInputOption: 'RAW' }
    );
  }
}

function appendRows_(rows) {
  var id = spreadsheetId_();
  ensureSubmissionsTab_(id);

  Sheets.Spreadsheets.Values.append(
    { values: rows },
    id,
    submissionRange_('A1'),
    {
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS'
    }
  );
}
