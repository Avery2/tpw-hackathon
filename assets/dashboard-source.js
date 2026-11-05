// Shared dashboard/prefill source. Published prototype: synthetic-only Neon RPCs,
// no account required. Protected identity and explicit legacy Sheets modes stay
// separate; an uncertain database request never falls back to another store.

import { isSandboxMode } from './neon-config.js?v=sandbox-1';
import { sandboxRequest } from './neon-sandbox-client.js?v=sandbox-1';
import { neonDemoUrl, neonRequest, mountDemoExports } from './neon-demo-client.js?v=sandbox-1';
import { mountDashboardExports } from './dashboard-exports.js?v=sandbox-1';
import { isNeonMode, authStateReady, dataApiRequest, getCachedContext } from './neon-auth-client.js?v=sandbox-1';

let neonRevision = 0;
const contextScope = context => JSON.stringify([context?.userId, context?.isStaff, context?.accountKey, (context?.orgs || []).map(org => org.id).sort()]);
if (typeof window !== 'undefined') window.addEventListener?.('tpw:neon-change', () => {
  if (typeof document !== 'undefined') document.querySelector('#dashboard-exports')?.remove();
});

function neonSignInLink() {
  if (typeof document === 'undefined' || document.querySelector('#neon-dashboard-signin')) return;
  const heading = document.querySelector('.dashboard-heading');
  if (!heading) return;
  const link = document.createElement('a'); link.id = 'neon-dashboard-signin';
  link.href = new URL('../neon/?backend=neon', import.meta.url).href;
  link.textContent = 'Sign in or check your organization access';
  (heading.querySelector('.shell') || heading).append(link);
}

const SAMPLE = new URL('../data/demo/dashboard-sample.json', import.meta.url);
const BACKEND = new URL('../team-form/backend.js', import.meta.url);

async function receiverUrl() {
  // backend.js sets window.TPW_BACKEND_URL; load it if the page hasn't already.
  if (!window.TPW_BACKEND_URL) await import(BACKEND.href);
  return String(window.TPW_BACKEND_URL || '').trim();
}

async function readSample() {
  const response = await fetch(SAMPLE, { cache: 'no-store' });
  if (!response.ok) return { orgs: [], submissions: [] };
  const data = await response.json();
  return {
    orgs: Array.isArray(data.orgs) ? data.orgs : [],
    submissions: (Array.isArray(data.submissions) ? data.submissions : []).map(record => ({ ...record, synthetic: true }))
  };
}

// org: { id, name } for one organization's view, or null for every organization.
async function readSheet(org) {
  const url = await receiverUrl();
  if (!url) return { orgs: [], submissions: [] }; // no back end set: sample data only
  const address = new URL(url);
  address.searchParams.set('view', 'dashboard');
  if (org) {
    address.searchParams.set('org', org.id);
    address.searchParams.set('name', org.name);
  }
  const response = await fetch(address, { cache: 'no-store' });
  const data = await response.json();
  if (!data || data.ok !== true) {
    throw new Error((data && data.errors || ['The dashboard couldn’t read TPW’s sheet.']).join(' '));
  }
  return {
    orgs: Array.isArray(data.orgs) ? data.orgs : [],
    // Rows marked Yes in the sheet's Test data column get the same badge as the sample data.
    submissions: (Array.isArray(data.submissions) ? data.submissions : []).map(record => ({ ...record, synthetic: record.testData === true }))
  };
}

