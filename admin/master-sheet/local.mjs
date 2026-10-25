#!/usr/bin/env node
// Serve an immutable snapshot of Richie's auth branch. No checkouts/merges in
// anyone's working tree. Default: simulated email and workbook, localhost only.
// --backend=https://script.google.com/macros/s/.../exec uses the real deployment.
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');if(at<0)throw Error('Use --name=value options');return [arg.slice(2,at),arg.slice(at+1)];}));
for(const key of Object.keys(args))if(!['port','backend','ref'].includes(key))throw Error('Unknown option: '+key);
const port=Number(args.port||8814);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const backend=args.backend||'';
if(backend&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(backend))throw Error('The real backend must be a Google Apps Script /exec URL');
const commit=execFileSync('git',['rev-parse','--verify',(args.ref||'origin/email-code-signin')+'^{commit}'],{cwd:repository,encoding:'utf8'}).trim();
const snapshot=await mkdtemp(path.join(tmpdir(),'tpw-auth-local-'));
try{
  const archive=spawn('git',['archive',commit],{cwd:repository});
  const extract=spawn('tar',['-xf','-','-C',snapshot]);
  archive.stdout.pipe(extract.stdin);archive.stderr.pipe(process.stderr);extract.stderr.pipe(process.stderr);
  await Promise.all([archive,extract].map(child=>new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Snapshot command failed: '+code)));})));
}catch(error){await rm(snapshot,{recursive:true,force:true});throw error;}
const master='1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0';
const owner='tpwhackathondemodemo@gmail.com';
const base=`http://localhost:${port}`;
const require=createRequire(import.meta.url);
const demo=backend?null:require(path.join(snapshot,'apps-script/local-server.js')).load({
  properties:{SPREADSHEET_ID:master,TPW_CONTACT_EMAIL:owner,ALLOW_UNSIGNED:'false'},
  members:[['Email or @domain','Organization','Active','Notes'],
    [owner,'TPW Demo (local)','yes','Synthetic local membership, not a real authorization'],
    ['member-two@example.invalid','Second Demo Organization','yes','Synthetic local member'],
    ['disabled@example.invalid','Disabled Demo Organization','no','Must not receive a code']]
});
// Verify that every simulated Sheets API operation targets the SAME workbook.
const usedIds=[];
if(demo){
  for(const [object,names]of [[demo.context.Sheets.Spreadsheets,['get','batchUpdate']],[demo.context.Sheets.Spreadsheets.Values,['get','update','append']]]){
    for(const name of names){const original=object[name];object[name]=(...values)=>{const id=['batchUpdate','update','append'].includes(name)?values[1]:values[0];if(id!==master)throw Error('Unexpected workbook ID');usedIds.push(id);return original(...values);};}
  }
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=(title,content)=>`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:16px/1.5 system-ui;margin:32px;max-width:1100px}a{color:#285b37}table{border-collapse:collapse;font-size:13px}td,th{padding:8px;border:1px solid #ddd;text-align:left}code{background:#eee;padding:3px}strong.mode{display:block;padding:16px;background:#fff0bf}article{border-bottom:1px solid #ddd;padding:16px 0}.code{font:700 30px monospace}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}</style><body><strong class="mode">${backend?'REAL DEPLOYMENT — submitting can send real emails and write to Google':'SIMULATION — no real emails; no real Google Sheets writes'}</strong><h1>${escape(title)}</h1>${content}</body></html>`;
const send=(response,status,type,body)=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'});response.end(body);};
const json=(response,status,data)=>send(response,status,'application/json; charset=utf-8',JSON.stringify(data));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.csv':'text/csv; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf'};
const server=createServer(async(request,response)=>{
 try{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(request.headers.host))return json(response,403,{error:'Localhost only'});
  if(request.headers.origin&&![base,`http://127.0.0.1:${port}`].includes(request.headers.origin))return json(response,403,{error:'Local origin required'});
  const route=decodeURIComponent(new URL(request.url,base).pathname);
  if(route==='/form-demo/backend.js')return send(response,200,types['.js'],`window.TPW_BACKEND_URL=${JSON.stringify(backend||base+'/__local/api/')};`);
  if(route==='/')return send(response,200,types['.html'],html('Email → sign-in → form → append',`<p>Reference snapshot: <code>${escape(commit.slice(0,8))}</code>. Other branches and the live site are untouched.</p><nav><a href="/form-demo/?embed=1" target="_blank">Open the signed-in form</a>${demo?'<a href="/__local/outbox" target="_blank">Code inbox</a><a href="/__local/sheet" target="_blank">Simulated master sheet</a>':`<a href="https://docs.google.com/spreadsheets/d/${master}/edit" target="_blank">Open the real master sheet</a>`}</nav>${demo?`<ol><li>Use <code>${owner}</code> or <code>member-two@example.invalid</code>.</li><li>Refresh the code inbox, copy the 6-digit code, and enter it in the form.</li><li>Complete the form and submit. Refresh the simulated sheet to see appended rows.</li><li>Repeat, using either allowed email. Existing rows stay in the same simulated workbook.</li></ol><p>Code requests have a one-minute cooldown per email, as on the real backend. Reloading the form requires a new sign-in. The fake spreadsheet is in memory: restarting this server clears it.</p>`:`<p>Emails and submissions go directly from the browser to your configured Apps Script deployment. Make sure its SPREADSHEET_ID is <code>${master}</code>, it executes as the demo owner, and both testing emails are mapped in Members. No local inbox or fake sheet is enabled in this mode.</p>`}`));
  if(route.startsWith('/__local/')){
    if(!demo)return json(response,404,{error:'Simulation endpoints are disabled for real deployment mode'});
    if(route==='/__local/api/'&&request.method==='POST'){
      let raw='';for await(const chunk of request){raw+=chunk;if(Buffer.byteLength(raw)>100*1024)return json(response,413,{error:'Request too large'});}
      const result=demo.context.doPost({postData:{contents:raw}});return send(response,200,types['.json'],result.text);
    }
    if(request.method!=='GET')return json(response,405,{error:'GET required'});
    if(route==='/__local/outbox.json')return json(response,200,demo.outbox);
    if(route==='/__local/sheet.json')return json(response,200,{simulation:true,spreadsheetId:master,usedIds,tabs:demo.tabs});
    if(route==='/__local/outbox')return send(response,200,types['.html'],html('Local code inbox',`<p>Refresh this page after requesting a code. Nothing here was sent by email.</p>${demo.outbox.map(mail=>`<article><strong>${escape(mail.to)}</strong><p class="code">${escape(mail.subject.match(/\d{6}$/)?.[0]||'')}</p><small>${escape(mail.at)}</small></article>`).join('')||'<p>No code requests yet.</p>'}`));
    if(route==='/__local/sheet')return send(response,200,types['.html'],html('Simulated master spreadsheet',`<p>Expected workbook ID: <code>${master}</code>. These are in-memory rows, not the real document. Refresh after submitting.</p>${Object.entries(demo.tabs).map(([name,rows])=>`<h2>${escape(name)}</h2><div style="overflow:auto"><table>${rows.map((row,i)=>'<tr>'+row.map(cell=>`<${i?'td':'th'}>${escape(cell)}</${i?'td':'th'}>`).join('')+'</tr>').join('')}</table></div>`).join('')}`));
    return json(response,404,{error:'Not found'});
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return json(response,405,{error:'GET required'});
  let file=path.resolve(snapshot,'.'+route);if(!file.startsWith(snapshot+path.sep))return json(response,403,{error:'Outside snapshot'});
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  send(response,200,types[path.extname(file)]||'application/octet-stream',request.method==='HEAD'?'':await readFile(file));
 }catch(error){if(!response.headersSent)json(response,error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'Not found':'Local test server error'});else response.end();console.error(error);}
});
server.listen(port,'127.0.0.1',()=>{console.log(`\n${backend?'REAL Apps Script target':'SIMULATED email and workbook'}\n${base}/\nSnapshot: ${snapshot}\nCommit: ${commit}\nCtrl-C stops the server; simulation state is not durable.\n`);});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(snapshot,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.on('error',async error=>{console.error(error.message);await rm(snapshot,{recursive:true,force:true});process.exit(1);});
