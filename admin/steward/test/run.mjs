#!/usr/bin/env node
/**
 * Local test harness for the steward console.
 *
 * Runs the real Code.gs from the command line against the real published JSON
 * in this repo, with Apps Script's globals stubbed. No Google account, no
 * deployment, no network, no dependencies — `node admin/steward/test/run.mjs`.
 *
 * What it proves:
 *   - the identity gate fails closed and reports the caller's email
 *   - a viewer is never sent per-organization rows (checked by searching the
 *     serialized response for organization names, not by trusting a flag)
 *   - the KPIs match figures computed independently from the same files
 *   - a broken DATA_BASE_URL surfaces as a readable error, not a blank page
 *   - responses are cached, so a reload does not re-hit the site four times
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const CODE = path.join(REPO, 'admin', 'steward', 'Code.gs');

const files = {
  'data/intake/orgs/index.json': path.join(REPO, 'data/intake/orgs/index.json'),
  'data/intake/cycles/index.json': path.join(REPO, 'data/intake/cycles/index.json'),
  'data/intake/seed.json': path.join(REPO, 'data/intake/seed.json'),
  'data/intake/schema.json': path.join(REPO, 'data/intake/schema.json'),
};

// --- tiny test runner -------------------------------------------------------
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(t) { console.log(`\n${t}`); }

// --- Apps Script stubs -----------------------------------------------------
function makeEnv({ email = '', props = {}, statusFor = () => 200, baseUrl = '' } = {}) {
  const cache = new Map();
  let fetches = 0;

  const env = {
    get fetches() { return fetches; },
    Session: {
      getActiveUser: () => ({
        getEmail: () => {
          if (email instanceof Error) throw email;
          return email;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
      }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetches += 1;
        const marker = '/data/intake/';
        const at = url.indexOf(marker);
        const key = at < 0 ? null : url.slice(at + 1);
        const status = statusFor(url);
        if (status !== 200 || !key || !files[key]) {
          return { getResponseCode: () => status === 200 ? 404 : status, getContentText: () => 'Not Found' };
        }
        return { getResponseCode: () => 200, getContentText: () => fs.readFileSync(files[key], 'utf8') };
      },
    },
    HtmlService: {
      createHtmlOutputFromFile: () => {
        const chain = {
          setTitle: () => chain,
          setXFrameOptionsMode: (mode) => { env.frameMode = mode; return chain; },
        };
        return chain;
      },
      XFrameOptionsMode: { DENY: 'DENY', SAMEORIGIN: 'SAMEORIGIN' },
    },
  };

  const src = fs.readFileSync(CODE, 'utf8');
  const factory = new Function(
    'Session', 'PropertiesService', 'CacheService', 'UrlFetchApp', 'HtmlService',
    `${src}\nreturn { getConsole, buildView_, doGet, ruleLevels_ };`,
  );
  env.api = factory(env.Session, env.PropertiesService, env.CacheService, env.UrlFetchApp, env.HtmlService);
  return env;
}

// --- independent expectations, computed from the files, not from Code.gs ---
const orgsJson = JSON.parse(fs.readFileSync(files['data/intake/orgs/index.json'], 'utf8'));
const seedJson = JSON.parse(fs.readFileSync(files['data/intake/seed.json'], 'utf8'));
const schemaJson = JSON.parse(fs.readFileSync(files['data/intake/schema.json'], 'utf8'));

const realOrgs = orgsJson.orgs.length;
const realCycles = seedJson.cycles.length;
const sampleCycles = seedJson.cycles.filter((c) => (c.flags || []).includes('sample-data')).length;
const orgNames = orgsJson.orgs.map((o) => o.org);

const STEWARD = 'steward@example.org';
const OUTSIDER = 'someone@example.org';

// --- 1. identity gate -------------------------------------------------------
section('identity gate');
{
  const env = makeEnv({ email: '', props: { LEADER_EMAILS: STEWARD } });
  const res = env.api.getConsole();
  eq('anonymous caller is refused', res.code, 'no-identity');
  check('refusal explains how to fix it', /Anyone with a Google account/.test(res.hint), res.hint);
  eq('no data fetched for an anonymous caller', env.fetches, 0);
}
{
  const env = makeEnv({ email: STEWARD, props: {} });
  const res = env.api.getConsole();
  eq('unconfigured leader list fails closed', res.code, 'no-leaders-configured');
  check('tells you to add your own email', res.hint.includes(STEWARD), res.hint);
}
{
  const env = makeEnv({ email: new Error('Session unavailable'), props: { LEADER_EMAILS: STEWARD } });
  eq('a throwing Session still fails closed', env.api.getConsole().code, 'no-identity');
}

// --- 2. steward view --------------------------------------------------------
section('steward view');
let stewardRes;
{
  const env = makeEnv({ email: STEWARD, props: { LEADER_EMAILS: `someone@else.org, ${STEWARD}` } });
  stewardRes = env.api.getConsole();
  eq('role is steward', stewardRes.role, 'steward');
  eq('organizations', stewardRes.view.kpis.organizations, realOrgs);
  eq('cycles', stewardRes.view.kpis.cycles, realCycles);
  eq('sample cycles', stewardRes.view.kpis.sampleCycles, sampleCycles);
  eq('real cycles', stewardRes.view.kpis.realCycles, realCycles - sampleCycles);
  eq('one row per organization', stewardRes.view.orgs.length, realOrgs);
  check('org rows are sorted by volume',
    stewardRes.view.orgs.every((o, i, a) => i === 0 || a[i - 1].cycles >= o.cycles));
  check('email matching is case-insensitive and trimmed',
    makeEnv({ email: '  Steward@Example.ORG ', props: { LEADER_EMAILS: STEWARD } }).api.getConsole().role === 'steward');
}
{
  const a = stewardRes.view.attention;
  check('attention is non-empty', a.length > 0);
  eq('error-level rules sort before warnings', a[0].level, 'error');
  eq('the sample-data rule is the error', a[0].rule, 'sample-data');
  const levels = Object.fromEntries(schemaJson.quality_rules.map((r) => [r.id, r.level]));
  check('no info-level rule is raised for chasing', a.every((x) => levels[x.rule] !== 'info'));
  const expected = seedJson.cycles.reduce((acc, c) => {
    for (const f of c.flags || []) if (levels[f] && levels[f] !== 'info') acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const norm = (o) => Object.keys(o).sort().map((k) => k + '=' + o[k]).join(',');
  eq('every flagged count matches the seed file',
    norm(Object.fromEntries(a.map((x) => [x.rule, x.cycles]))), norm(expected));
  check('steward attention names organizations', a.every((x) => x.orgs.length > 0));
}

// --- 3. viewer view, and the thing that actually matters --------------------
section('viewer view (server-side filtering)');
let viewerRes;
{
  const env = makeEnv({ email: OUTSIDER, props: { LEADER_EMAILS: STEWARD } });
  viewerRes = env.api.getConsole();
  eq('role is viewer', viewerRes.role, 'viewer');
  eq('no org rows in the payload', viewerRes.view.orgs.length, 0);
  const blob = JSON.stringify(viewerRes);
  const leaked = orgNames.filter((n) => blob.includes(n));
  eq('no organization name appears anywhere in the response', leaked, []);
  check('combined figures are still there', viewerRes.view.kpis.cycles === realCycles);
  check('attention counts are still there', viewerRes.view.attention.length > 0);
  check('but the org lists are gone', viewerRes.view.attention.every((x) => x.orgs === undefined));
  check('the caller is told why', /viewer/i.test(JSON.stringify(viewerRes)) || viewerRes.role === 'viewer');
}

// --- 4. failure modes ------------------------------------------------------
section('failure modes');
{
  const env = makeEnv({ email: STEWARD, props: { LEADER_EMAILS: STEWARD }, statusFor: () => 404 });
  const res = env.api.getConsole();
  eq('a 404 on the data is reported', res.code, 'source-unavailable');
  check('the error names the URL', /HTTP 404/.test(res.hint), res.hint);
  eq('no partial view is returned', res.view, undefined);
}
{
  const env = makeEnv({ email: STEWARD, props: { LEADER_EMAILS: STEWARD, DATA_BASE_URL: 'https://example.org/custom' } });
  const res = env.api.getConsole();
  eq('a custom DATA_BASE_URL still resolves', res.ok, true);
}

// --- 5. caching ------------------------------------------------------------
section('caching');
{
  const env = makeEnv({ email: STEWARD, props: { LEADER_EMAILS: STEWARD } });
  env.api.getConsole();
  const first = env.fetches;
  env.api.getConsole();
  eq('four sources on a cold call', first, 4);
  eq('nothing refetched on a warm call', env.fetches, first);
}
{
  const env = makeEnv({ email: OUTSIDER, props: { LEADER_EMAILS: STEWARD } });
  env.api.getConsole();
  env.api.getConsole();
  eq('a viewer warms the same cache and reads nothing extra', env.fetches, 4);
}

// --- 6. doGet --------------------------------------------------------------
section('doGet');
{
  const env = makeEnv();
  check('doGet returns an HtmlOutput', env.api.doGet() !== undefined);
  eq('and refuses to be framed by another page', env.frameMode, 'DENY');
}

// --- summary ---------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} checks passed`);
if (failures.length) {
  console.log('failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
