// Standalone receiver endpoint-isolation browser checks. Start a loopback server.
// The additional endpoint is injected via intercepted intake/backend.js; ALL
// Google requests (including the unchanged quarterly form) are intercepted.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base=process.env.LOCAL_FORM_URL||'http://127.0.0.1:8826';
const recordsEndpoint='https://script.google.com/macros/s/ADDITIONAL_FORMS_OFFLINE/exec';
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(path.join(tmpdir(),'tpw-slim-form-browser-'));
const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let socket;
try{
 let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{}await sleep(100);}assert(port,'Chrome did not start');
 const target=await fetch(`http://localhost:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
 let sequence=0, supportsNotes=true, supportsRecords=true, failNextPost=false;const pending=new Map(),posts=[],exceptions=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 socket.addEventListener('message',async event=>{
  const message=JSON.parse(event.data);
  if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}
  if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);
  if(message.method==='Fetch.requestPaused'){
   const {request,requestId}=message.params;
   if(request.url===base+'/intake/backend.js'){
    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from('window.TPW_RECORDS_BACKEND_URL='+JSON.stringify(recordsEndpoint)+';').toString('base64')});return;
   }
   const isRecords=request.url===recordsEndpoint;
   if(request.method==='POST'){
    const envelope=JSON.parse(request.postData);
    assert.equal(envelope.action==='submitRecord',isRecords,'Submission reached the wrong receiver');
    if(isRecords){assert.equal(envelope.token,undefined);assert(!request.postData.includes('QUARTERLY_AUTH_MUST_NOT_LEAK'));}
    posts.push(JSON.parse(request.postData));
    if(failNextPost){failNextPost=false;await send('Fetch.failRequest',{requestId,errorReason:'ConnectionClosed'});return;}
   }
   const posted=request.method==='POST'?JSON.parse(request.postData):null;
   const reply=posted?.action==='submitRecord'
    ?{ok:true,rows:1,submissionId:'MOCK-RECORD-ONLY',signedIn:false,recordId:posted.payload.id,tab:{session:'Session records',aggregate:'Quarter records',followup:'Follow-ups'}[posted.payload.kind]}
    :posted?{ok:true,rows:1,submissionId:'MOCK-ONLY',signedIn:false}
    :isRecords?{ok:true,service:supportsRecords?'tpw.additional-forms':'TPW guided form submissions',version:1,features:{quickRecords:true},recordKinds:['session','aggregate','followup'],recordTabs:{session:'Session records',aggregate:'Quarter records',followup:'Follow-ups'}}
    :{ok:true,features:{programNotes:supportsNotes}};
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(reply)).toString('base64')});
  }
 });
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let n=0;n<160;n++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:'https://script.google.com/macros/s/*',requestStage:'Request'},{urlPattern:base+'/intake/backend.js',requestStage:'Request'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='*{animation:none!important;transition:none!important}';document.head.append(style);});`});
 async function open(width=1280){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/form-demo/?embed=1'});
  await wait(`!!document.querySelector('#quarter-summary')?.textContent`);
  assert(await evaluate(`!document.querySelector('#quarter-step')&&!document.querySelector('[name=reporting_quarter]')&&!document.querySelector('#reporting-year')`));
  await evaluate(`document.querySelector('#organization').value='SYNTHETIC TEST';document.querySelector('#demo-form').requestSubmit();`);
  await wait(`!document.querySelector('#facilities-step').hidden&&!document.querySelector('#facilities-step').classList.contains('entering')`);
  await evaluate(`const facility=document.querySelector('#facility');facility.value='SQ';facility.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.yard-choices input[value=North]').click();document.querySelector('#continue-programs').click();`);
  await wait(`!document.querySelector('#programs-step').hidden`);
  const statuses=await evaluate(`Array.from(document.querySelectorAll('#program-list select option')).map(o=>o.value)`);assert.deepEqual(statuses,['','In Progress','Completed']);
  assert.equal(await evaluate(`document.querySelector('#program-list textarea').required`),false);
 }
 async function fill(notes=''){
  await evaluate(`(()=>{const p=document.querySelector('#program-list > section');p.querySelector('[id$="-program-name"]').value='SYNTHETIC TEST';p.querySelector('[id$="-scheduled-status"]').value='Completed';p.querySelector('[id$="-start-date"]').value='2026-10-01';p.querySelector('[id$="-end-date"]').value='2026-10-02';p.querySelector('[id$="-course-hours"]').value='10';p.querySelector('[data-kind=participants]').value='5';p.querySelector('[data-kind=completed]').value='4';p.querySelector('textarea').value=${JSON.stringify(notes)};p.querySelector('.continue-button').click();})()`);
  await wait(`!document.querySelector('#program-next').hidden`);
 }
 const clickFinish=()=>evaluate(`document.querySelector('#finish-form').click();`);
 const success=()=>wait(`!document.querySelector('#submission-result').hidden`);
 for(const width of [1280,390]){
  await open(width);await fill('');const count=posts.length;await clickFinish();await success();assert.equal(posts.length,count+1);assert.equal(posts.at(-1).payload.programs[0].notes,'');
  const expected=await evaluate(`import('./js/reporting-period.js').then(m=>m.currentReportingPeriod())`);assert.deepEqual(posts.at(-1).payload.reportingPeriod,expected);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));console.log('PASS quarter question removed, two statuses, optional notes, empty-notes submit, no overflow:',width);
 }
 const notes='=literal context\n<script>not executable</script>';
 await open();await fill(notes);await evaluate(`document.querySelector('#added-programs button').click();`);
 await wait(`!!document.querySelector('#program-list textarea')`);assert.equal(await evaluate(`document.querySelector('#program-list textarea').value`),notes);
 await evaluate(`document.querySelector('#program-list .continue-button').click();`);await wait(`!document.querySelector('#program-next').hidden`);
 await clickFinish();await success();assert.equal(posts.at(-1).payload.programs[0].notes,notes);
 assert.equal(await evaluate(`document.querySelector('.report-program-notes').textContent`),'Additional context: '+notes);assert(await evaluate(`!document.querySelector('.report-program-notes script')`));console.log('PASS notes survive editing, reach payload and render as literal text');
 await open();await fill('Keep my context');supportsNotes=false;let before=posts.length;await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('receiver needs')`);assert.equal(posts.length,before);assert(await evaluate(`document.querySelector('#submission-result').hidden`));supportsNotes=true;await clickFinish();await success();assert.equal(posts.at(-1).payload.programs[0].notes,'Keep my context');console.log('PASS legacy receiver cannot silently lose notes; retry works after capability upgrade');
 await open();await fill('Retry preserves context');failNextPost=true;before=posts.length;await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('Couldn’t reach')`);await clickFinish();await success();assert.equal(posts.length,before+2);assert.equal(posts[before].payload.submissionId,posts[before+1].payload.submissionId);assert.equal(posts.at(-1).payload.programs[0].notes,'Retry preserves context');console.log('PASS network failure preserves notes and retry ID');
 await open();await evaluate(`const p=document.querySelector('#program-list > section');p.querySelector('[id$="-program-name"]').value='SYNTHETIC';p.querySelector('[id$="-scheduled-status"]').value='In Progress';p.querySelector('[id$="-start-date"]').value='2026-10-01';p.querySelector('textarea').value='x'.repeat(2001);p.querySelector('.continue-button').click();`);assert(await evaluate(`document.querySelector('#program-next').hidden`));console.log('PASS oversized optional context is rejected');
 await send('Page.navigate',{url:base+'/intake/simple.html'});await wait(`!!document.querySelector('iframe')?.contentDocument?.querySelector('#quarter-summary')?.textContent`);assert(await evaluate(`!document.querySelector('iframe').contentDocument.querySelector('#quarter-step')`));console.log('PASS embedded intake uses slim form');
 for(const width of [1280,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/intake/simple.html?record-test='+width+'#session'});
  await wait(`!!document.querySelector('#f-org')`);
  assert(await evaluate(`!document.querySelector('[data-act=token]')&&!document.body.textContent.includes('separate GitHub ledger')`));
  await evaluate(`document.querySelector('#f-org').value='SYNTHETIC TEST';document.querySelector('#f-program').value='SYNTHETIC SESSION';document.querySelector('#f-facility').value=document.querySelector('#facilities option').value;document.querySelector('#f-session_date').value='2026-10-25';document.querySelector('#f-present_count').value='3';`);
  await evaluate(`window.tpwSession={token:'QUARTERLY_AUTH_MUST_NOT_LEAK'}`);
  const before=posts.length;
  if(width===1280){supportsRecords=false;await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`document.querySelector('.toast.bad')?.textContent.includes('not the standalone additional-forms receiver')`);assert.equal(posts.length,before);supportsRecords=true;failNextPost=true;await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`!document.querySelector('[type=submit]').disabled`);assert.equal(posts.length,before+1);assert.equal(await evaluate(`document.querySelector('#f-present_count').value`),'3');await evaluate(`document.querySelector('#f-notes').value='SYNTHETIC CORRECTION'`);}
  await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`!!document.querySelector('.done')`);
  assert.equal(posts.at(-1).action,'submitRecord');assert.equal(posts.at(-1).payload.present_count,3);assert.equal(posts.at(-1).payload.kind,'session');
  assert(await evaluate(`document.querySelector('.done').textContent.includes('Session records')&&document.querySelector('.done').textContent.includes('MOCK-RECORD-ONLY')`));
  if(width===1280){assert.equal(posts[before].payload.id,posts[before+1].payload.id);assert.equal(posts[before].payload.submitted_at,posts[before+1].payload.submitted_at);assert.equal(posts[before+1].payload.notes,'SYNTHETIC CORRECTION');}
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  console.log('PASS Session saves to Sheets, confirms receipt, no GitHub choices; width:',width);
 }
 await send('Page.navigate',{url:base+'/intake/simple.html#followup'});await wait(`!!document.querySelector('#f-token')`);
 await evaluate(`document.querySelector('#f-org').value='SYNTHETIC TEST';document.querySelector('#f-token').value='M78';document.querySelector('#f-release_date').value='2026-08-01';document.querySelector('[name=status][value=new_conviction]').click();document.querySelector('#f-days').value='20';document.querySelector('[name=status][value=unknown]').click();document.querySelector('form').requestSubmit();`);
 await wait(`!!document.querySelector('.done')`);assert.equal(posts.at(-1).payload.kind,'followup');assert.equal(posts.at(-1).payload.days,undefined);console.log('PASS changing follow-up status omits the hidden days value');
 await send('Page.navigate',{url:base+'/intake/simple.html#aggregate'});await wait(`!!document.querySelector('#f-served')`);
 await evaluate(`document.querySelector('#f-org').value='SYNTHETIC TEST';document.querySelector('#f-program').value='SYNTHETIC QUARTER';document.querySelector('#f-facilities').value=document.querySelector('#facilities option').value;document.querySelector('[data-act=add-facility]').click();document.querySelector('#f-quarter').value='2026-Q4';document.querySelector('#f-served').value='10';document.querySelector('#f-completed').value='7';document.querySelector('form').requestSubmit();`);
 await wait(`!!document.querySelector('.done')`);assert.equal(posts.at(-1).payload.kind,'aggregate');assert.equal(posts.at(-1).payload.facilities.length,1);console.log('PASS older Quarter form also uses the same workbook');
 await send('Page.navigate',{url:base+'/intake/scan.html'});await wait(`!!document.querySelector('#file')`);
 await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;canvas.getContext('2d').fillRect(0,0,500,500);const blob=await new Promise(resolve=>canvas.toBlob(resolve));const transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.querySelector('#file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
 await wait(`!!document.querySelector('#f-present')`);
 await evaluate(`document.querySelector('#f-org').value='SYNTHETIC TEST';document.querySelector('#f-program').value='SYNTHETIC SCAN';document.querySelector('#f-facility').value=document.querySelector('datalist option').value;document.querySelector('#f-date').value='2026-10-25';document.querySelector('#f-present').value='7';document.querySelector('#manual-file').click();`);
 await wait(`!!document.querySelector('.done')`);assert.equal(posts.at(-1).payload.present_count,7);assert.equal(posts.at(-1).payload.source,'scan-manual');assert.equal(posts.at(-1).payload.present,undefined);assert.equal(posts.at(-1).payload.roster,undefined);
 console.log('PASS manual scanner files positive attendance without nonexistent roster IDs');
 assert.deepEqual(exceptions,[]);console.log('PASS browser checks: zero unhandled exceptions, zero live Google requests');
}finally{socket?.close();chrome.kill();await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',resolve);setTimeout(resolve,3000);}});await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