export async function loadDashboard(orgId) {
  if (isSandboxMode()) {
    const revision = ++neonRevision;
    if (typeof document !== 'undefined') document.querySelector('#dashboard-exports')?.remove();
    if (orgId && !['org-1', 'org-2'].includes(orgId)) throw new Error('Choose Org 1 or Org 2 for this prototype.');
    const reply = await sandboxRequest('tpw_sandbox_dashboard', { p_org_id: orgId || null });
    if (!isSandboxMode()) throw new Error('The view changed. Please reload the dashboard.');
    const orgs = (Array.isArray(reply.orgs) ? reply.orgs : [])
      .filter(org => ['org-1', 'org-2'].includes(org.id) && (!orgId || org.id === orgId))
      .map(org => ({ ...org, name: org.id === 'org-1' ? 'Org 1' : 'Org 2', synthetic: true }));
    const org = orgId ? orgs.find(profile => profile.id === orgId) : null;
    if (orgId && !org) throw new Error('Organization profile was not found. Please try again or contact TPW.');
    const submissions = (Array.isArray(reply.submissions) ? reply.submissions : [])
      .filter(record => orgs.some(profile => profile.id === record.orgId) && (record.synthetic === true || record.testData === true))
      .map(record => ({ ...record, synthetic: true }));
    const data = { org, orgs, submissions };
    if (revision === neonRevision) mountDashboardExports(data, orgId);
    return data;
  }
  // Authenticated mode is opt-in and fails closed: never read Google or mix in samples.
  if (isNeonMode()) {
    const revision = ++neonRevision;
    if (typeof document !== 'undefined') document.querySelector('#dashboard-exports')?.remove();
    let context;
    try { context = await authStateReady(); }
    catch (error) { neonSignInLink(); throw error; }
    if (!context?.ok || !context.userId || (!context.isStaff && !context.orgs?.length)) {
      neonSignInLink();
      throw new Error('Please sign in with an assigned organization account, or contact TPW for access.');
    }
    if (orgId && !context.isStaff && !context.orgs.some(org => org.id === orgId)) {
      throw new Error('Your signed-in account cannot view that organization.');
    }
    const scope = contextScope(context);
    const reply = await dataApiRequest('tpw_dashboard', { p_org_id: orgId || null });
    if (!isNeonMode() || scope !== contextScope(getCachedContext())) throw new Error('Your account changed. Please reload the dashboard.');
    if (reply?.ok !== true) throw new Error((reply?.errors || ['TPW could not load the dashboard. Please try again.']).join(' '));
    const orgs = (Array.isArray(reply.orgs) ? reply.orgs : [])
      .filter(org => (!orgId || org.id === orgId) && (context.isStaff || context.orgs.some(own => own.id === org.id)));
    const org = orgId ? orgs.find(profile => profile.id === orgId) : null;
    if (orgId && !org) throw new Error('Organization profile was not found.');
    const submissions = (Array.isArray(reply.submissions) ? reply.submissions : [])
      .filter(record => orgs.some(profile => profile.id === record.orgId))
      .map(record => ({ ...record, synthetic: record.testData === true || record.synthetic === true }));
    const data = { org, orgs, submissions };
    if (revision === neonRevision) {
      if (typeof document !== 'undefined') document.querySelector('#neon-dashboard-signin')?.remove();
      mountDashboardExports(data, orgId);
    }
    return data;
  }
  // Read backend.js first: the local demo server supplies an explicit opt-in override.
  await receiverUrl();
  if (neonDemoUrl()) {
    mountDemoExports();
    const data = await neonRequest({ orgId });
    const orgs = Array.isArray(data.orgs) ? data.orgs : [];
    const org = orgId ? orgs.find(profile => profile.id === orgId) : null;
    if (orgId && !org) throw new Error('Organization profile was not found.');
    const submissions = (Array.isArray(data.submissions) ? data.submissions : [])
      .filter(record => !orgId || record.orgId === orgId)
      .map(record => ({ ...record, synthetic: true })); // This opt-in database contains demo data only.
    return { org, orgs: orgId ? [org] : orgs, submissions };
  }
  const sample = await readSample();
  if (!orgId) {
    const sheet = await readSheet(null);
    const orgs = [...sample.orgs];
    for (const org of sheet.orgs) {
      if (!orgs.some(known => (org.id && known.id === org.id) || known.name === org.name)) orgs.push(org);
    }
    const submissions = [...sample.submissions, ...sheet.submissions].map(record => {
      if (record.orgId) return record;
      const matching = orgs.filter(org => org.id && org.name === record.organization);
      return { ...record, orgId: matching.length === 1 ? matching[0].id : null };
    });
    const data = { org: null, orgs, submissions };
    mountDashboardExports(data, orgId);
    return data;
  }
  const org = sample.orgs.find(profile => profile.id === orgId);
  if (!org) throw new Error('Organization profile was not found.');
  const sheet = await readSheet(org);
  // An organization's own filings: by ID, or by name for filings made before IDs existed.
  const own = record => (record.orgId ? record.orgId === orgId : record.organization === org.name);
  const submissions = [...sample.submissions.filter(own), ...sheet.submissions.filter(own)].map(record => ({ ...record, orgId }));
  const data = { org, orgs: [org], submissions };
  mountDashboardExports(data, orgId);
  return data;
}
