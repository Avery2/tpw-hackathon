// GENERATED standalone receiver: paste this whole file into a NEW project.
// Do NOT install in the working guided-quarterly project.
// Includes Code.gs + RemoteConfig.gs; do not add Config.gs as well.

// STANDALONE additional-forms Apps Script project. Do not paste into the working
// quarterly project. Needs Config.gs and the advanced Sheets API (v4).
// Properties: SPREADSHEET_ID (same private master workbook), ALLOW_UNSIGNED.
// No dependency on quarterly Rows.gs, Sheet.gs, Session.gs or its deployment.
var RECORD_HEADERS_ = ['Record ID', 'Submission reference', 'Received at', 'Organization', 'Signed in', 'Source', 'Program', 'Facility', 'Facilities', 'Session date', 'Quarter', 'Participant ID', 'Release date', 'Status', 'People present', 'People served', 'People completed', 'Notes', 'Record (JSON)', 'Receipt (JSON)'];

function doGet() {
  try {
    var forms = approvedForms_(), tabs = {};
    Object.keys(forms).forEach(function (kind) { tabs[kind] = forms[kind].tab; });
    return json_({ ok: true, service: ADDITIONAL_FORMS_CONFIG_.service, version: ADDITIONAL_FORMS_CONFIG_.version,
      features: { quickRecords: true }, recordKinds: Object.keys(forms), recordTabs: tabs });
  } catch (error) { return recordFailure_(error); }
}

function doPost(e) {
  try {
    var text = e && e.postData ? e.postData.contents : '';
    if (typeof text !== 'string' || text.length > 250000) throw recordError_('The request is too large or unreadable.');
    var body;
    try { body = JSON.parse(text); } catch (error) { throw recordError_('The request was not readable.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.action !== 'submitRecord' ||
        Object.keys(body).some(function (key) { return key !== 'action' && key !== 'payload'; })) {
      throw recordError_('Use the additional-forms submitRecord action with a payload only. No destination or quarterly credentials are accepted.');
    }
    return json_(handleRecord_(body.payload));
  } catch (error) { return recordFailure_(error); }
}

// Only steward-approved configuration can choose a destination; never the caller.
// Runtime checks also protect the guided tabs if someone hand-edits Config.gs.
function approvedForms_() {
  if (typeof ADDITIONAL_FORMS_CONFIG_ === 'undefined' || ADDITIONAL_FORMS_CONFIG_.schema !== 'tpw.additional-forms/1') {
    throw recordError_('Install the generated additional-forms Config.gs in this standalone project.');
  }
  var forms = ADDITIONAL_FORMS_CONFIG_.forms, used = {};
  if (!forms || !Object.keys(forms).length) throw recordError_('No additional forms are approved.');
  Object.keys(forms).forEach(function (kind) {
    var tab = forms[kind].tab;
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(kind) || /^(?:constructor|prototype|__proto__)$/.test(kind) ||
        typeof tab !== 'string' || !/^[A-Za-z][A-Za-z0-9 _-]{0,79}$/.test(tab)) throw recordError_('The approved form mapping is invalid.');
    var key = tab.toLowerCase();
    if (used[key] || /^(?:submissions|form responses)/.test(key) || /^(?:members|constants|data entry sheet)$/.test(key)) {
      throw recordError_('An additional form targets a duplicate or reserved workbook tab. No data was changed.');
    }
    used[key] = true;
  });
  return forms;
}

