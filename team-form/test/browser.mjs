// Start a loopback static server at LOCAL_FORM_URL (default below). All requests
// to the real Google endpoint are intercepted by CDP: ZERO live writes/emails.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base=process.env.LOCAL_FORM_URL||'http://127.0.0.1:8826';
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
 let sequence=0, supportsNotes=true, failNextPost=false, nextPostReply=null, failDashboard=false;const pending=new Map(),posts=[],exceptions=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 socket.addEventListener('message',async event=>{
  const message=JSON.parse(event.data);
  if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}
  if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);
  if(message.method==='Fetch.requestPaused'){
   const {request,requestId}=message.params;
   // Last quarter's report: fail it on demand to check the blank-form message, else load it untouched.
   if(request.url.includes('/team-dashboard/js/data.js')){await send(failDashboard?'Fetch.failRequest':'Fetch.continueRequest',failDashboard?{requestId,errorReason:'ConnectionClosed'}:{requestId});return;}
   if(request.method==='POST'){
    posts.push(JSON.parse(request.postData));
    if(failNextPost){failNextPost=false;await send('Fetch.failRequest',{requestId,errorReason:'ConnectionClosed'});return;}
   }
   const reply=request.method==='POST'?(nextPostReply||{ok:true,rows:1,submissionId:'MOCK-ONLY',signedIn:false})
    :{ok:true,features:{programNotes:supportsNotes}};
   if(request.method==='POST')nextPostReply=null;
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(reply)).toString('base64')});
  }
 });
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let n=0;n<160;n++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Fetch.enable',{patterns:[{urlPattern:'https://script.google.com/macros/s/*',requestStage:'Request'},{urlPattern:'*/team-dashboard/js/data.js*',requestStage:'Request'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='*{animation:none!important;transition:none!important}';document.head.append(style);});`});
 async function open(width=1280){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/team-form/?embed=1'});
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
 const contactLink=selector=>`document.querySelector('${selector} a')?.getAttribute('href')==='mailto:membership@thetpw.org'&&document.querySelector('${selector}').textContent.endsWith('email membership@thetpw.org.')`;
 const clickFinish=()=>evaluate(`document.querySelector('#finish-form').click();`);
 const success=()=>wait(`!document.querySelector('#submission-result').hidden`);
 for(const width of [1280,390]){
  await open(width);await fill('');const count=posts.length;await clickFinish();await success();assert.equal(posts.length,count+1);assert.equal(posts.at(-1).payload.programs[0].notes,'');
  const expected=await evaluate(`import('./js/reporting-period.js').then(m=>m.currentReportingPeriod())`);assert.deepEqual(posts.at(-1).payload.reportingPeriod,expected);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  assert.equal(await evaluate(`document.querySelector('#submission-heading').textContent`),'Submission saved');
  assert.equal(await evaluate(`document.querySelector('#submission-context').textContent`),`SYNTHETIC TEST · Q${expected.quarter} ${expected.year}`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#submission-totals strong')].map(n=>n.textContent)`),['1','5','4','40']);
  assert(await evaluate(`!document.querySelector('.mock-impact,.success-check')&&!document.querySelector('#submission-result').textContent.includes('Estimated money saved')`));
  assert(await evaluate(`document.querySelector('#submission-receipt').textContent.includes('Submitted to TPW')`));
  assert(await evaluate(`getComputedStyle(document.querySelector('#submission-result')).textAlign==='left'`));
  console.log('PASS slim quarterly form, compact actual-count receipt, no mock impact, no overflow:',width);
 }
 const notes='=literal context\n<script>not executable</script>';
 await open();await fill(notes);await evaluate(`document.querySelector('#added-programs button').click();`);
 await wait(`!!document.querySelector('#program-list textarea')`);assert.equal(await evaluate(`document.querySelector('#program-list textarea').value`),notes);
 await evaluate(`document.querySelector('#program-list .continue-button').click();`);await wait(`!document.querySelector('#program-next').hidden`);
 await clickFinish();await success();assert.equal(posts.at(-1).payload.programs[0].notes,notes);
 assert.equal(await evaluate(`document.querySelector('.report-program-notes').textContent`),'Additional context: '+notes);assert(await evaluate(`!document.querySelector('.report-program-notes script')`));console.log('PASS notes survive editing, reach payload and render as literal text');
 await open();await fill('Keep my context');supportsNotes=false;let before=posts.length;await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('receiver needs')`);assert.equal(posts.length,before);assert(await evaluate(`document.querySelector('#submission-result').hidden`));supportsNotes=true;await clickFinish();await success();assert.equal(posts.at(-1).payload.programs[0].notes,'Keep my context');console.log('PASS legacy receiver cannot silently lose notes; retry works after capability upgrade');
 await open();await fill('Retry preserves context');failNextPost=true;before=posts.length;await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('Couldn’t reach')`);assert(await evaluate(contactLink('#program-feedback')));await clickFinish();await success();assert.equal(posts.length,before+2);assert.equal(posts[before].payload.submissionId,posts[before+1].payload.submissionId);assert.equal(posts.at(-1).payload.programs[0].notes,'Retry preserves context');console.log('PASS network failure preserves notes and retry ID, and shows who to email');
 // A problem the member can fix in the form names the program; TPW's own problems add who to email.
 await open();await fill();nextPostReply={ok:false,errors:['Program 1: the end date is before the start date.']};await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('end date is before')`);assert(!await evaluate(`!!document.querySelector('#program-feedback a')`));assert(!await evaluate(`document.querySelector('#program-feedback').textContent.includes('membership@')`));
 nextPostReply={ok:false,signInNeeded:true,errors:['Please sign in again before submitting. Your answers are still on the page.']};await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('sign in again')`);assert(!await evaluate(`!!document.querySelector('#program-feedback a')`));
 nextPostReply={ok:false,errors:['The sheet is busy. Please try again in a minute.']};await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('sheet is busy')`);assert(await evaluate(contactLink('#program-feedback')));
 nextPostReply={ok:false,errors:['<b>not markup</b>']};await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('<b>not markup</b>')`);assert(!await evaluate(`!!document.querySelector('#program-feedback b')`));assert(await evaluate(contactLink('#program-feedback')));
 nextPostReply={ok:false};await clickFinish();await wait(`document.querySelector('#program-feedback').textContent.includes('Something went wrong')`);assert(await evaluate(contactLink('#program-feedback')));
 await clickFinish();await success();console.log('PASS validation errors have no contact line; server and unknown errors link to membership@thetpw.org as text, not markup');
 failDashboard=true;await send('Page.navigate',{url:base+'/team-form/?embed=1&account=SYNTHETIC-TEST'});await wait(`document.querySelector('.prefill-note')?.textContent.includes('starts blank')`);failDashboard=false;
 assert(await evaluate(contactLink('.prefill-note')));assert(await evaluate(`document.querySelector('.prefill-note').textContent.includes('If your programs should be here, email')&&!document.querySelector('#organization-step').hidden`));console.log('PASS failed last-quarter load starts blank and says who to email');
 await open();await evaluate(`const p=document.querySelector('#program-list > section');p.querySelector('[id$="-program-name"]').value='SYNTHETIC';p.querySelector('[id$="-scheduled-status"]').value='In Progress';p.querySelector('[id$="-start-date"]').value='2026-10-01';p.querySelector('textarea').value='x'.repeat(2001);p.querySelector('.continue-button').click();`);assert(await evaluate(`document.querySelector('#program-next').hidden`));console.log('PASS oversized optional context is rejected');
 await send('Page.navigate',{url:base+'/intake/simple.html'});await wait(`!!document.querySelector('iframe')?.contentDocument?.querySelector('#quarter-summary')?.textContent`);assert(await evaluate(`!document.querySelector('iframe').contentDocument.querySelector('#quarter-step')`));console.log('PASS embedded intake uses slim form');
 assert.deepEqual(exceptions,[]);console.log('PASS browser checks: zero unhandled exceptions, zero live Google requests');
}finally{socket?.close();chrome.kill();await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',resolve);setTimeout(resolve,3000);}});await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
