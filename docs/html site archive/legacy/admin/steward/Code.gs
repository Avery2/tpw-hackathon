/**
 * TPW steward console — an Apps Script web app.
 *
 * What it is: a permission-aware view over the artifacts this repo already
 * publishes (orgs/index.json, cycles/index.json, seed.json, schema.json).
 * Every number on the page is read from those files, so the console cannot
 * drift from the site: if it disagrees with the site, the site is wrong, not
 * this code.
 *
 * What it is NOT: a secret channel. Everything it reads is public in git.
 * The point of the Google sign-in gate is authority to *act* (approve, chase,
 * correct) and a per-organization working view — not confidentiality. Never
 * put per-participant data, org secrets or anything identifying in here: a
 * boundary that only exists because nobody looked is not a boundary.
 *
 * Roles, decided on the server, never in the page:
 *   steward  — email is listed in the LEADER_EMAILS script property.
 *              Sees per-organization rows and which org owns each flagged cycle.
 *   viewer   — any other signed-in Google account. Sees the combined figures
 *              and rule counts only, no organization names. This mirrors the
 *              `min_cohort_for_release` rule in schema.json: the collective is
 *              shared, one organization's numbers are not.
 *
 * Deployment notes (full steps in README.md):
 *   - Execute as: Me  |  Who has access: Anyone with a Google account
 *   - "Anyone with a Google account" is required: with plain "Anyone" the
 *     caller is anonymous and Session.getActiveUser().getEmail() comes back
 *     empty, which this code reports as `no-identity` rather than guessing.
 *   - Script properties: LEADER_EMAILS (comma or newline separated),
 *     DATA_BASE_URL (optional; defaults to the GitHub Pages site).
 */

var PROP_LEADERS = 'LEADER_EMAILS';
var PROP_BASE = 'DATA_BASE_URL';
var DEFAULT_BASE = 'https://www.averychan.site/tpw-hackathon/';
var CACHE_SECONDS = 900;

var SOURCE_PATHS = {
  orgs: 'data/intake/orgs/index.json',
  cycles: 'data/intake/cycles/index.json',
  seed: 'data/intake/seed.json',
  schema: 'data/intake/schema.json'
};

// ---------------------------------------------------------------- entry points

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('TPW steward console')
    // Same-origin at most: the page shows per-organization rows, so it has no
    // business being framed by somebody else's page.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

/** Called by Index.html through google.script.run. */
function getConsole() {
  var caller = callerEmail_();

  if (!caller) {
    return {
      ok: false,
      code: 'no-identity',
      hint: 'Apps Script could not see a signed-in Google account. Deploy with access '
        + '"Anyone with a Google account" (not plain "Anyone") and keep "Execute as: Me".'
    };
  }

  var leaders = leaderList_();
  if (!leaders.length) {
    return {
      ok: false,
      code: 'no-leaders-configured',
      caller: caller,
      hint: 'Set the script property ' + PROP_LEADERS + ' to a comma-separated list of '
        + 'steward emails. Start with ' + caller + ' — that is you.'
    };
  }

  var sources;
  try {
    sources = loadSources_();
  } catch (err) {
    return { ok: false, code: 'source-unavailable', caller: caller, hint: String(err && err.message || err) };
  }

  var view = buildView_(sources);

  if (leaders.indexOf(caller) < 0) {
    // Aggregate-only. Organization rows never leave the server for a viewer.
    return {
      ok: true,
      role: 'viewer',
      caller: caller,
      view: {
        generatedAt: view.generatedAt,
        kpis: view.kpis,
        attention: view.attention.map(function (a) {
          return { rule: a.rule, level: a.level, message: a.message, cycles: a.cycles };
        }),
        orgs: []
      }
    };
  }

  return { ok: true, role: 'steward', caller: caller, view: view };
}

// ------------------------------------------------------------------- identity

function callerEmail_() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    email = '';
  }
  return String(email).trim().toLowerCase();
}

function leaderList_() {
  var raw = '';
  try {
    raw = PropertiesService.getScriptProperties().getProperty(PROP_LEADERS) || '';
  } catch (err) {
    raw = '';
  }
  return raw.split(/[\s,;]+/).map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s.length > 0; });
}

// -------------------------------------------------------------------- sources

function baseUrl_() {
  var base = '';
  try {
    base = PropertiesService.getScriptProperties().getProperty(PROP_BASE) || '';
  } catch (err) {
    base = '';
  }
  base = base || DEFAULT_BASE;
  return base.charAt(base.length - 1) === '/' ? base : base + '/';
}

function loadSources_() {
  var out = {};
  Object.keys(SOURCE_PATHS).forEach(function (key) {
    out[key] = fetchJson_(baseUrl_() + SOURCE_PATHS[key]);
  });
  return out;
}

