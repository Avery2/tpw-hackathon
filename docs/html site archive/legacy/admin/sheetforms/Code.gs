/**
 * Intake receiver — an Apps Script web app that accepts a form submission and
 * appends it to a spreadsheet you own.
 *
 * Why this instead of the Sheets API in the browser: a member organization
 * should need no Google account, no consent screen and no GitHub account to
 * file a cycle. Deployed as "Execute as: Me" + "Who has access: Anyone", the
 * submitter is anonymous and this script writes with the owner's authority.
 * The alternative — every submitter authorizes a browser app with the
 * `spreadsheets` scope — needs Google verification past 100 users and asks
 * 120 organizations to grant a website write access to their own Drive.
 *
 * Store shape, deliberately boring: one row per submission, with the readable
 * columns up front and the whole submission as JSON in the last column. The
 * field contract lives in the repo (schema.json, simple_forms.json,
 * facilities.json) and this script fetches it, so there is no second schema to
 * drift — a wide table would have to be resynced every time the form changes.
 *
 * Rejection is the point. Unknown fields are refused, not stored, and the
 * required flags, the select enums (status, funding source, facility) and the
 * arithmetic are read from the same contract scripts/intake_validate.py reads.
 * So a row this endpoint accepts should also pass CI. It is not a replacement
 * for CI: there is no join spine, no cross-row duplicate detection and no
 * quality-flag derivation here.
 *
 * Exact-key refusal is not a filter. It cannot stop somebody typing a
 * participant's name into the `notes` textarea. The sheet is a working store,
 * never a publication: see "What it does not do" in README.md.
 *
 * CORS, honestly: Apps Script does not answer preflight requests, so the form
 * must POST with Content-Type text/plain (a "simple request", no preflight).
 * Apps Script also does not send CORS headers, so the browser cannot read this
 * function's reply. The reply is for the log and for a human curling the URL;
 * the browser gets a "sent" and keeps its own copy. See README.md.
 */

var PROP_KEY = 'SHARE_KEY';           // property NAME; rotate by changing its value in Script properties
var PROP_BASE = 'DATA_BASE_URL';      // where schema.json / simple_forms.json / facilities.json are served
var DEFAULT_BASE = 'https://www.averychan.site/tpw-hackathon/';
var PROP_SHEET = 'SHEET_ID';          // target spreadsheet; defaults to the bound one

var CACHE_SECONDS = 900;
var MAX_BYTES = 100 * 1024;           // measured in UTF-8 bytes, not JS string length
var RATE_LIMIT = 20;                  // submissions per minute per client bucket (?c=)
var RATE_LIMIT_SHARED = 240;          // ceiling across every client, per minute
var RATE_WINDOW = 60;
var LOCK_TIMEOUT_MS = 20000;

var SHEET_NAME = 'submissions';
var COLUMNS = ['received_at', 'id', 'kind', 'org', 'program', 'facility',
               'start_date', 'end_date', 'participants_started',
               'participants_completed', 'submitter_email', 'payload'];

// ---------------------------------------------------------------- entry points

function doGet() {
  var out = {
    ok: true,
    service: 'tpw intake receiver',
    accepts: 'POST text/plain JSON',
    sheet: null,
    note: ''
  };
  // A fresh, unbound project is a normal state during setup: report it as JSON
  // rather than an Apps Script error page, so the README's curl check works.
  try {
    out.sheet = sheet_().getName();
  } catch (err) {
    out.note = String((err && err.message) || err);
  }
  return jsonOut_(out);
}

/**
 * Body: either a bare object or {key: '…', payload: {…}}.
 * A key in the body beats no key; if SHARE_KEY is unset the endpoint is open,
 * which is why setup checks warn when it is.
 */
