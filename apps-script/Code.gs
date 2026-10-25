// The web app the guided form sends submissions to. Deploy it to run as TPW's Google
// account (see README.md); then everything it writes is written by that account.
//
// Two ways in, both ending in handleSubmission:
//   - doPost: the form on another site (GitHub Pages, TPW's Squarespace page) sends
//     { token, payload } as JSON.
//   - submitForm: the same, for a copy of the form served by this script itself
//     (google.script.run).
//
// Script Properties:
//   SPREADSHEET_ID  required. The sheet to write to.
//   ALLOW_UNSIGNED  "true" only for the hackathon demo, before sign-in is connected. Then a
//                   submission without a valid sign-in is still written, under the name the
//                   page typed, and marked "No" in the Sign-in Checked column.

function doGet() {
  return json({ ok: true, service: 'TPW guided form submissions' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (error) {
    return json({ ok: false, errors: ['The submission wasn’t readable.'] });
  }
  return json(handleSubmission(body && body.token, body && body.payload));
}

function submitForm(token, payload) {
  return handleSubmission(token, payload);
}

function handleSubmission(token, payload) {
  var session = getSession(token);
  var allowUnsigned = PropertiesService.getScriptProperties().getProperty('ALLOW_UNSIGNED') === 'true';
  if (!session && !allowUnsigned) {
    return { ok: false, signInNeeded: true, errors: ['Please sign in again before submitting. Your answers are still on the page.'] };
  }
  var filer = session
    ? { organization: session.organization, email: session.email, signedIn: true }
    : { organization: cleanText(payload && payload.organization), email: '', signedIn: false };
  var meta = { submissionId: Utilities.getUuid().slice(0, 8).toUpperCase(), submittedAt: new Date().toISOString() };

  var result = buildRows(payload, filer, meta);
  if (result.errors.length) return { ok: false, errors: result.errors };

  // One submission at a time, so two members filing at once can't interleave their rows.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, errors: ['TPW’s sheet is busy. Please try again in a minute.'] };
  try {
    appendRows(result.rows);
  } catch (error) {
    console.error(error);
    return { ok: false, errors: ['Couldn’t write to TPW’s sheet. Your answers are still on the page; please try again.'] };
  } finally {
    lock.releaseLock();
  }
  return { ok: true, submissionId: meta.submissionId, rows: result.rows.length, organization: filer.organization, signedIn: filer.signedIn };
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
