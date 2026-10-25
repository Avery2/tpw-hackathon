// Sign-in by emailed 6-digit code.
//
//   1. requestCode(email): if the email is on the Members tab, emails it a code that works for
//      10 minutes. The reply is the same whether or not the email is a member, so a stranger
//      can't use the form to find out who TPW works with.
//   2. verifyCode(email, code): if the code is right, starts a 2-hour pass (Session.gs) for the
//      organization the Members tab gives that email, and hands the page its token.
//
// The Members tab lives in the same spreadsheet as Submissions. TPW staff edit it by hand:
//   A  Email or @domain   one person (staff@grip.org), or everyone at a domain (@grip.org)
//   B  Organization       the name their rows are filed under
//   C  Active             "no" switches the row off; anything else, including blank, is on
//   D  Notes              anything; ignored here
// A domain row never works for free email providers (gmail.com and the like): otherwise one
// mistaken row would let anyone with a Gmail address file as that organization.
//
// Script Properties (optional):
//   TPW_CONTACT_EMAIL  shown to people who don't get a code, so they know who to ask
//   SENDER_NAME        the "from" name on code emails. Default: "TPW data form"

var MEMBERS_TAB = 'Members';
var MEMBERS_HEADER = ['Email or @domain', 'Organization', 'Active', 'Notes'];
var CODE_MINUTES = 10;
var CODE_TRIES = 5;
var CODE_GAP_SECONDS = 60;
var CODES_PER_HOUR = 5;
var FREE_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'cox.net', 'mail.com', 'gmx.com'
];

function requestCode(email) {
  try {
    email = cleanEmail_(email);
    if (!email) return { ok: false, errors: ['Enter your email address.'] };

    // Limits apply to every email alike, member or not, so they don't give anything away.
    // They stop someone flooding a member's inbox with code emails.
    var cache = CacheService.getScriptCache();
    if (cache.get('gap:' + email)) {
      return { ok: false, errors: ['We’ve just sent a code. Please wait a minute before asking for another.'] };
    }
    var asked = Number(cache.get('asked:' + email) || 0);
    if (asked >= CODES_PER_HOUR) {
      return { ok: false, errors: ['That’s a lot of codes in a short time. Please try again in an hour.'] };
    }
    cache.put('gap:' + email, '1', CODE_GAP_SECONDS);
    cache.put('asked:' + email, String(asked + 1), 60 * 60);

    var organization = organizationFor_(email);
    if (organization) {
      var code = newCode_();
      var expiresAt = Date.now() + CODE_MINUTES * 60 * 1000;
      cache.put('code:' + email, JSON.stringify({ code: code, tries: 0, expiresAt: expiresAt }), CODE_MINUTES * 60);
      sendCodeEmail_(email, code, organization);
    }
    return { ok: true, minutes: CODE_MINUTES, contact: setting_('TPW_CONTACT_EMAIL', '') };
  } catch (error) {
    console.error(error);
    return { ok: false, errors: ['We couldn’t send a code just now. Please try again in a minute.'] };
  }
}

function verifyCode(email, code) {
  try {
    email = cleanEmail_(email);
    code = String(code || '').replace(/\D/g, '');
    var cache = CacheService.getScriptCache();
    var stored = cache.get('code:' + email);
    if (!email || !stored) {
      return { ok: false, errors: ['That code has run out, or we haven’t sent one to this email. Ask for a new code.'] };
    }
    var entry = JSON.parse(stored);
    if (code !== entry.code) {
      entry.tries += 1;
      if (entry.tries >= CODE_TRIES) {
        cache.remove('code:' + email);
        return { ok: false, errors: ['Too many wrong tries. Ask for a new code.'] };
      }
      // Keep the original expiry rather than giving the code a fresh 10 minutes.
      var secondsLeft = Math.max(1, Math.floor((entry.expiresAt - Date.now()) / 1000));
      cache.put('code:' + email, JSON.stringify(entry), secondsLeft);
      var left = CODE_TRIES - entry.tries;
      return { ok: false, errors: ['That code isn’t right. ' + left + (left === 1 ? ' try' : ' tries') + ' left.'] };
    }
    cache.remove('code:' + email);

    // Look again rather than trusting the earlier lookup: TPW may have switched the row off since.
    var organization = organizationFor_(email);
    if (!organization) return { ok: false, errors: ['This email can’t file for an organization any more. Please contact TPW.'] };
    var token = createSession_(email, organization);
    return { ok: true, token: token, organization: organization, email: email, hours: SESSION_HOURS };
  } catch (error) {
    console.error(error);
    return { ok: false, errors: ['We couldn’t check that code just now. Please try again in a minute.'] };
  }
}

// The organization an email may file for, or '' if none. A row for the exact email wins over
// a row for its domain.
function organizationFor_(email) {
  var rows = memberRows_();
  var domain = email.split('@')[1];
  var byDomain = '';
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][0] || '').trim().toLowerCase();
    var organization = String(rows[i][1] || '').trim();
    var active = String(rows[i][2] || '').trim().toLowerCase();
    if (!key || !organization || active === 'no') continue;
    if (key === email) return organization;
    if (!byDomain && key.charAt(0) === '@' && key.slice(1) === domain && FREE_EMAIL_DOMAINS.indexOf(domain) < 0) {
      byDomain = organization;
    }
  }
  return byDomain;
}

// Reads the Members tab, making it (with its header) if it isn't there yet.
function memberRows_() {
  var id = spreadsheetId();
  var book = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties.title' });
  var exists = (book.sheets || []).some(function (sheet) { return sheet.properties.title === MEMBERS_TAB; });
  if (!exists) {
    Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: MEMBERS_TAB, gridProperties: { frozenRowCount: 1 } } } }] }, id);
    Sheets.Spreadsheets.Values.update({ values: [MEMBERS_HEADER] }, id, MEMBERS_TAB + '!A1', { valueInputOption: 'RAW' });
    return [];
  }
  return Sheets.Spreadsheets.Values.get(id, MEMBERS_TAB + '!A2:C').values || [];
}

function sendCodeEmail_(email, code, organization) {
  MailApp.sendEmail({
    to: email,
    name: setting_('SENDER_NAME', 'TPW data form'),
    subject: 'Your TPW form code: ' + code,
    body: 'Your code to file numbers for ' + organization + ' with Transformative Programming Works is:\n\n' +
      '    ' + code + '\n\n' +
      'It works for ' + CODE_MINUTES + ' minutes. Type it into the form where you asked for it.\n\n' +
      'If you didn’t ask for a code, you can ignore this email. Nobody can file without it.'
  });
}

// Six random digits. Apps Script's UUIDs come from a secure random source; Math.random doesn't.
function newCode_() {
  var number = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  return ('000000' + number).slice(-6);
}

function cleanEmail_(email) {
  var value = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200 ? value : '';
}

function setting_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback;
}