function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (!raw) return jsonOut_({ ok: false, error: 'empty-body' });
  var bytes = byteLength_(raw);
  if (bytes > MAX_BYTES) return jsonOut_({ ok: false, error: 'too-large', limit: MAX_BYTES, bytes: bytes });

  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'not-json' });
  }

  var expectedKey = prop_(PROP_KEY);
  if (expectedKey && String(body.key || '') !== expectedKey) {
    return jsonOut_({ ok: false, error: 'bad-key' });
  }

  var payload = normalize_(body.payload || body);
  // The bucket name is client-supplied, so it is a cost, not a control: a
  // caller can pick any bucket. With no bucket it still counts against the
  // shared per-minute ceiling, so one visitor cannot lock every organization
  // out by exhausting a single bucket.
  var client = normalizeId_((e && e.parameter && e.parameter.c) || '');
  var gate = rateGate_(client);
  if (!gate.ok) return jsonOut_({ ok: false, error: 'rate-limited', retryAfterSeconds: gate.retryAfter });

  var contract;
  try {
    contract = loadContract_();
  } catch (err) {
    return jsonOut_({ ok: false, error: 'contract-unavailable', detail: String(err && err.message || err) });
  }

  var verdict = validate_(payload, contract);
  if (!verdict.ok) return jsonOut_(verdict);

  // Serialize the read-then-write. Without it two first submissions can both
  // see an empty sheet and both append a header row.
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (err) {
    lock = null;   // no lock service in a test harness; the append is still single
  }

  try {
    var sheet = sheet_();
    ensureHeader_(sheet);
    if (duplicate_(sheet, payload.id)) {
      return jsonOut_({ ok: false, error: 'duplicate', id: payload.id });
    }

    var row = rowFor_(payload, new Date().toISOString());
    sheet.appendRow(row);
    return jsonOut_({ ok: true, id: payload.id, row: sheet.getLastRow(), sheet: sheet.getName() });
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (err) { /* already released */ }
    }
  }
}

// -------------------------------------------------------------------- contract

/**
 * Allowed field names, the required flags, the select enums and the facility
 * reference list, read from the repo's own contract files. Nothing here is a
 * hard-coded copy, so this endpoint and scripts/intake_validate.py cannot
 * disagree about what a valid cycle is. Anything added to schema.json is
 * accepted here automatically; anything removed is refused automatically.
 */
function loadContract_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('contract');
  if (hit) return JSON.parse(hit);

  var base = prop_(PROP_BASE) || DEFAULT_BASE;
  if (base.charAt(base.length - 1) !== '/') base += '/';

  var cycleSchema = fetchJson_(base + 'data/intake/schema.json');
  var simple = fetchJson_(base + 'data/intake/simple_forms.json');
  var facilities = fetchJson_(base + 'data/intake/facilities.json');

  var facilityNames = (facilities.facilities || []).map(function (f) { return f.name; }).filter(Boolean);

  var cycleFields = (cycleSchema.fields || []).map(fieldKey_).filter(Boolean);
  var recordFieldsByKind = {};
  var recordRulesByKind = {};
  var kinds = [];
  (simple.forms || []).forEach(function (form) {
    kinds.push(form.kind);
    recordFieldsByKind[form.kind] = (form.fields || []).map(fieldKey_).filter(Boolean);
    recordRulesByKind[form.kind] = rulesFor_(form.fields || [], facilityNames);
  });

  var contract = {
    cycleFields: cycleFields,
    cycleRules: rulesFor_(cycleSchema.fields || [], facilityNames),
    recordFieldsByKind: recordFieldsByKind,
    recordRulesByKind: recordRulesByKind,
    recordKinds: kinds,
    facilityNames: facilityNames,
    // Present on every record, set by the transport rather than the form.
    sharedFields: ['schema', 'kind', 'id', 'submitted_at', 'submitted_by', 'submitter_name', 'submitter_email', 'flags']
  };
  cache.put('contract', JSON.stringify(contract), CACHE_SECONDS);
  return contract;
}

function fieldKey_(f) {
  return f && (f.key || f.name || f.id);
}

/**
 * One rule per declared field, in the contract's own terms: type, required,
 * required_when, options, min, max (a value bound for numbers, a length bound
 * for text — same as the Python validator reads it).
 */
function rulesFor_(fields, facilityNames) {
  var rules = {};
  fields.forEach(function (f) {
    var key = fieldKey_(f);
    if (!key) return;
    var type = f.type || 'text';
    var options = f.options;
    // `source: 'facilities'` is how schema.json points at facilities.json, and
    // the quick forms use type 'facility' for the same thing.
    if (!options && (f.source === 'facilities' || type === 'facility')) {
      type = 'select';
      options = facilityNames;
    }
    rules[key] = {
      type: type,
      required: f.required === true,
      requiredWhen: f.required_when || null,
      options: options || null,
      min: typeof f.min === 'number' ? f.min : null,
      max: typeof f.max === 'number' ? f.max : null
    };
  });
  return rules;
}

function fetchJson_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('GET ' + url + ' -> HTTP ' + res.getResponseCode());
  }
  return JSON.parse(res.getContentText());
}

// ------------------------------------------------------------------ validation

/**
 * Pure: takes the submitted object, returns {ok:true} or {ok:false, error, detail}.
 * Rules, in the order that matters:
 *   1. anything that looks like an identifier of a person is refused outright
 *   2. fields not declared in the contract are refused (so a new field cannot
 *      quietly start collecting something nobody agreed to store)
 *   3. required flags, enums and value/length bounds come from the contract, so
 *      CI and this endpoint reject the same rows
 *   4. the cross-field arithmetic the CI validator already checks
 */
