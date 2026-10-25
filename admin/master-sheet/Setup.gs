// Optional setup helper for the emailed-code + Sheets project on email-code-signin.
// Paste this beside that project's files, then run configureMasterSheet_ in the
// Apps Script editor while signed in to the demo owner. Nothing runs on upload.
// Every function is private to google.script.run (trailing underscore).

var MASTER_SPREADSHEET_ID_ = '1EvmybTK2U5blq3brPBO4akV7yZ8odaL6fP_B4n-Unb8';
var MASTER_OWNER_EMAIL_ = 'tpwhackathondemodemo@gmail.com';

function configureMasterSheet_() {
  var email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (email !== MASTER_OWNER_EMAIL_) {
    throw new Error('Run setup from the demo owner account: ' + MASTER_OWNER_EMAIL_ + '. Nothing was changed.');
  }
  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets) {
    throw new Error('Enable the advanced Google Sheets service first. Nothing was changed.');
  }
  if (typeof HEADER === 'undefined' || typeof MEMBERS_HEADER === 'undefined') {
    throw new Error('Install the auth project files, including Rows.gs and SignIn.gs, first. Nothing was changed.');
  }
  var properties = PropertiesService.getScriptProperties();
  var previous = properties.getProperty('SPREADSHEET_ID');
  if (previous && previous !== MASTER_SPREADSHEET_ID_) {
    throw new Error('This project already targets a different spreadsheet. Check its deployment before retargeting it. Nothing was changed.');
  }

  // Prove this account can read the target, and check all existing headers before
  // changing anything. Reuse the auth project's headers rather than copying them.
  var book = Sheets.Spreadsheets.get(MASTER_SPREADSHEET_ID_, {
    fields: 'spreadsheetId,sheets.properties.title'
  });
  var names = (book.sheets || []).map(function (sheet) { return sheet.properties.title; });
  var tabs = [
    { name: 'Members', header: MEMBERS_HEADER },
    { name: 'Submissions', header: HEADER }
  ];
  var missing = [];
  tabs.forEach(function (tab) {
    if (names.indexOf(tab.name) < 0) { missing.push(tab); return; }
    var range = "'" + tab.name + "'!1:1";
    var rows = Sheets.Spreadsheets.Values.get(MASTER_SPREADSHEET_ID_, range).values || [];
    var actual = rows[0] || [];
    if (JSON.stringify(actual) !== JSON.stringify(tab.header)) {
      throw new Error(tab.name + ' has an unexpected or blank header. Check it manually; setup will not overwrite it. Nothing was changed.');
    }
  });

  if (missing.length) {
    Sheets.Spreadsheets.batchUpdate({ requests: missing.map(function (tab) {
      return { addSheet: { properties: { title: tab.name, gridProperties: { frozenRowCount: 1 } } } };
    }) }, MASTER_SPREADSHEET_ID_);
    missing.forEach(function (tab) {
      Sheets.Spreadsheets.Values.update({ values: [tab.header] }, MASTER_SPREADSHEET_ID_,
        "'" + tab.name + "'!A1", { valueInputOption: 'RAW' });
    });
  }

  // Do not grant membership or enable the demo's unsigned-submission bypass.
  // The owner still chooses the organization associated with each allowed email.
  properties.setProperties({
    SPREADSHEET_ID: MASTER_SPREADSHEET_ID_,
    TPW_CONTACT_EMAIL: MASTER_OWNER_EMAIL_,
    ALLOW_UNSIGNED: 'false'
  });
  return {
    ok: true,
    spreadsheetId: MASTER_SPREADSHEET_ID_,
    createdTabs: missing.map(function (tab) { return tab.name; }),
    unsignedAllowed: false,
    next: 'Add permitted email-to-organization rows in Members, then deploy as the demo owner and hand over the /exec URL.'
  };
}