function handleRecord_(payload) {
  var forms = approvedForms_();
  // This project deliberately does not share quarterly session tokens. Demo-only
  // unsigned writes require an explicit opt-in; otherwise all writes are disabled.
  if (PropertiesService.getScriptProperties().getProperty('ALLOW_UNSIGNED') !== 'true') {
    return { ok: false, errors: ['Additional-form writes are disabled. The steward must enable synthetic demo mode or implement authentication in this separate project.'] };
  }
  var checked = validateRecord_(payload, forms);
  if (checked.errors.length) return { ok: false, errors: checked.errors };
  var record = checked.record, canonical = canonicalRecord_(record);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, errors: ['The sheet is busy. Please retry with this page still open.'] };
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id || !/^[A-Za-z0-9_-]{20,}$/.test(id)) throw recordError_('Set SPREADSHEET_ID in this standalone project to the private master workbook ID.');
    var book = Sheets.Spreadsheets.get(id, { fields: 'sheets.properties' }), existing = {};
    (book.sheets || []).forEach(function (sheet) { existing[sheet.properties.title] = true; });
    var previous = null;
    // Read only the approved additional-form tabs. The quarterly project can
    // append concurrently to its own tab: these projects never share a target.
    Object.keys(forms).forEach(function (kind) {
      var tab = forms[kind].tab;
      if (!existing[tab]) return;
      var headings = (Sheets.Spreadsheets.Values.get(id, recordRange_(tab, '1:1')).values || [])[0] || [];
      if (JSON.stringify(headings) !== JSON.stringify(RECORD_HEADERS_)) throw recordError_('The private tab "' + tab + '" has unexpected headings. Ask the steward to check it; no data was changed.');
      var rows = Sheets.Spreadsheets.Values.get(id, recordRange_(tab, 'A2:T')).values || [];
      rows.forEach(function (row) {
        if (row[0] !== record.id) return;
        if (previous || row[3] !== record.org || row[18] !== canonical) throw recordError_('This record ID has already been used with different content. Check the saved row before starting a new entry.');
        var receipt;
        try { receipt = JSON.parse(row[19]); } catch (error) { throw recordError_('The saved receipt needs steward attention. No data was changed.'); }
        if (!receipt || receipt.ok !== true || receipt.recordId !== record.id || receipt.organization !== record.org || receipt.tab !== tab || receipt.rows !== 1 || typeof receipt.submissionId !== 'string') throw recordError_('The saved receipt needs steward attention. No data was changed.');
        previous = receipt;
      });
    });
    if (previous) return previous;
    var tab = forms[record.kind].tab;
    if (!existing[tab]) {
      var ids = (book.sheets || []).map(function (sheet) { return sheet.properties.sheetId; });
      var sheetId = 1;
      while (ids.indexOf(sheetId) >= 0) sheetId++;
      // One atomic batch: a failed header write must never leave an empty tab
      // that blocks all approved forms on their next attempt.
      Sheets.Spreadsheets.batchUpdate({ requests: [
        { addSheet: { properties: { sheetId: sheetId, title: tab, gridProperties: { rowCount: 1000, columnCount: 26 } } } },
        { updateCells: { start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 },
          rows: [{ values: RECORD_HEADERS_.map(function (heading) { return { userEnteredValue: { stringValue: heading } }; }) }],
          fields: 'userEnteredValue' } }
      ] }, id);
    }
    var reply = { ok: true, submissionId: Utilities.getUuid().toUpperCase(), recordId: record.id, tab: tab, rows: 1, organization: record.org, signedIn: false };
    var row = [record.id, reply.submissionId, new Date().toISOString(), record.org, false, record.source || '', record.program || '', record.facility || '', recordCell_(record.facilities), record.session_date || '', record.quarter || '', record.token || '', record.release_date || '', record.status || '', recordCell_(record.present_count), recordCell_(record.served), recordCell_(record.completed), record.notes || '', canonical, JSON.stringify(reply)].map(recordCell_);
    // Append data + durable receipt atomically. RAW keeps formula-like text inert.
    Sheets.Spreadsheets.Values.append({ values: [row] }, id, recordRange_(tab, 'A:T'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    return reply;
  } catch (error) {
    console.error('Additional-form write failed; check configuration and execution log.');
    return { ok: false, errors: [error.userMessage || 'Could not confirm the private Sheet write. Keep this page open and retry unchanged with the same record ID.'] };
  } finally { lock.releaseLock(); }
}

