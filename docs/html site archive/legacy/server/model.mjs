import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const rules = vm.createContext({});
vm.runInContext(readFileSync(new URL('../team-form/receiver/Rows.gs', import.meta.url), 'utf8'), rules, { timeout: 1000 });
export const HEADER = Array.from(rules.HEADER);
export const FACILITIES = { ...rules.FACILITIES };
export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = message => { throw new Problem(400, message); };
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
export function account(value) {
  if (!['org-1', 'org-2', 'tpw'].includes(value)) throw new Problem(403, 'Choose a local demo account before continuing.');
  return value;
}
export function scope(orgs, who, params) {
  let allowed = orgs.filter(org => who === 'tpw' || org.id === who);
  const id = params.get('org'), name = params.get('name');
  if (id) allowed = allowed.filter(org => org.id === id);
  // An ID is authoritative; a forged matching name cannot grant another organization's ID.
  if (name) allowed = allowed.filter(org => org.name.toLowerCase() === name.toLowerCase());
  return allowed;
}
export function resolveOrganization(orgs, who, payload) {
  let candidates;
  if (who !== 'tpw') {
    candidates = orgs.filter(org => org.id === who && payload.orgId === who && clean(payload.organization).toLowerCase() === org.name.toLowerCase());
  } else if (payload.orgId) {
    candidates = orgs.filter(org => org.id === payload.orgId && (!payload.organization || clean(payload.organization).toLowerCase() === org.name.toLowerCase()));
  } else candidates = orgs.filter(org => clean(payload.organization).toLowerCase() === org.name.toLowerCase());
  if (candidates.length !== 1) throw new Problem(403, 'Select one existing organization that matches this demo account.');
  return candidates[0];
}
export function currentPeriod(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric' }).formatToParts(now).map(p => [p.type, p.value]));
  return { year: Number(parts.year), quarter: Math.floor((Number(parts.month) - 1) / 3) + 1 };
}
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const sha = value => createHash('sha256').update(value).digest('hex');

export function prepare(payload, org, now = new Date()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) bad('The submission was not readable.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.submissionId || '')) bad('The submission needs a UUID retry ID.');
  if (!Array.isArray(payload.programs)) bad('The submission has no programs.');
  // Only canonical fields cross this boundary; no envelope, tokens, email or arbitrary extensions.
  const normalized = {
    ...pick(payload, ['previousSubmissionId']), orgId: org.id, organization: org.name,
    reportingPeriod: currentPeriod(now),
    programs: payload.programs.map((program, index) => {
      if (!program || !['In Progress', 'Completed'].includes(program.status)) bad(`Program ${index + 1}: choose In Progress or Completed.`);
      if (program.notes !== undefined && typeof program.notes !== 'string') bad('Optional context must be text.');
      if ((program.notes || '').length > 2000) bad('Use no more than 2,000 characters for optional context.');
      return { ...pick(program, ['id', 'name', 'status', 'startDate', 'endDate', 'courseHours']), notes: (program.notes || '').trim(), sites: Array.isArray(program.sites) ? program.sites.map(site => pick(site, ['facilityCode', 'yard', 'participants', 'completed'])) : program.sites };
    })
  };
  const id = 'neon-demo:' + sha(org.id + '\0' + payload.submissionId.toLowerCase());
  const reference = id.slice(-12).toUpperCase();
  // Execute only the pure validator, never any Google runtime entry point.
  rules.input = JSON.parse(JSON.stringify(normalized));
  rules.filer = { organization: org.name, email: '', signedIn: false };
  rules.meta = { submissionId: reference, submittedAt: now.toISOString() };
  const checked = JSON.parse(JSON.stringify(vm.runInContext('buildRows(input, filer, meta)', rules, { timeout: 1000 })));
  delete rules.input; delete rules.filer; delete rules.meta;
  if (checked.errors.length) bad(checked.errors.join(' '));
  // Hash before server clock/quarter and receipt metadata. A retry across a quarter boundary
  // must return its original receipt, not become a changed-content conflict.
  const hashInput = { ...normalized, reportingPeriod: pick(payload.reportingPeriod, ['year', 'quarter']) };
  const hash = sha(stable(hashInput));
  const prisons = new Map();
  const programs = checked.submission.programs.map((program, index) => {
    const assignments = new Map();
    for (const site of program.sites) {
      if (!assignments.has(site.code)) assignments.set(site.code, { code: site.code, yards: [] });
      assignments.get(site.code).yards.push(site.yard);
      if (!prisons.has(site.code)) prisons.set(site.code, { code: site.code, name: FACILITIES[site.code], yards: [] });
      if (!prisons.get(site.code).yards.includes(site.yard)) prisons.get(site.code).yards.push(site.yard);
    }
    return { ...program, notes: normalized.programs[index].notes, assignments: [...assignments.values()],
      participants: program.sites.reduce((sum, s) => sum + s.participants, 0),
      participantsCompleted: program.sites.reduce((sum, s) => sum + s.completed, 0) };
  });
  const receipt = { ok: true, submissionId: reference, reference, rows: checked.rows.length, organization: org.name, signedIn: false };
  const document = {
    // The dashboard ID must fit Rows.gs's 64-character previousSubmissionId contract.
    id: id.slice('neon-demo:'.length), schemaVersion: 1, orgId: org.id, organization: org.name, synthetic: true, testData: true,
    source: 'neon-local-demo', previousSubmissionId: checked.submission.previousSubmissionId,
    reportingPeriod: normalized.reportingPeriod, submittedAt: now.toISOString(), prisons: [...prisons.values()], programs,
    _retry: { hash, receipt }
  };
  return { id, document, hash, receipt };
}

// Historical JSON is retained losslessly except explicitly private keys, at every depth.
export function publicDocument(value) {
  if (Array.isArray(value)) return value.map(publicDocument);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_') && !/email/i.test(key) && !/^(submittedby|token|sessiontoken|accesstoken|idtoken|refreshtoken|authorization|password|secret|orgkey|organizationkey|files?|attachments?|pdf|signature|ssn|taxid|cdcrnumber|dateofbirth|dob|participantnames?)$/i.test(key.replace(/[_\s-]/g, ''))).map(([key, item]) => [key, publicDocument(item)]));
}
export function ownedDocument(record, org) {
  const document = publicDocument(record.document);
  return { ...document, id: document.id || record.id, orgId: org.id, organization: org.name, submittedAt: record.receivedAt, synthetic: true, testData: true };
}