/** Public JSON only: no auth, no token, nothing to leak. Cached for 15 minutes. */
function fetchJson_(url) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(url);
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    throw new Error('GET ' + url + ' -> HTTP ' + code + ' (is the site deployed and is the path right?)');
  }
  try {
    JSON.parse(body);
  } catch (err) {
    throw new Error('GET ' + url + ' did not return JSON — check DATA_BASE_URL (' + String(err) + ')');
  }
  cache.put(url, body, CACHE_SECONDS);
  return JSON.parse(body);
}

// ----------------------------------------------------------------- view model
// Everything below is pure: it takes parsed JSON and returns a view model, so
// it can be exercised from the command line (see test/run.mjs) without a
// Google account, a deployment, or a network.

function buildView_(sources) {
  var orgs = (sources.orgs && sources.orgs.orgs) || [];
  var imported = (sources.seed && sources.seed.cycles) || [];
  var committed = (sources.cycles && sources.cycles.cycles) || [];
  var levels = ruleLevels_(sources.schema);

  // One row per cycle id: a committed cycle supersedes the imported copy of it.
  var byId = {};
  imported.forEach(function (c) { byId[c.id] = c; });
  committed.forEach(function (c) { byId[c.id] = c; });
  var cycles = Object.keys(byId).map(function (k) { return byId[k]; });

  var sample = cycles.filter(function (c) { return hasFlag_(c, 'sample-data'); });
  var orgNames = {};
  orgs.forEach(function (o) { orgNames[o.id] = o.org; });

  return {
    generatedAt: (sources.orgs && sources.orgs.generated_at) || (sources.seed && sources.seed.generated_at) || null,
    kpis: {
      organizations: orgs.length,
      cycles: cycles.length,
      importedCycles: imported.length,
      committedCycles: committed.length,
      sampleCycles: sample.length,
      realCycles: cycles.length - sample.length,
      participantSlotsStarted: sumField_(cycles, 'participants_started'),
      participantSlotsCompleted: sumField_(cycles, 'participants_completed'),
      lastActivity: maxDate_(orgs.map(function (o) { return o.last_activity; }))
    },
    orgs: orgs.map(function (o) {
      return {
        id: o.id,
        org: o.org,
        cycles: o.cycles,
        realCycles: o.real_cycles,
        sampleCycles: o.sample_cycles,
        lastActivity: o.last_activity || null,
        programs: (o.programs || []).length,
        sites: distinctSites_(o.programs)
      };
    }).sort(function (a, b) { return (b.cycles || 0) - (a.cycles || 0); }),
    attention: attention_(cycles, levels, orgNames)
  };
}

/** Which quality rule ids are errors, warnings or info — from the contract, not hard-coded. */
function ruleLevels_(schema) {
  var out = {};
  var rules = (schema && schema.quality_rules) || [];
  rules.forEach(function (r) { out[r.id] = r.level; });
  return out;
}

function attention_(cycles, levels, orgNames) {
  var byRule = {};
  cycles.forEach(function (c) {
    (c.flags || []).forEach(function (flag) {
      var level = levels[flag];
      if (!level || level === 'info') return;   // info is not something to chase
      var entry = byRule[flag] || (byRule[flag] = {
        rule: flag, level: level, message: '', cycles: 0, orgs: []
      });
      entry.cycles += 1;
      var name = orgNames[c.org_id] || c.org || '(unknown organization)';
      if (entry.orgs.indexOf(name) < 0) entry.orgs.push(name);
    });
  });

  var rank = { error: 0, warning: 1 };
  return Object.keys(byRule).map(function (k) { return byRule[k]; }).sort(function (a, b) {
    if (rank[a.level] !== rank[b.level]) return rank[a.level] - rank[b.level];
    if (b.cycles !== a.cycles) return b.cycles - a.cycles;
    return a.rule < b.rule ? -1 : 1;
  });
}

function hasFlag_(cycle, flag) {
  return (cycle.flags || []).indexOf(flag) >= 0;
}

function sumField_(rows, field) {
  return rows.reduce(function (total, r) {
    var v = r[field];
    return total + (typeof v === 'number' && isFinite(v) ? v : 0);
  }, 0);
}

function maxDate_(values) {
  var best = null;
  (values || []).forEach(function (v) {
    if (!v) return;
    if (best === null || String(v) > String(best)) best = v;
  });
  return best;
}

function distinctSites_(programs) {
  var seen = {};
  (programs || []).forEach(function (p) {
    (p.sites || []).forEach(function (s) { seen[s.id] = true; });
  });
  return Object.keys(seen).length;
}