function validateRecord_(input, forms) {
  var errors = [], record = {};
  function fail(key) { errors.push('Invalid or unsupported field: ' + key + '.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['The record must be an object.'] };
  if (typeof input.kind !== 'string' || !Object.prototype.hasOwnProperty.call(forms, input.kind)) return { errors: ['This form kind is not approved for the additional-forms receiver.'] };
  if (JSON.stringify(input).length > 20000) return { errors: ['The record exceeds 20,000 characters.'] };
  var form = forms[input.kind], fields = form.fields;
  var allowed = { id: true, kind: true, schema: true, source: true, submitted_at: true };
  Object.keys(fields).forEach(function (key) { allowed[key] = true; });
  Object.keys(input).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(allowed, key)) fail(key); });
  if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]{5,120}$/.test(input.id)) fail('id');
  if (input.schema !== form.schema) fail('schema');
  if (form.sources.indexOf(input.source) < 0) fail('source');
  if (!recordTimestamp_(input.submitted_at)) fail('submitted_at');
  ['id', 'kind', 'schema', 'source', 'submitted_at'].forEach(function (key) { record[key] = input[key]; });
  Object.keys(fields).forEach(function (key) {
    var spec = fields[key], value = input[key];
    var active = !spec.show_if || Object.keys(spec.show_if).every(function (other) { return input[other] === spec.show_if[other]; });
    if (value === undefined || value === null || value === '') {
      if (spec.required && active) fail(key);
      return;
    }
    if (!active) { fail(key + ' (not applicable)'); return; }
    var valid = true;
    if (spec.type === 'integer') {
      valid = typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= (spec.min === undefined ? 0 : spec.min) && value <= spec.max;
    } else if (spec.type === 'date') {
      valid = recordDate_(value);
    } else if (spec.type === 'facility') {
      valid = ADDITIONAL_FORMS_CONFIG_.facilities.indexOf(value) >= 0;
    } else if (spec.type === 'facilities') {
      valid = Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(function (item, index) { return typeof item === 'string' && ADDITIONAL_FORMS_CONFIG_.facilities.indexOf(item) >= 0 && value.indexOf(item) === index; });
    } else if (spec.type === 'select' || spec.type === 'choice') {
      valid = spec.options.indexOf(value) >= 0;
    } else if (spec.type === 'list') {
      valid = Array.isArray(value) && value.length <= spec.max_items && value.every(function (item, index) { return typeof item === 'string' && item.length > 0 && item.length <= spec.max_length && value.indexOf(item) === index && recordFormat_(item, spec.format); });
    } else if (spec.type === 'text' || spec.type === 'textarea') {
      valid = typeof value === 'string' && value.length <= (spec.max || 200) && !!value.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) && recordFormat_(value, spec.format);
    } else { valid = false; }
    if (!valid) fail(key); else record[key] = value;
  });
  (form.rules || []).forEach(function (rule) {
    var value = record[rule.field], other = record[rule.of];
    if (rule.type === 'subset') {
      if (value && (!other || value.some(function (item) { return other.indexOf(item) < 0; }))) fail(rule.field + ' (not in ' + rule.of + ')');
    } else if (rule.type === 'count') {
      if (other && value !== undefined && value !== other.length) fail(rule.field + ' (does not match ' + rule.of + ')');
    } else if (rule.type === 'lte') {
      if (value !== undefined && other !== undefined && value > other) fail(rule.field + ' (exceeds ' + rule.of + ')');
    } else { fail('unsupported validation rule'); }
  });
  return { errors: errors, record: record };
}