var FORBIDDEN = ['name', 'first_name', 'last_name', 'full_name', 'dob', 'date_of_birth',
                 'ssn', 'cdcr_number', 'cdc_number', 'inmate_number', 'address',
                 'phone', 'email_client', 'participant', 'participants'];
// Deliberately a second, narrower gate than the packet-upload blocklist in
// scripts/intake_documents.py (which also refuses fein/ein/tin/itin/tax_id and
// signature, because a RIGHT 4.0 packet carries those). Neither file declares
// `forbidden_fields` in the contract yet, so the two lists are kept aligned by
// hand: a person-identifier key added to one belongs in the other.

function validate_(payload, contract) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'not-an-object' };
  }
  if (!payload.id || typeof payload.id !== 'string') return { ok: false, error: 'missing-id' };
  // Same slug rule as scripts/intake_validate.py, so CI does not reject an id
  // this endpoint accepted.
  if (!/^[a-z0-9][a-z0-9-]{5,90}$/.test(payload.id)) return { ok: false, error: 'bad-id', detail: payload.id };

  var isCycle = !payload.kind || payload.kind === 'cycle';
  var allowed, rules;
  if (isCycle) {
    allowed = contract.cycleFields.concat(contract.sharedFields);
    rules = contract.cycleRules || {};
  } else {
    if (contract.recordKinds.indexOf(payload.kind) < 0) {
      return { ok: false, error: 'unknown-kind', detail: payload.kind, allowed: contract.recordKinds };
    }
    allowed = (contract.recordFieldsByKind[payload.kind] || []).concat(contract.sharedFields);
    rules = (contract.recordRulesByKind || {})[payload.kind] || {};
  }

  var keys = Object.keys(payload);
  var forbidden = keys.filter(function (k) { return FORBIDDEN.indexOf(k) >= 0; });
  if (forbidden.length) {
    return { ok: false, error: 'forbidden-field', detail: forbidden,
             hint: 'This endpoint stores program-level facts only, never anything identifying a person.' };
  }

  var unknown = keys.filter(function (k) { return allowed.indexOf(k) < 0; });
  if (unknown.length) {
    return { ok: false, error: 'unknown-field', detail: unknown,
             hint: 'Not declared in the contract. Add it to schema.json or simple_forms.json first.' };
  }

  var missing = missingRequired_(payload, rules);
  if (missing.length) return { ok: false, error: 'missing-field', detail: missing };

  var bad = checkFields_(payload, rules);
  if (bad) return bad;

  if (isCycle) {
    var arithmetic = checkCycleNumbers_(payload);
    if (arithmetic) return arithmetic;
  }

  return { ok: true };
}

/** Required fields, including `required_when` (e.g. end_date when Completed). */
function missingRequired_(payload, rules) {
  var out = [];
  Object.keys(rules).forEach(function (key) {
    var rule = rules[key];
    if (!isBlank_(payload[key])) return;
    if (rule.required) { out.push(key); return; }
    if (rule.requiredWhen && requiredWhenMet_(payload, rule.requiredWhen)) out.push(key);
  });
  return out;
}

function requiredWhenMet_(payload, when) {
  return Object.keys(when).every(function (k) {
    var allowed = when[k];
    return Array.isArray(allowed) ? allowed.indexOf(payload[k]) >= 0 : payload[k] === allowed;
  });
}

/** Type, enum and bound checks for every declared field that is present. */
function checkFields_(payload, rules) {
  var keys = Object.keys(payload);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var rule = rules[key];
    if (!rule || isBlank_(payload[key])) continue;
    var bad = checkField_(key, rule, payload[key]);
    if (bad) return bad;
  }
  return null;
}

function checkField_(key, rule, value) {
  var type = rule.type || 'text';

  if (type === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
      return { ok: false, error: 'bad-date', detail: key };
    }
    return null;
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !isFinite(value)) return { ok: false, error: 'bad-number', detail: key };
    if (type === 'integer' && Math.floor(value) !== value) return { ok: false, error: 'bad-number', detail: key };
    if (rule.min !== null && value < rule.min) {
      return { ok: false, error: 'out-of-range', detail: { field: key, min: rule.min } };
    }
    if (rule.max !== null && value > rule.max) {
      return { ok: false, error: 'out-of-range', detail: { field: key, max: rule.max } };
    }
    return null;
  }

  if (type === 'select') {
    if (!rule.options || !rule.options.length) return null;   // nothing to compare against
    if (rule.options.indexOf(value) < 0) {
      return { ok: false, error: 'bad-option', detail: key, allowed: rule.options };
    }
    return null;
  }

  if (type === 'list') {
    return Array.isArray(value) ? null : { ok: false, error: 'bad-type', detail: key };
  }

  if (typeof value !== 'string') return { ok: false, error: 'bad-type', detail: key };
  if (rule.max !== null && value.length > rule.max) {
    return { ok: false, error: 'too-long', detail: { field: key, max: rule.max } };
  }
  if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return { ok: false, error: 'bad-email', detail: key };
  }
  return null;
}

