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
