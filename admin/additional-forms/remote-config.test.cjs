// Real standalone Code.gs + remote config adapter, with Google/network stubbed.
// No account, credentials, network, workbook reads or writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const config = JSON.parse(execFileSync('python3', ['scripts/build_additional_forms_runtime.py', '--stdout'], {cwd:root, encoding:'utf8'}));
const bundle = execFileSync('python3', ['scripts/build_additional_forms_runtime.py', '--apps-script', '--stdout'], {cwd:root, encoding:'utf8'});
const plain = value => JSON.parse(JSON.stringify(value));
const url = 'https://www.averychan.site/tpw-hackathon/data/intake/additional_forms.runtime.json';
const memory = () => ({cache:new Map(), tabs:new Map(), now:0});
function harness(options={}, shared=memory()) {
  const fetches=[], calls=[];
  let locked=false;
  const ctx=vm.createContext({
    console:{error(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>({RECORD_CONFIG_URL:options.url,ALLOW_UNSIGNED:'true',SPREADSHEET_ID:'SYNTHETIC_PRIVATE_MASTER_1234567890'})[key]||null})},
    CacheService:{getScriptCache:()=>({
      get:key=>{if(options.cacheFails)throw Error('cache unavailable');const hit=shared.cache.get(key);return hit&&hit.expires>shared.now?hit.text:null;},
      put:(key,text,seconds)=>{if(options.cacheFails)throw Error('cache unavailable');assert.equal(seconds,300);shared.cache.set(key,{text,expires:shared.now+seconds*1000});}
    })},
    UrlFetchApp:{fetch:(target,opts)=>{
      fetches.push(target);assert.equal(opts.followRedirects,false);assert.equal(opts.muteHttpExceptions,true);
      if(options.offline)throw Error('offline');
      return {getResponseCode:()=>options.status||200,getContentText:()=>options.body===undefined?JSON.stringify(options.config||config):options.body};
    }},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>{locked=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID()},
    Sheets:{Spreadsheets:{
      get:()=>{assert(locked);calls.push('book');return {sheets:[...shared.tabs.keys()].map(title=>({properties:{title}}))};},
      batchUpdate:body=>{assert(locked);const tab=body.requests[0].addSheet.properties.title;const initial=body.requests[1]?.updateCells.rows.map(row=>row.values.map(cell=>cell.userEnteredValue.stringValue))||[];shared.tabs.set(tab,plain(initial));calls.push('create:'+tab);},
      Values:{
        get:(_,range)=>{assert(locked);calls.push(range);const [,tab,cells]=/^'([^']+)'!(.*)$/.exec(range);assert(!/^Submissions/.test(tab));return {values:plain(cells==='1:1'?shared.tabs.get(tab).slice(0,1):shared.tabs.get(tab).slice(1))};},
        update:(body,_,range,opts)=>{assert(locked);assert.equal(opts.valueInputOption,'RAW');const tab=/^'([^']+)'!/.exec(range)[1];shared.tabs.get(tab).push(plain(body.values[0]));calls.push('header:'+tab);},
        append:(body,_,range,opts)=>{assert(locked);assert.equal(opts.valueInputOption,'RAW');const tab=/^'([^']+)'!/.exec(range)[1];shared.tabs.get(tab).push(plain(body.values[0]));calls.push('append:'+tab);}
      }
    }}
  });
  vm.runInContext(bundle,ctx);
  return {ctx,shared,fetches,calls,get:()=>JSON.parse(ctx.doGet().text),post:payload=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'submitRecord',payload})}}).text)};
}
const record=()=>({id:'session-synthetic-remote-abcdef',kind:'session',schema:'tpw.simple/1',source:'quick-form',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC ORG',program:'Synthetic session',facility:config.facilities[0],session_date:'2026-10-25',present_count:3});
let passed=0;
function test(name,fn){fn();console.log('PASS '+name);passed++;}
function invalid(change){const c=plain(config);change(c);const h=harness({config:c});assert.equal(h.get().ok,false);assert.equal(h.post(record()).ok,false);assert.equal(h.calls.length,0);}
test('public JSON is deterministic and has a content revision, no executable wrapper',()=>{assert.equal(config.revision.length,64);assert.equal(execFileSync('python3',['scripts/build_additional_forms_runtime.py','--stdout'],{cwd:root,encoding:'utf8'}),JSON.stringify(JSON.parse(execFileSync('python3',['scripts/build_additional_forms_runtime.py','--stdout'],{cwd:root,encoding:'utf8'})),null,2)+'\n');});
test('lazy load keeps network errors inside normal JSON handlers',()=>{const h=harness({offline:true});assert.equal(h.fetches.length,0);const r=h.get();assert.equal(r.ok,false);assert(r.errors[0].includes('configuration'));assert.equal(h.calls.length,0);});
test('unchanged Code.gs serves capabilities from the fixed public JSON URL',()=>{const h=harness();assert.equal(h.get().ok,true);assert.deepEqual(h.fetches,[url]);assert.equal(h.get().recordTabs.session,'Session records');assert.equal(h.fetches.length,1);assert.equal(h.calls.length,0);});
test('one immutable-by-request snapshot is used across all validation reads',()=>{const h=harness();assert(h.get().ok);const first=h.ctx.ADDITIONAL_FORMS_CONFIG_.forms;h.shared.now=999999;assert.equal(h.ctx.ADDITIONAL_FORMS_CONFIG_.forms,first);assert.equal(h.fetches.length,1);});
test('five-minute cache works across fresh executions; expired policy reloads',()=>{const shared=memory();assert(harness({},shared).get().ok);const cached=harness({offline:true},shared);assert(cached.get().ok);assert.equal(cached.fetches.length,0);shared.now=300001;const next=harness({},shared);assert(next.get().ok);assert.equal(next.fetches.length,1);});
test('expired configuration never falls back to stale or bundled definitions',()=>{const shared=memory();assert(harness({},shared).get().ok);shared.now=300001;const h=harness({offline:true},shared);assert.equal(h.post(record()).ok,false);assert.equal(h.calls.length,0);});
test('a corrupt cache is ignored and refetched, not trusted',()=>{for(const text of ['bad',JSON.stringify({url,config:{schema:'bad'}})]){const shared=memory();shared.cache.set('additional-forms:remote:v1',{text,expires:999999});const h=harness({},shared);assert(h.get().ok);assert.equal(h.fetches.length,1);}});
test('cache outages do not prevent a fresh validated fetch',()=>{const h=harness({cacheFails:true});assert(h.get().ok);assert.equal(h.fetches.length,1);});
test('owner URL change cannot reuse another URL cache',()=>{const shared=memory();harness({},shared).get();const other='https://example.org/forms.json';const h=harness({url:other},shared);assert(h.get().ok);assert.deepEqual(h.fetches,[other]);});
test('unsafe URLs, redirects, non-JSON and oversized replies fail before Sheets',()=>{for(const options of [{url:'http://example.org/forms.json'},{url:'https://user:pass@example.org/forms.json'},{url:'https://example.org/forms.json#x'},{status:302},{status:404},{body:'<html>Error</html>'},{body:' '.repeat(250001)}]){const h=harness(options);assert.equal(h.get().ok,false);assert.equal(h.post(record()).ok,false);assert.equal(h.calls.length,0);}});
test('malformed schema, service, version and revision fail closed',()=>{for(const key of ['schema','service','version','revision'])invalid(c=>c[key]='wrong');invalid(c=>c.formz={});invalid(c=>c.forms=[]);invalid(c=>c.facilities=[]);invalid(c=>c.templates=[]);});
test('reserved, duplicate and arbitrary spreadsheet destination mappings are refused',()=>{for(const tab of ['Submissions','Submissions Quarterly','Members','Constants','Data Entry Sheet','Form Responses 1','Follow-ups',"Bad'!A1"]){invalid(c=>c.forms.session.tab=tab);}});
test('invalid field rules, enums, types and direct identifiers never reach Sheets',()=>{invalid(c=>c.forms.session.fields.present_count.type='javascript');invalid(c=>delete c.forms.session.fields.org);invalid(c=>c.forms.session.fields.present_count.max='60');invalid(c=>c.forms.session.fields.notes.options=['bad']);invalid(c=>c.forms.aggregate.fields.quarter.options=['same','same']);invalid(c=>c.forms.session.rules.push({type:'eval',field:'org',of:'org'}));invalid(c=>c.forms.session.rules[0].of='unknown');invalid(c=>c.formats.participantId='[');for(const key of ['participant_name','cdcr_number','ssn','files','photo','tax_id'])invalid(c=>c.forms.session.fields[key]={type:'text'});});
test('caller cannot substitute a configuration URL or schema in the envelope',()=>{const h=harness();const r=JSON.parse(h.ctx.doPost({postData:{contents:JSON.stringify({action:'submitRecord',payload:record(),configUrl:'https://evil.invalid/schema.json'})}}).text);assert.equal(r.ok,false);assert.equal(h.fetches.length,0);assert.equal(h.calls.length,0);});
test('remote policy drives a real mocked append and durable same-ID retry',()=>{const shared=memory();shared.tabs.set('Submissions; comes from website form DO NOT RENAME',[['Existing guided data'],['KEEP']]);const h=harness({},shared),p=record(),r=h.post(p);assert(r.ok);assert.equal(r.tab,'Session records');assert(h.calls.includes('append:Session records'));const stored=JSON.parse(shared.tabs.get('Session records')[1][18]);assert.deepEqual(stored,p);assert.deepEqual(harness({},shared).post(p),r);assert.equal(shared.tabs.get('Session records').length,2);assert.deepEqual(shared.tabs.get('Submissions; comes from website form DO NOT RENAME'),[['Existing guided data'],['KEEP']]);});
test('new optional question takes effect after cache expiry, with no Apps Script edits',()=>{const shared=memory();harness({},shared).get();const updated=plain(config);updated.forms.session.fields.context={type:'textarea',max:1000};updated.revision='a'.repeat(64);const p={...record(),context:'Synthetic additional answer'};const old=harness({config:updated},shared);assert.equal(old.post(p).ok,false);assert.equal(old.calls.length,0);shared.now=300001;const fresh=harness({config:updated},shared);assert(fresh.post(p).ok);assert.equal(JSON.parse(shared.tabs.get('Session records')[1][18]).context,p.context);});
test('new approved form kind creates its own tab without touching receiver code',()=>{const next=plain(config);next.forms.feedback={tab:'Feedback',schema:'tpw.feedback/1',sources:['quick-form'],fields:{org:{type:'text',required:true},rating:{type:'integer',required:true,min:0,max:5}},rules:[]};next.revision='b'.repeat(64);const h=harness({config:next});assert(h.get().recordKinds.includes('feedback'));const r=h.post({id:'feedback-synthetic-abcdef',kind:'feedback',schema:'tpw.feedback/1',source:'quick-form',submitted_at:'2026-10-25T12:00:00.000Z',org:'SYNTHETIC ORG',rating:4});assert(r.ok);assert.equal(r.tab,'Feedback');});
console.log(`${passed} remote-configuration checks passed; zero Google calls.`);