function checkCycleNumbers_(c) {
  var started = c.participants_started;
  var completed = c.participants_completed;
  var hours = c.course_hours;

  if (typeof started === 'number' && typeof completed === 'number' && completed > started) {
    return { ok: false, error: 'completions-exceed-starts', detail: { started: started, completed: completed } };
  }
  if (c.start_date && c.end_date && String(c.end_date) < String(c.start_date)) {
    return { ok: false, error: 'end-before-start', detail: { start: c.start_date, end: c.end_date } };
  }
  if (typeof hours === 'number' && typeof completed === 'number' && hours <= 0 && completed > 0) {
    return { ok: false, error: 'bad-number', detail: 'course_hours' };
  }
  return null;
}

function isBlank_(v) {
  return v === null || v === undefined || (typeof v === 'string' && !v.trim());
}

// ------------------------------------------------------------------------ sheet

function sheet_() {
  var id = prop_(PROP_SHEET);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No target spreadsheet. Set SHEET_ID or bind this script to a sheet.');
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow(COLUMNS);
}

/**
 * Duplicate check. Reads the whole id column on every write: fine at the scale
 * of a hackathon sheet (hundreds of rows), the first thing to index if this
 * ever holds thousands.
 */
function duplicate_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var ids = sheet.getRange(2, COLUMNS.indexOf('id') + 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return true;
  }
  return false;
}

function rowFor_(payload, receivedAt) {
  var cells = COLUMNS.map(function (col) {
    if (col === 'received_at') return receivedAt;
    if (col === 'payload') return JSON.stringify(payload);
    return payload[col] === undefined || payload[col] === null ? '' : payload[col];
  });
  return cells;
}

// ------------------------------------------------------------------ rate limit

/**
 * Two counters, on purpose:
 *   - one bucket per client, named by the form's ?c= value. Spoofable, so it is
 *     a cost, not a control.
 *   - one shared ceiling, so exhausting a client bucket (or omitting it) cannot
 *     lock every organization out of the endpoint for a minute.
 */
function rateGate_(client) {
  var cache = CacheService.getScriptCache();
  var window_ = Math.floor(Date.now() / (RATE_WINDOW * 1000));
  if (!spend_(cache, 'rl:all:' + window_, RATE_LIMIT_SHARED)) {
    return { ok: false, retryAfter: RATE_WINDOW };
  }
  if (client && !spend_(cache, 'rl:c:' + client + ':' + window_, RATE_LIMIT)) {
    return { ok: false, retryAfter: RATE_WINDOW };
  }
  return { ok: true };
}

/** Counts one against a bucket; false when that bucket is already full. */
function spend_(cache, bucket, limit) {
  var seen = Number(cache.get(bucket) || 0);
  if (seen >= limit) return false;
  cache.put(bucket, String(seen + 1), RATE_WINDOW);
  return true;
}

// --------------------------------------------------------------------- helpers

function prop_(name) {
  try {
    return PropertiesService.getScriptProperties().getProperty(name) || '';
  } catch (err) {
    return '';
  }
}

/**
 * UTF-8 length, not string length: `raw.length` counts UTF-16 units, so
 * 100k characters of a multi-byte script would sail past a 100 KB limit.
 */
function byteLength_(s) {
  try {
    return Utilities.newBlob(s).getBytes().length;
  } catch (err) {
    return String(s).length;   // harness without Utilities; length is the floor
  }
}

/** Bucket names come from the caller: keep them short and boring. */
function normalizeId_(value) {
  var clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return clean.slice(0, 64);
}

/**
 * People submit with spaces and capital letters. Normalize before validating,
 * so a display-friendly id is not a rejection reason.
 */
function normalize_(payload) {
  if (payload && typeof payload.id === 'string') {
    payload.id = payload.id.trim().toLowerCase().replace(/\s+/g, '-');
  }
  if (payload && typeof payload.kind === 'string') {
    payload.kind = payload.kind.trim().toLowerCase();
  }
  return payload;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
