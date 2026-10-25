// The hand-over point between sign-in and the sheet writer.
//
// Sign-in (the emailed 6-digit code, built separately) checks the person's email against
// TPW's member list. When the code is right it calls createSession(email, organization) and
// gives the returned token to the page. The page sends that token with the submission, and
// the writer calls getSession(token) to learn which organization is filing.
//
// The organization always comes from here, never from what the page says, so editing the
// page in a browser can't file numbers as someone else.
//
// Passes live in Apps Script's cache, which Google clears after at most 6 hours.

var SESSION_HOURS = 2;

function createSession(email, organization) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var session = { email: String(email), organization: String(organization), createdAt: new Date().toISOString() };
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(session), SESSION_HOURS * 60 * 60);
  return token;
}

// Returns { email, organization, createdAt }, or null if the token is missing, unknown or expired.
function getSession(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  var stored = CacheService.getScriptCache().get('session:' + token);
  return stored ? JSON.parse(stored) : null;
}

function endSession(token) {
  if (typeof token === 'string') CacheService.getScriptCache().remove('session:' + token);
}
