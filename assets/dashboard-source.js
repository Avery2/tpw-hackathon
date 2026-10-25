// Where the dashboards and the form's last-quarter prefill get their data: TPW's Google Sheet,
// read through the same Google script the form submits to (team-form/receiver/Dashboard.gs).
// Firebase was retired on 25 Oct 2026.
//
// Made-up sample organizations (Org 1, Org 2) come from data/demo/dashboard-sample.json and
// carry synthetic: true, so pages show a Sample data badge; so do sheet rows marked Yes in its
// Test data column. Real submissions only ever come from the sheet.

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
    return { org: null, orgs, submissions };
  }
  const org = sample.orgs.find(profile => profile.id === orgId);
  if (!org) throw new Error('Organization profile was not found.');
  const sheet = await readSheet(org);
  // An organization's own filings: by ID, or by name for filings made before IDs existed.
  const own = record => (record.orgId ? record.orgId === orgId : record.organization === org.name);
  const submissions = [...sample.submissions.filter(own), ...sheet.submissions.filter(own)].map(record => ({ ...record, orgId }));
  return { org, orgs: [org], submissions };
}
