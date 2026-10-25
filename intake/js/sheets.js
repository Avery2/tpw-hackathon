// One transport for additional forms. A SEPARATE Apps Script project writes to
// approved tabs in the same workbook; the quarterly receiver is never a fallback.
import '../backend.js';
const attempts = new Map();
const retryContent = new Map();

const fingerprint = (record) => JSON.stringify(Object.fromEntries(
  Object.entries(record).filter(([key]) => key !== 'id' && key !== 'submitted_at').sort(([a], [b]) => a.localeCompare(b))
));

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function submitRecord(record) {
  const endpoint = window.TPW_RECORDS_BACKEND_URL;
  if (!endpoint) throw new Error('The separate additional-forms receiver is not configured in intake/backend.js. Download a local backup instead.');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
    throw new Error('Set intake/backend.js to the new standalone Apps Script deployment’s /exec URL.');
  }

  // Re-collecting a form generates a fresh timestamp/ID. Reuse the exact original
  // payload on an unchanged retry, including after a lost HTTP response.
  const key = fingerprint(record);
  const earlier = retryContent.get(key) || attempts.get(record.id);
  if (earlier) {
    record.id = earlier.record.id;
    record.submitted_at = earlier.record.submitted_at;
    if (earlier.receipt && key === fingerprint(earlier.record)) return earlier.receipt;
    if (earlier.inflight) return earlier.inflight;
  }
  const attempt = { record: JSON.parse(JSON.stringify(record)) };
  attempts.set(record.id, attempt);
  retryContent.set(key, attempt);
  // Bounded in-memory retry state; nothing is sent to a public read endpoint.
  if (attempts.size > 100) attempts.delete(attempts.keys().next().value);
  if (retryContent.size > 100) retryContent.delete(retryContent.keys().next().value);

  attempt.inflight = (async () => {
    // An old receiver must NOT silently accept/drop a new record payload.
    const capabilities = await request(endpoint, { cache: 'no-store' });
    if (capabilities?.ok !== true || capabilities.service !== 'tpw.additional-forms' || capabilities.version !== 1 ||
        capabilities.features?.quickRecords !== true || !Array.isArray(capabilities.recordKinds) ||
        !capabilities.recordKinds.includes(record.kind) ||
        !Object.prototype.hasOwnProperty.call(capabilities.recordTabs || {}, record.kind) ||
        typeof capabilities.recordTabs[record.kind] !== 'string') {
      throw new Error('The endpoint is not the standalone additional-forms receiver, or this form is not approved. Deploy admin/additional-forms and check intake/backend.js. Nothing was filed.');
    }
    const expectedTab = capabilities.recordTabs[record.kind];
    const reply = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // Never send another project's session tokens to this independent receiver.
      body: JSON.stringify({ action: 'submitRecord', payload: attempt.record }),
    });
    if (!reply?.ok) throw new Error(reply?.errors?.join(' ') || 'The receiver did not confirm the save. Retry with this page still open.');
    if (reply.recordId !== record.id || reply.tab !== expectedTab || reply.rows !== 1 || typeof reply.submissionId !== 'string' || !reply.submissionId) {
      throw new Error('The receiver returned an unexpected receipt. Check the Sheet before starting another record; retry keeps the same ID.');
    }
    attempt.receipt = reply;
    retryContent.delete(key);
    return reply;
  })();
  try {
    return await attempt.inflight;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The receiver timed out. Keep this page open and retry with the same record ID.');
    throw error;
  } finally {
    attempt.inflight = null;
  }
}
