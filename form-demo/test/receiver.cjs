// No Google calls. Exercise the new adapter against both real, historical Rows.gs
// contracts. The pinned commits are on the existing email-code and Sheets branches.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(root, 'form-demo/receiver/Code.gs'), 'utf8');
const TAB = 'Submissions; comes from website form DO NOT RENAME';
const instant = '2026-10-25T05:00:00Z';
const plain = value => JSON.parse(JSON.stringify(value));
function harness(rowsSource, options = {}) {
  const writes = [], updates = [], cache = new Map();
  let headers, releases = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } }
  const ctx = vm.createContext({
    Date: Clock, console: {error() {}}, TAB,
    getSession_: () => options.session || null,
    spreadsheetId_: () => 'test-master', submissionRange_: cells => "'" + TAB + "'!" + cells,
    ensureSubmissionsTab_: id => assert.equal(id, 'test-master'),
    appendRows_: rows => { if (options.writeFails) throw Error('write failed'); writes.push(plain(rows)); },
    PropertiesService: {getScriptProperties: () => ({getProperty: name => name === 'ALLOW_UNSIGNED' ? String(options.unsigned !== false) : null})},
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (date, zone, format) => {
        assert.equal(zone, 'America/Los_Angeles'); assert.equal(format, 'yyyy-MM');
        const p = new Intl.DateTimeFormat('en-US', {timeZone: zone, year:'numeric',month:'2-digit'}).formatToParts(date);
        return p.find(v => v.type === 'year').value + '-' + p.find(v => v.type === 'month').value;
      }
    },
    CacheService: {getScriptCache: () => ({get: key => cache.get(key) || null, put: (key,value) => {assert(key.length <= 250);if(options.cacheFails)throw Error('cache offline');cache.set(key,value);}})},
    LockService: {getScriptLock: () => ({tryLock: () => !options.busy, releaseLock: () => releases++})},
    ContentService: {MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    Sheets: {Spreadsheets: {
      get: id => {assert.equal(id,'test-master');return {sheets:[{properties:{title:TAB,sheetId:7,gridProperties:{columnCount:100}}}]};},
      Values: {
        get: (id, range) => {assert.equal(id,'test-master');assert.equal(range,"'"+TAB+"'!1:1");return {values:[headers.slice()]};},
        update: (request,id,range) => {
          assert.equal(id,'test-master');assert(range.startsWith("'"+TAB+"'!"));
          let col=0;for(const c of range.split('!')[1].match(/^[A-Z]+/)[0])col=col*26+c.charCodeAt(0)-64;
          headers[col-1]=request.values[0][0];updates.push({range,request});
        }
      }
    }}
  });
  vm.runInContext(rowsSource, ctx); vm.runInContext(code, ctx);
  headers = plain(ctx.HEADER);
  if (options.reorder) headers.reverse();
  if (options.missing) headers = headers.filter(h => h !== 'Notes');
  if (options.duplicate) headers.push('Notes');
  if (options.custom) headers.splice(2,0,'Staff-only extra column');
  const post = payload => JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({token:'a'.repeat(64),payload})}}).text);
  return {ctx,writes,updates,post,headers:()=>headers,releases:()=>releases};
}
function payload() {
  return {submissionId:crypto.randomUUID(),organization:'SYNTHETIC TEST',reportingPeriod:{quarter:1,year:2001},extraQuestion:'keep this',token:'DO NOT STORE',programs:[{
    name:'SYNTHETIC TEST',status:'Completed',startDate:'2026-09-01',endDate:'2026-10-01',courseHours:10,
    notes:'=not a formula\nAdditional context',newOptionalQuestion:{answer:'preserved'},
    sites:[{facilityCode:'SQ',yard:'North',participants:5,completed:4,extraCount:123},{facilityCode:'SQ',yard:'South',participants:2,completed:1}]
  }]};
}
let passed=0;
function test(name, fn) {fn();passed++;console.log('PASS',name);}
for (const [label,commit] of [['older','bb13e5d'],['newer','4792dcf']]) {
  const source = execFileSync('git',['show',commit+':apps-script/Rows.gs'],{cwd:root,encoding:'utf8'});
  test(label+': current quarter is server-derived; notes go in existing Notes column; extra JSON retains additions, not tokens',()=>{
    const h=harness(source),reply=h.post(payload());assert.equal(reply.ok,true);assert.equal(reply.rows,2);assert.equal(reply.signedIn,false);
    const rows=h.writes[0],note=h.headers().indexOf('Notes'),extra=h.headers().indexOf('Additional data (JSON)');
    assert.equal(rows[0][note],"'=not a formula\nAdditional context");assert.equal(rows[1][note],rows[0][note]);
    const snapshot=JSON.parse(rows[0][extra].slice(1));assert.deepEqual(snapshot.submission.reportingPeriod,{quarter:4,year:2026});assert.equal(snapshot.submission.extraQuestion,'keep this');assert.equal(snapshot.submission.token,undefined);assert.equal(snapshot.program.newOptionalQuestion.answer,'preserved');assert.equal(snapshot.site.extraCount,123);assert.equal(snapshot.program.sites,undefined);assert.equal(h.updates.length,1);
  });
  test(label+': empty optional notes are accepted',()=>{const h=harness(source),p=payload();delete p.programs[0].notes;assert(h.post(p).ok);assert.equal(h.writes[0][0][h.headers().indexOf('Notes')],'');});
  test(label+': Planned is refused before any write',()=>{const h=harness(source),p=payload();p.programs[0].status='Planned';assert.equal(h.post(p).ok,false);assert.equal(h.writes.length,0);assert.equal(h.updates.length,0);});
  test(label+': In Progress is accepted with its start date',()=>{const h=harness(source),p=payload();p.programs[0].status='In Progress';p.programs[0].endDate='';assert(h.post(p).ok);});
  test(label+': long/non-text notes and invalid dates/counts fail without changing the sheet',()=>{for(const mutate of [p=>p.programs[0].notes='x'.repeat(2001),p=>p.programs[0].notes={},p=>p.programs[0].startDate='',p=>p.programs[0].sites[0].completed=99]){const h=harness(source),p=payload();mutate(p);assert.equal(h.post(p).ok,false);assert.equal(h.writes.length,0);assert.equal(h.updates.length,0);}});
  test(label+': reorder/inserted columns are mapped by name, not position',()=>{const h=harness(source,{reorder:true,custom:true});assert(h.post(payload()).ok);const row=h.writes[0][0];assert.equal(row[h.headers().indexOf('Organization Name')].replace(/^'/,''),'SYNTHETIC TEST');assert.equal(row[h.headers().indexOf('Number of Participants')],5);assert.equal(row[2],'');});
  test(label+': missing/duplicate core headings fail explicitly without appending',()=>{for(const options of [{missing:true},{duplicate:true}]){const h=harness(source,options),reply=h.post(payload());assert.equal(reply.ok,false);assert(reply.errors[0].includes('heading'));assert.equal(h.writes.length,0);}});
  test(label+': retry deduplicates; distinct submission appends; new header added only once',()=>{const h=harness(source),p=payload(),first=h.post(p);assert.deepEqual(h.post(p),first);assert.equal(h.writes.length,1);assert(h.post(payload()).ok);assert.equal(h.writes.length,2);assert.equal(h.updates.length,1);});
  test(label+': server session overrides spoofed organization in columns AND snapshot',()=>{const h=harness(source,{unsigned:false,session:{email:'test@example.invalid',organization:'SERVER ORG'}});assert(h.post(payload()).ok);const row=h.writes[0][0];assert.equal(row[h.headers().indexOf('Organization Name')].replace(/^'/,''),'SERVER ORG');assert.equal(JSON.parse(row[h.headers().indexOf('Additional data (JSON)')].slice(1)).submission.organization,'SERVER ORG');});
  test(label+': unsigned gate, busy lock, write failure and receipt-cache failure',()=>{for(const [options,ok] of [[{unsigned:false},false],[{busy:true},false],[{writeFails:true},false],[{cacheFails:true},true]]){const h=harness(source,options);assert.equal(h.post(payload()).ok,ok);if(options.writeFails)assert.equal(h.releases(),1);}});
  test(label+': malformed request returns JSON; capabilities are public and explicit',()=>{const h=harness(source);assert.equal(JSON.parse(h.ctx.doPost({postData:{contents:'bad'}}).text).ok,false);assert.equal(plain(h.ctx.getFormCapabilities()).features.programNotes,true);});
  test(label+': California quarter boundaries match intended reporting date',()=>{const h=harness(source);assert.deepEqual(plain(h.ctx.currentReportingPeriod_(new Date('2027-01-01T07:59:59Z'))),{quarter:4,year:2026});assert.deepEqual(plain(h.ctx.currentReportingPeriod_(new Date('2027-01-01T08:00:00Z'))),{quarter:1,year:2027});});
}
console.log(`${passed} receiver checks passed; zero Google calls or live writes.`);
