// Browser E2E against local.mjs SIMULATION ONLY. Requires Chrome and Node 22+.
// Exercises the real auth-branch frontend and .gs functions, with fake Google services.
// No code shortcuts: repeated sign-in waits for the real 60-second resend cooldown.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base=process.env.LOCAL_E2E_URL||'http://localhost:8814';
assert(/^http:\/\/localhost:\d+$/.test(base),'Only a local simulator is allowed');
const get=url=>fetch(base+url).then(response=>{assert(response.ok);return response.json();});
const initial=await get('/__local/sheet.json');assert.equal(initial.simulation,true);
const baseline=(initial.tabs.Submissions||[]).slice(1);
const owner='tpwhackathondemodemo@gmail.com',other='member-two@example.invalid';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(path.join(tmpdir(),'tpw-email-e2e-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let chromeError;chrome.on('error',error=>{chromeError=error;});
let socket;
try{
 let debugPort;
 for(let i=0;i<100;i++){if(chromeError)throw chromeError;try{debugPort=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{}await sleep(100);}
 assert(debugPort,'Chrome did not start');
 const target=await fetch(`http://localhost:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(response=>response.json());
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let sequence=0;const pending=new Map(),exceptions=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 const post=body=>fetch(base+'/__local/api/',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(response=>response.json());
 assert.equal((await post({token:'',payload:{organization:'Fake org',programs:[]}})).signInNeeded,true);
 assert.equal((await get('/__local/sheet.json')).tabs.Submissions?.length||0,initial.tabs.Submissions?.length||0);
 console.log('PASS unsigned submission is rejected without appending');
 const beforeUnknown=(await get('/__local/outbox.json')).length;
 await post({action:'requestCode',email:'unlisted@example.invalid'});assert.equal((await get('/__local/outbox.json')).length,beforeUnknown);
 await post({action:'requestCode',email:'disabled@example.invalid'});assert.equal((await get('/__local/outbox.json')).length,beforeUnknown);
 console.log('PASS unlisted/disabled emails receive no code');
 async function file(email,name,yards,checkWrong=false){
  const previous=(await get('/__local/outbox.json')).filter(mail=>mail.to===email).at(-1);
  const delay=previous?Date.parse(previous.at)+61000-Date.now():0;
  if(delay>0){console.log(`Waiting ${Math.ceil(delay/1000)}s for the real resend cooldown (${email})`);await sleep(delay);}
  await send('Page.navigate',{url:base+'/form-demo/?embed=1'});
  await wait(`!!document.querySelector('.signin-send')`);
  await evaluate(`document.querySelector('input[type="email"]').value=${JSON.stringify(email)};document.querySelector('.signin-send').click();`);
  await wait(`!document.querySelector('.signin-code-part').hidden`);
  const mail=(await get('/__local/outbox.json')).filter(message=>message.to===email).at(-1);assert(mail,'No simulated code was sent');
  const code=mail.subject.match(/\d{6}$/)[0];
  if(checkWrong){const wrong=code==='000000'?'111111':'000000';await evaluate(`document.querySelector('.signin-code').value=${JSON.stringify(wrong)};document.querySelector('.signin-verify').click();`);await wait(`document.querySelector('.signin-feedback').textContent.includes('left')`);assert.equal(await evaluate('!!window.tpwSession'),false);}
  await evaluate(`document.querySelector('.signin-code').value=${JSON.stringify(code)};document.querySelector('.signin-verify').click();`);
  await wait(`!!window.tpwSession&&!document.querySelector('#organization-step').hidden`);
  assert.equal(await evaluate(`document.querySelector('#organization').readOnly`),true);
  const organization=await evaluate(`document.querySelector('#organization').value`);
  assert.equal((await post({action:'verifyCode',email,code})).ok,false,'Used OTP must not be replayable');
  await evaluate(`document.querySelector('#demo-form').requestSubmit();`);
  await wait(`!document.querySelector('#facilities-step').hidden`);
  await evaluate(`const facility=document.querySelector('#facility');facility.value='SQ';facility.dispatchEvent(new Event('change',{bubbles:true}));`);
  for(const yard of yards)await evaluate(`Array.from(document.querySelectorAll('.yard-choices input')).find(input=>input.value===${JSON.stringify(yard)}).click();`);
  await wait(`!document.querySelector('#continue-programs').disabled`);
  // Let the real transition finish; a click while transitioning is ignored by design.
  await wait(`!document.querySelector('#facilities-step').classList.contains('entering')`);
  await evaluate(`document.querySelector('#continue-programs').click();`);
  await wait(`!document.querySelector('#programs-step').hidden`);
  await evaluate(`(()=>{const program=document.querySelector('#program-list > section');program.querySelector('[id$="-program-name"]').value=${JSON.stringify(name)};program.querySelector('[id$="-scheduled-status"]').value='Completed';program.querySelector('[id$="-start-date"]').value='2026-09-01';program.querySelector('[id$="-end-date"]').value='2026-10-01';program.querySelector('[id$="-course-hours"]').value='20';for(const box of program.querySelectorAll('.program-yards input'))if(!box.checked)box.click();for(const [index,row]of [...program.querySelectorAll('.yard-number-row')].entries()){row.querySelector('[data-kind="participants"]').value=String(10+index);row.querySelector('[data-kind="completed"]').value=String(8+index);}program.querySelector('.continue-button').click();})()`);
  await wait(`!document.querySelector('#program-next').hidden`);
  // A malicious DOM edit must not change the server-selected organization.
  await evaluate(`document.querySelector('#organization').value='Spoofed Organization';document.querySelector('#finish-form').click();`);
  await wait(`!document.querySelector('#submission-result').hidden`);
  const receipt=await evaluate(`document.querySelector('#submission-receipt').textContent`);assert(receipt.includes('Filed with TPW:'),receipt);
  const state=await get('/__local/sheet.json');const rows=state.tabs.Submissions.slice(-yards.length);
  for(const [index,row]of rows.entries()){assert.equal(row[2],organization);assert.equal(row[3],name);assert.equal(row[8],10+index);assert.equal(row[9],8+index);assert.equal(row[16],email);assert.equal(row[17],'Yes');}
  assert.deepEqual(rows.map(row=>row[1]),yards);assert.equal(new Set(rows.map(row=>row[14])).size,1);
  console.log(`PASS browser sign-in → form → ${yards.length} appended row(s): ${email} / ${organization}`);
 }
 await file(owner,'Synthetic E2E first submission',['North','South'],true);
 const firstRows=(await get('/__local/sheet.json')).tabs.Submissions.slice();
 await file(other,'Synthetic E2E second organization',['North']);
 await file(owner,'Synthetic E2E repeat submission',['North']);
 const final=await get('/__local/sheet.json');
 assert.equal(final.tabs.Submissions.length,baseline.length+5); // header + four newly appended rows
 assert.deepEqual(final.tabs.Submissions.slice(0,firstRows.length),firstRows,'First filing must survive later filings unchanged');
 assert.deepEqual(final.tabs.Submissions.slice(1,baseline.length+1),baseline,'Existing rows must be unchanged');
 assert(final.usedIds.length>0);assert(final.usedIds.every(id=>id===initial.spreadsheetId));
 const newRows=final.tabs.Submissions.slice(baseline.length+1);assert.equal(new Set(newRows.map(row=>row[14])).size,3);
 assert.deepEqual(exceptions,[]);
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/tpw-email-e2e-success.png',Buffer.from(screenshot.data,'base64'));
 console.log('PASS repeat submissions append without replacing earlier rows; all API calls use the same workbook ID');
 console.log('PASS no browser JS exceptions; screenshot: /tmp/tpw-email-e2e-success.png');
 console.log('SIMULATED E2E passed. Real email, cross-origin Apps Script responses and real master-sheet writes remain unverified.');
}finally{
 socket?.close();chrome.kill('SIGTERM');await new Promise(resolve=>{if(chrome.exitCode!==null)resolve();else{chrome.once('exit',resolve);setTimeout(resolve,3000);}});await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
