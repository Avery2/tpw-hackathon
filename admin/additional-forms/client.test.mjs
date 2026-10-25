// Exercise browser transport with synthetic requests only. No Google calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../../intake/js/sheets.js', import.meta.url), 'utf8'))
  .replace("import '../backend.js';", '');
let sequence = 0;
async function harness({ old = false, fail = false, badReceipt = false, rejected = false, hold = false, tab = 'Session records' } = {}) {
  const calls = [];
  globalThis.window = {
    TPW_RECORDS_BACKEND_URL: 'https://script.google.com/macros/s/OFFLINE_RECORDS_TEST/exec',
    TPW_BACKEND_URL: 'https://script.google.com/macros/s/DO_NOT_USE_QUARTERLY/exec',
    tpwSession: { token: 'QUARTERLY_AUTH_MUST_NOT_LEAK' },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, window.TPW_RECORDS_BACKEND_URL);
    assert.notEqual(url, window.TPW_BACKEND_URL);
    calls.push(options);
    if (!options.method) return { ok: true, json: async () => ({ ok:true,service:old?'TPW guided form submissions':'tpw.additional-forms',version:1,features: { quickRecords: true }, recordKinds: ['session','aggregate','followup','future_check'],recordTabs:{session:tab,aggregate:'Quarter records',followup:'Follow-ups',future_check:'Future checks'} }) };
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
    const body = JSON.parse(options.body);
    assert.equal(body.action, 'submitRecord');
    assert.equal(body.token, undefined);
    assert(!options.body.includes('QUARTERLY_AUTH_MUST_NOT_LEAK'));
    if (hold) await new Promise(resolve => setTimeout(resolve, 5));
    if (fail) { fail = false; throw new Error('simulated lost response'); }
    const reply = rejected ? { ok:false, errors:['Invalid count.'] } : { ok:true,recordId:badReceipt?'WRONG':body.payload.id,tab:{session:tab,aggregate:'Quarter records',followup:'Follow-ups',future_check:'Future checks'}[body.payload.kind],rows:1,submissionId:'SYNTHETIC-RECEIPT' };
    return { ok:true,json:async()=>reply };
  };
  const module = await import('data:text/javascript;base64,' + Buffer.from(source + '\n// unique module ' + sequence++).toString('base64'));
  return { calls, submit:module.submitRecord };
}
const record = () => ({id:'session-synthetic-2026-10-25-abcdef',kind:'session',submitted_at:'2026-10-25T12:00:00.000Z',schema:'tpw.simple/1',source:'quick-form',org:'SYNTHETIC',program:'TEST',facility:'Avenal State Prison (ASP)',session_date:'2026-10-25',present_count:3});
{
  const h=await harness(),p=record();const receipt=await h.submit(p);
  assert.equal(receipt.recordId,p.id);assert.equal(h.calls.length,2);
  assert.equal(JSON.parse(h.calls[1].body).token,undefined);
  assert.deepEqual(await h.submit(p),receipt);assert.equal(h.calls.length,2);
  console.log('PASS confirmed receipt, unsigned demo envelope, same-ID double click deduplication');
}
{
  const h=await harness({old:true});await assert.rejects(h.submit(record()),/not the standalone additional-forms receiver/);assert.equal(h.calls.length,1);
  console.log('PASS old receiver is refused before POST');
}
{
  const h=await harness({fail:true}),first=record();await assert.rejects(h.submit(first),/simulated lost response/);
  const retry={...record(),id:'session-newly-collected-id',submitted_at:'2026-10-25T12:01:00.000Z'};
  await h.submit(retry);assert.equal(retry.id,first.id);assert.equal(retry.submitted_at,first.submitted_at);
  const posts=h.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body,posts[1].body);
  console.log('PASS recollected form reuses exact payload after ambiguous network failure');
}
{
  const h=await harness({fail:true}),first=record();await assert.rejects(h.submit(first));
  const retry={...first,submitted_at:'2026-10-25T12:02:00.000Z'};await h.submit(retry);
  assert.equal(h.calls.filter(c=>c.method==='POST')[0].body,h.calls.filter(c=>c.method==='POST')[1].body);
  console.log('PASS scanner same-ID retries retain original timestamp');
}
for(const config of [{badReceipt:true},{rejected:true}]){
 const h=await harness(config);await assert.rejects(h.submit(record()));
}
console.log('PASS rejected saves and mismatched receipts cannot appear successful');
{
 const h=await harness({hold:true}),p=record();const [a,b]=await Promise.all([h.submit(p),h.submit({...p})]);assert.deepEqual(a,b);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
 console.log('PASS concurrent submissions share one in-flight request');
}
{
  const h=await harness();window.TPW_RECORDS_BACKEND_URL='';
  await assert.rejects(h.submit(record()),/not configured/);assert.equal(h.calls.length,0);
  console.log('PASS no fallback to configured quarterly endpoint when records endpoint is empty');
}
{
  const h=await harness({tab:'Approved session tab'});
  assert.equal((await h.submit(record())).tab,'Approved session tab');
  const future={...record(),id:'future-synthetic-abcdef',kind:'future_check'};
  assert.equal((await h.submit(future)).tab,'Future checks');
  console.log('PASS new approved tab and future kind work without frontend transport edits');
}
console.log('All standalone record-client checks passed; zero live requests.');
