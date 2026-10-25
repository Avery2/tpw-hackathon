// Standalone Apps Script VM tests: no quarterly source imports, Google or emails.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
execFileSync('python3',['scripts/build_additional_forms.py','--check'],{cwd:root});
const configSource=fs.readFileSync(path.join(__dirname,'Config.gs'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'Code.gs'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const configContext=vm.createContext({});vm.runInContext(configSource,configContext);
const config=plain(configContext.ADDITIONAL_FORMS_CONFIG_);
const facilities=config.facilities;
const headers=['Record ID','Submission reference','Received at','Organization','Signed in','Source','Program','Facility','Facilities','Session date','Quarter','Participant ID','Release date','Status','People present','People served','People completed','Notes','Record (JSON)','Receipt (JSON)'];
const master='PRIVATE_MASTER_WORKBOOK_0123456789';
function harness(options={},persistent){
 const tabs=persistent||new Map(),writes=[],mutations=[],reads=[];
 const activeConfig=plain(options.config||config);
 const allowedTabs=Object.values(activeConfig.forms).map(f=>f.tab);
 let locked=false,released=0;
 const rangeParts=range=>{const m=/^'([^']+)'!(.*)$/.exec(range);assert(m,range);assert(allowedTabs.includes(m[1]),'Attempted to access unapproved tab '+m[1]);return m.slice(1);};
 const ctx=vm.createContext({
  console:{error(){}},
  ADDITIONAL_FORMS_CONFIG_:activeConfig,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>{if(key==='SPREADSHEET_ID')return options.missingId?'':master;if(key==='ALLOW_UNSIGNED')return options.unsigned===false?'false':'true';throw Error('Unrecognized property '+key);}})},
  LockService:{getScriptLock:()=>({tryLock:ms=>{assert.equal(ms,20000);locked=!options.busy;return locked;},releaseLock:()=>{assert(locked);locked=false;released++;}})},
  Utilities:{getUuid:()=>crypto.randomUUID()},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  Sheets:{Spreadsheets:{
   get:(id,fields)=>{assert(locked);assert.equal(id,master);return{sheets:[...tabs.keys()].map((title,index)=>({properties:{title,sheetId:index+1}}))};},
   batchUpdate:(body,id)=>{assert(locked);assert.equal(id,master);assert.equal(body.requests.length,2);const props=body.requests[0].addSheet.properties,name=props.title;assert(allowedTabs.includes(name));assert(!tabs.has(name));assert(![...tabs.keys()].some((_,index)=>index+1===props.sheetId));const update=body.requests[1].updateCells;assert.deepEqual(plain(update.start),{sheetId:props.sheetId,rowIndex:0,columnIndex:0});assert.equal(update.fields,'userEnteredValue');const heading=plain(update.rows[0].values.map(cell=>cell.userEnteredValue.stringValue));assert.deepEqual(heading,headers);if(options.batchFails)throw Error('Atomic initialization rejected');tabs.set(name,[heading]);mutations.push(['create',name],['header',name]);if(options.creationLostResponse)throw Error('Lost response after atomic initialization');},
   Values:{
    get:(id,range)=>{assert(locked);assert.equal(id,master);const[name,cells]=rangeParts(range);reads.push(range);assert(tabs.has(name));assert(['1:1','A2:T'].includes(cells));return{values:plain(cells==='1:1'?tabs.get(name).slice(0,1):tabs.get(name).slice(1))};},
    update:()=>{assert.fail('Headers must be created atomically with the tab, not through a second Values.update call');},
    append:(body,id,range,opts)=>{assert(locked);assert.equal(id,master);assert.equal(opts.valueInputOption,'RAW');assert.equal(opts.insertDataOption,'INSERT_ROWS');const[name,cells]=rangeParts(range);assert.equal(cells,'A:T');assert.equal(body.values.length,1);if(options.writeFails)throw Error('offline');const row=plain(body.values[0]);tabs.get(name).push(row);writes.push({name,row,opts});mutations.push(['append',name]);if(options.lostResponse)throw Error('Lost response after durable append');return{};}
   }
  }}
 });
 vm.runInContext(source,ctx);
 const http=body=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}).text);
 return{ctx,tabs,writes,mutations,reads,released:()=>released,http,post:record=>http({action:'submitRecord',payload:plain(record)}),get:()=>JSON.parse(ctx.doGet().text)};
}
function record(kind='aggregate'){
 const base={id:kind+'-synthetic-2026-10-25-abcdef',kind,schema:'tpw.simple/1',source:'quick-form',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC ORG'};
 if(kind==='aggregate')return{...base,program:'Synthetic test',facilities:facilities.slice(0,2),quarter:'2026-Q4',served:12,completed:8,gender_men:7,age_under_25:2};
 return{...base,token:'M78',release_date:'2026-08-01',status:'new_conviction',days:60};
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
// The Session form was removed on 25 Oct 2026 (it recorded a coded ID per person).
// Its records must now be refused, typed or scanned.
const sessionShapes=[{kind:'session',id:'session-synthetic-2026-10-25-abcdef',schema:'tpw.simple/1',source:'quick-form',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC ORG',program:'Synthetic test',facility:facilities[0],session_date:'2026-10-25',present_count:3},{kind:'session',id:'session-synthetic-2026-10-25-scanned',schema:'tpw.simple/1',source:'scan',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC ORG',program:'Synthetic test',facility:facilities[0],session_date:'2026-10-25',sheet:'abc123',roster:['M78','J90'],roster_size:2,present:['M78'],present_count:1}];
function rejected(change,kind='aggregate'){const h=harness(),p=record(kind);change(p);const result=h.post(p);assert.equal(result.ok,false,JSON.stringify(p));assert(result.errors.length);assert.equal(h.mutations.length,0);return result;}
test('public capabilities expose approved mappings but never workbook data',()=>{const h=harness(),r=h.get();assert.equal(r.ok,true);assert.equal(r.service,'tpw.additional-forms');assert.equal(r.version,1);assert.equal(r.features.quickRecords,true);assert.deepEqual(r.recordKinds,Object.keys(config.forms));assert.deepEqual(r.recordTabs,Object.fromEntries(Object.entries(config.forms).map(([kind,f])=>[kind,f.tab])));assert(!JSON.stringify(r).includes(master));assert.equal(h.reads.length,0);});
test('all approved forms share ONE master and never read/write the quarterly tab',()=>{
 const h=harness();h.tabs.set('Submissions; comes from website form DO NOT RENAME',[['Keep guided data'],['do not touch']]);
 for(const kind of ['aggregate','followup']){const p=record(kind),r=h.post(p);assert.equal(r.ok,true);assert.equal(r.tab,config.forms[kind].tab);assert.equal(r.recordId,p.id);assert.equal(r.rows,1);assert.equal(r.signedIn,false);assert(r.submissionId);assert.deepEqual(h.tabs.get(r.tab)[0],headers);assert.deepEqual(JSON.parse(h.writes.at(-1).row[18]),p);}
 assert.deepEqual(h.tabs.get('Submissions; comes from website form DO NOT RENAME'),[['Keep guided data'],['do not touch']]);
});
test('session records are refused and never create a Session tab',()=>{
 const h=harness();assert(!h.get().recordKinds.includes('session'));assert(!Object.keys(config.forms).includes('session'));
 for(const shape of sessionShapes){const r=h.post(shape);assert.equal(r.ok,false,JSON.stringify(shape));assert(r.errors.length);}
 assert.equal(h.mutations.length,0);assert.equal(h.tabs.has('Quarter records'),false);
});
test('unknown kind, destination overrides and nested personal-data fields reject',()=>{
 for(const key of ['participant_name','names','ssn','dob','cdcr_number','files','photo','authorization','organization','demographics','tab','spreadsheetId','__proto__'])rejected(p=>Object.defineProperty(p,key,{value:{secret:'NEVER SAVE'},enumerable:true}));
 rejected(p=>p.kind='unapproved');rejected(p=>p.kind='__proto__');rejected(p=>p.kind=['session']);rejected(p=>p.program={name:'PII'});rejected(p=>p.present=['Full Name']);rejected(p=>p.token='Full Name','followup');
});
test('the HTTP envelope never accepts quarterly tokens or caller destinations',()=>{for(const extra of [{token:'QUARTERLY SECRET'},{tab:'Submissions'},{spreadsheetId:'OTHER'},{action:'submitOther'}]){const h=harness();assert.equal(h.http({action:'submitRecord',payload:record(),...extra}).ok,false);assert.equal(h.mutations.length,0);}const h=harness();assert.equal(JSON.parse(h.ctx.doPost({postData:{contents:'bad'}}).text).ok,false);assert.equal(h.http({action:'submitRecord',payload:record()}).ok,true);});
test('strict numeric types, bounds and config-driven enum/format validation',()=>{
 for(const value of [true,'3',-1,20001,1.5,{},[]])rejected(p=>p.served=value);
 rejected(p=>p.sessions_held=501);rejected(p=>p.attendance=100001);rejected(p=>p.notes='x'.repeat(401));rejected(p=>p.program='x'.repeat(201));rejected(p=>p.gender_men=20001);
 rejected(p=>p.quarter='2026-Q5','aggregate');rejected(p=>p.served=20001,'aggregate');rejected(p=>p.completed=13,'aggregate');rejected(p=>p.gender_men='7','aggregate');rejected(p=>p.days=3651,'followup');rejected(p=>p.status='other','followup');rejected(p=>p.status='unknown','followup');
});
test('real dates, required schema, allowed source and metadata bounds',()=>{
 for(const date of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-1-01',12,'0099-01-01'])rejected(p=>p.release_date=date,'followup');
 assert(harness().post({...record('followup'),release_date:'2024-02-29'}).ok);
 rejected(p=>p.submitted_at='2026-02-30T00:00:00.000Z');rejected(p=>p.submitted_at='x'.repeat(1000));rejected(p=>p.schema='tpw.simple/2');rejected(p=>delete p.schema);rejected(p=>p.source='other');rejected(p=>p.id='x'.repeat(122));
});
test('facilities match configuration exactly',()=>{for(const value of [[],['ASP'],[facilities[0]+' '],[{name:facilities[0]}],[12],facilities.slice(0,21),[facilities[0],facilities[0]],'ASP'])rejected(p=>p.facilities=value);});
test('unsigned demo flag defaults closed, without borrowing quarterly auth',()=>{const h=harness({unsigned:false});const r=h.post(record());assert.equal(r.ok,false);assert(r.errors[0].includes('disabled'));assert.equal(h.mutations.length,0);assert.equal(h.ctx.getSession_,undefined);assert.equal(h.ctx.buildRows,undefined);});
test('busy locks, missing workbook property and write errors fail safely',()=>{for(const options of [{busy:true},{missingId:true},{writeFails:true}]){const h=harness(options);assert.equal(h.post(record()).ok,false);if(!options.writeFails)assert.equal(h.mutations.length,0);if(!options.busy)assert.equal(h.released(),1);}});
test('atomic tab initialization cannot leave an orphan after failure or a lost response',()=>{const failed=harness({batchFails:true});assert.equal(failed.post(record()).ok,false);assert.equal(failed.tabs.size,0);assert.equal(failed.mutations.length,0);const lost=harness({creationLostResponse:true});assert.equal(lost.post(record()).ok,false);assert.deepEqual(lost.tabs.get('Quarter records'),[headers]);const retry=harness({},lost.tabs);assert(retry.post(record()).ok);assert.equal(retry.writes.length,1);assert.deepEqual(retry.mutations.map(m=>m[0]),['append']);});
test('durable same-ID retry survives process restart and a lost response',()=>{const h=harness({lostResponse:true}),p=record();assert.equal(h.post(p).ok,false);assert.equal(h.writes.length,1);const next=harness({},h.tabs),receipt=next.post(Object.fromEntries(Object.entries(p).reverse()));assert(receipt.ok);assert.equal(next.writes.length,0);assert.deepEqual(next.post(p),receipt);assert.equal(receipt.submissionId,JSON.parse(h.writes[0].row[19]).submissionId);});
test('same ID with changed content or org never silently appends again',()=>{const h=harness(),p=record();assert(h.post(p).ok);for(const next of [{...p,served:13},{...p,org:'OTHER ORG'},{...p,notes:'changed'}]){const r=h.post(next);assert.equal(r.ok,false);assert.equal(r.submissionId,undefined);}assert.equal(h.writes.length,1);});
test('formula-like values stay RAW and retain exact text',()=>{const h=harness(),p={...record(),org:'=HYPERLINK("bad")',program:'+not formula',notes:'=SUM(1,2)\n@literal'};assert(h.post(p).ok);assert.equal(h.writes[0].opts.valueInputOption,'RAW');assert.equal(h.writes[0].row[3],p.org);assert.equal(h.writes[0].row[17],p.notes);assert.deepEqual(JSON.parse(h.writes[0].row[18]),p);});
test('existing correct tab appends without touching its headers',()=>{const h=harness({},new Map([['Quarter records',[headers.slice()]]]));assert(h.post(record()).ok);assert.deepEqual(h.mutations.map(m=>m[0]),['append']);});
test('unrelated, empty, reordered and duplicate headers fail without mutation',()=>{for(const head of [[],['unrelated'],headers.slice().reverse(),[...headers,'Staff extra'],[...headers.slice(0,-1),headers[0]]]){const tabs=new Map([['Quarter records',head.length?[head,['original data']]:[]]]),before=plain([...tabs]),h=harness({},tabs);assert.equal(h.post(record()).ok,false);assert.equal(h.mutations.length,0);assert.deepEqual(plain([...tabs]),before);}});
test('bad other-kind tab blocks mutation; dedupe IDs span all approved tabs',()=>{const h=harness();h.tabs.set('Follow-ups',[['unrelated']]);assert.equal(h.post(record()).ok,false);assert.equal(h.mutations.length,0);const good=harness(),p=record();assert(good.post(p).ok);assert.equal(good.post({...record('followup'),id:p.id}).ok,false);assert.equal(good.writes.length,1);});
test('required fields and hidden conditional values are configuration-driven',()=>{rejected(p=>p.org=' ');rejected(p=>delete p.quarter);rejected(p=>delete p.facilities);const p=record('followup');delete p.days;p.status='unknown';assert(harness().post(p).ok);});
test('future form and changed approved tab work without receiver code changes',()=>{
 const custom=plain(config);custom.forms.future_check={tab:'Future check-ins',schema:'tpw.future/1',sources:['future-form'],fields:{org:{type:'text',required:true},rating:{type:'integer',min:0,max:5,required:true}},rules:[]};custom.forms.aggregate.tab='Approved quarter tab';
 const h=harness({config:custom});assert.equal(h.get().recordTabs.future_check,'Future check-ins');const p={id:'future-check-synthetic-abcdef',kind:'future_check',schema:'tpw.future/1',source:'future-form',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC',rating:4};assert.equal(h.post(p).tab,'Future check-ins');assert.equal(JSON.parse(h.writes[0].row[18]).rating,4);assert.equal(h.post(record()).tab,'Approved quarter tab');assert.equal(harness().post(p).ok,false);
});
test('runtime guard refuses reserved, duplicate and unsafe destination config',()=>{for(const tab of ['Submissions','Submissions Quarterly','Members','Constants','Data Entry Sheet','Form Responses 1','Follow-ups',"Bad'!A1"]){const custom=plain(config);custom.forms.aggregate.tab=tab;const h=harness({config:custom});assert.equal(h.get().ok,false);assert.equal(h.post(record()).ok,false);assert.equal(h.mutations.length,0);}});
console.log(`${passed} standalone receiver checks passed; zero Google calls.`);