function recordFormat_(value, name) {
  if (!name) return true;
  if (name === 'sheetTemplate') return ADDITIONAL_FORMS_CONFIG_.templates.indexOf(value) >= 0;
  var pattern = ADDITIONAL_FORMS_CONFIG_.formats[name];
  return typeof pattern === 'string' && new RegExp(pattern).test(value);
}
function recordDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) < '1900' || value.slice(0, 4) > '2100') return false;
  var date = new Date(value + 'T00:00:00.000Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function recordTimestamp_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !recordDate_(value.slice(0, 10))) return false;
  var date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
}
function canonicalRecord_(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalRecord_).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalRecord_(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}
function recordRange_(tab, cells) { return "'" + tab.replace(/'/g, "''") + "'!" + cells; }
function recordCell_(value) { return value === undefined || value === null ? '' : Array.isArray(value) ? value.join('; ') : value; }
function recordError_(message) { var error = new Error(message); error.userMessage = message; return error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function recordFailure_(error) { return json_({ ok: false, errors: [error.userMessage || 'The additional-forms receiver could not process this request.'] }); }

// STANDALONE additional-forms project ONLY. Install this INSTEAD OF Config.gs.
// Code.gs is unchanged. No quarterly project, token or deployment is involved.
// Optional steward-only Script Property: RECORD_CONFIG_URL (a public HTTPS JSON URL).
// The browser cannot choose this URL, a schema, a workbook or a destination tab.
var ADDITIONAL_FORMS_CONFIG_ = remoteRecordConfigView_();

// Lazy getters defer network errors until INSIDE Code.gs's JSON error handlers.
// One validated snapshot is used throughout a request, even if the cache expires.
function remoteRecordConfigView_() {
  var view = {}, snapshot;
  ['schema', 'service', 'version', 'revision', 'forms', 'facilities', 'templates', 'formats'].forEach(function (key) {
    Object.defineProperty(view, key, { enumerable: true, get: function () {
      if (!snapshot) snapshot = loadRemoteRecordConfig_();
      return snapshot[key];
    } });
  });
  return view;
}

function remoteRecordConfigError_() {
  var error = new Error('Approved additional-form configuration is unavailable or invalid. No record was saved. Please retry later or ask the steward to check the published configuration.');
  error.userMessage = error.message;
  return error;
}

function loadRemoteRecordConfig_() {
  try {
    var url = PropertiesService.getScriptProperties().getProperty('RECORD_CONFIG_URL') ||
      'https://www.averychan.site/tpw-hackathon/data/intake/additional_forms.runtime.json';
    if (typeof url !== 'string' || url.length > 2000 || !/^https:\/\/[A-Za-z0-9.-]+\/[\x21-\x7e]*\.json(?:\?[^#\s]*)?$/.test(url) || /[@#]/.test(url)) throw remoteRecordConfigError_();
    var cache, hit;
    try {
      cache = CacheService.getScriptCache();
      hit = cache.get('additional-forms:remote:v1');
      if (hit && hit.length <= 250000) {
        var stored = JSON.parse(hit);
        if (stored.url === url) return validateRemoteRecordConfig_(stored.config);
      }
    } catch (error) { /* Corrupt/unavailable cache is not a reason to trust it or block a fresh fetch. */ }
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false, headers: { 'Cache-Control': 'no-cache' } });
    if (response.getResponseCode() !== 200) throw remoteRecordConfigError_();
    var text = response.getContentText();
    if (typeof text !== 'string' || text.length > 250000) throw remoteRecordConfigError_();
    var config = validateRemoteRecordConfig_(JSON.parse(text));
    // CacheService has a 100 KB limit. 30K UTF-16 units fit even with UTF-8 text.
    var encoded = JSON.stringify({ url: url, config: config });
    if (cache && encoded.length <= 30000) {
      try { cache.put('additional-forms:remote:v1', encoded, 300); } catch (error) { /* Best-effort cache only. */ }
    }
    return config;
  } catch (error) { throw remoteRecordConfigError_(); }
}

// JSON is data, never eval'd code. Reject malformed policy before ANY Sheets call.
function validateRemoteRecordConfig_(config) {
  function check(ok) { if (!ok) throw remoteRecordConfigError_(); }
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim(); }
  function integer(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 1000000; }
  function identifier(value) { return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value) && !/^(?:id|kind|schema|source|submitted_at|__proto__|constructor|prototype)$/.test(value); }
  function list(value) { return Array.isArray(value) && value.length > 0 && value.every(function (item, i) { return text(item) && value.indexOf(item) === i; }); }
  function keys(value, allowed) { check(object(value) && Object.keys(value).every(function (key) { return allowed.indexOf(key) >= 0; })); }
  keys(config, ['schema','service','version','revision','forms','facilities','templates','formats']);
  check(config.schema === 'tpw.additional-forms/1' && config.service === 'tpw.additional-forms' && config.version === 1);
  check(typeof config.revision === 'string' && /^[a-f0-9]{64}$/.test(config.revision));
  check(list(config.facilities) && list(config.templates) && object(config.formats) && object(config.forms));
  Object.keys(config.formats).forEach(function (name) {
    var pattern = config.formats[name];
    check(/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name) && name !== 'sheetTemplate' && text(pattern) && pattern.length <= 500 && pattern[0] === '^' && pattern[pattern.length - 1] === '$');
    try { new RegExp(pattern); } catch (error) { throw remoteRecordConfigError_(); }
  });
  var used = Object.create(null), kinds = Object.keys(config.forms);
  check(kinds.length > 0 && kinds.length <= 100);
  kinds.forEach(function (kind) {
    check(identifier(kind));
    var form = config.forms[kind];
    keys(form, ['tab','schema','sources','fields','rules']);
    check(text(form.tab) && /^[A-Za-z][A-Za-z0-9 _-]{0,79}$/.test(form.tab));
    var tab = form.tab.toLowerCase();
    check(!own(used, tab) && !/^(?:submissions|form responses)/.test(tab) && !/^(?:members|constants|data entry sheet)$/.test(tab));
    used[tab] = true;
    check(text(form.schema) && list(form.sources) && object(form.fields) && Object.keys(form.fields).length <= 500 && Array.isArray(form.rules));
    check(own(form.fields, 'org') && form.fields.org.type === 'text' && form.fields.org.required === true);
    Object.keys(form.fields).forEach(function (name) {
      check(identifier(name));
      // A public contract must not accidentally authorize direct identifiers or raw uploads.
      check(!/^(?:name|first_name|last_name|full_name|participant_name|cdcr_number|cdc_number|inmate_number|dob|date_of_birth|ssn|ein|fein|tin|itin|tax_id|signature|photo|image|pdf|files|authorization|password|secret)$/.test(name));
      var spec = form.fields[name];
      keys(spec, ['type','required','min','max','max_items','max_length','options','show_if','format']);
      check(['text','textarea','integer','date','facility','facilities','select','choice','list'].indexOf(spec.type) >= 0);
      if (own(spec, 'required')) check(typeof spec.required === 'boolean');
      var permitted = ['type','required','show_if'];
      if (spec.type === 'text' || spec.type === 'textarea') permitted = permitted.concat(['max','format']);
      if (spec.type === 'integer') { permitted = permitted.concat(['min','max']); check(own(spec,'max')); }
      if (spec.type === 'list') { permitted = permitted.concat(['max_items','max_length','format']); check(own(spec,'max_items') && own(spec,'max_length')); }
      if (spec.type === 'select' || spec.type === 'choice') { permitted.push('options'); check(list(spec.options)); }
      check(Object.keys(spec).every(function (key) { return permitted.indexOf(key) >= 0; }));
      ['min','max','max_items','max_length'].forEach(function (key) { if (own(spec,key)) check(integer(spec[key])); });
      if (own(spec,'min') && own(spec,'max')) check(spec.min <= spec.max);
      if (own(spec,'format')) check(text(spec.format) && (spec.format === 'sheetTemplate' || own(config.formats,spec.format)));
      if (own(spec,'show_if')) {
        check(object(spec.show_if) && Object.keys(spec.show_if).length > 0);
        Object.keys(spec.show_if).forEach(function (other) {
          var expected = spec.show_if[other];
          check(other !== name && own(form.fields,other) && ['string','number','boolean'].indexOf(typeof expected) >= 0);
          if (form.fields[other].options) check(form.fields[other].options.indexOf(expected) >= 0);
        });
      }
    });
    form.rules.forEach(function (rule) {
      keys(rule, ['type','field','of']);
      check(own(form.fields,rule.field) && own(form.fields,rule.of));
      var left = form.fields[rule.field].type, right = form.fields[rule.of].type;
      check((rule.type === 'subset' && left === 'list' && right === 'list') || (rule.type === 'count' && left === 'integer' && right === 'list') || (rule.type === 'lte' && left === 'integer' && right === 'integer'));
    });
  });
  return config;
}
