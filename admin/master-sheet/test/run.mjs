// Setup-only tests. No Google account, requests, emails, or real sheet writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../Setup.gs',import.meta.url),'utf8');
const target='1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0';
const owner='tpwhackathondemodemo@gmail.com';
const headers={Members:['Email or @domain','Organization','Active','Notes'],Submissions:['Example program header','Example audit header']};
function harness({email=owner,tabs={Sheet1:[]},properties={},accessible=true,sheetsEnabled=true,authInstalled=true}={}){
  const changes=[];
  const props={...properties};
  const data=structuredClone(tabs);
  const context=vm.createContext({
    Session:{getEffectiveUser:()=>({getEmail:()=>email})},
    PropertiesService:{getScriptProperties:()=>({getProperty:name=>props[name]||null,setProperties:values=>{changes.push(['properties']);Object.assign(props,values);}})},
    ...(authInstalled?{HEADER:headers.Submissions,MEMBERS_HEADER:headers.Members}:{}),
    ...(sheetsEnabled?{Sheets:{Spreadsheets:{
      get:(id)=>{assert.equal(id,target);if(!accessible)throw Error('Access denied');return {spreadsheetId:id,sheets:Object.keys(data).map(title=>({properties:{title}}))};},
      batchUpdate:(body,id)=>{assert.equal(id,target);for(const request of body.requests){const title=request.addSheet.properties.title;assert(!Object.hasOwn(data,title));data[title]=[];changes.push(['create',title]);}},
      Values:{
        get:(id,range)=>{assert.equal(id,target);const title=range.match(/^'([^']+)'/)[1];return {values:data[title].length?[data[title][0]]:[]};},
        update:(body,id,range,options)=>{assert.equal(id,target);assert.equal(options.valueInputOption,'RAW');const title=range.match(/^'([^']+)'/)[1];data[title][0]=structuredClone(body.values[0]);changes.push(['header',title]);}
      }
    }}}:{}),
  });
  vm.runInContext(source,context);
  return {run:()=>context.configureMasterSheet_(),data,props,changes};
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
test('creates only auth tabs in the requested workbook and requires sign-in',()=>{
  const h=harness();const result=h.run();assert(result.ok);assert.equal(result.spreadsheetId,target);
  assert.deepEqual(h.data.Members, [headers.Members]);assert.deepEqual(h.data.Submissions,[headers.Submissions]);assert.deepEqual(h.data.Sheet1,[]);
  assert.equal(h.props.SPREADSHEET_ID,target);assert.equal(h.props.TPW_CONTACT_EMAIL,owner);assert.equal(h.props.ALLOW_UNSIGNED,'false');
});
test('second run preserves tabs and existing membership/data rows',()=>{
  const tabs={Members:[headers.Members,['test@example.invalid','Example Org','yes','']],Submissions:[headers.Submissions,['Example','record']]};
  const h=harness({tabs});h.run();h.run();assert.deepEqual(h.data,tabs);assert(h.changes.every(([type])=>type==='properties'));
});
test('wrong owner makes no changes',()=>{const h=harness({email:'other@example.invalid'});assert.throws(h.run,/demo owner account/);assert.equal(h.changes.length,0);});
test('missing Sheets service fails before touching properties',()=>{const h=harness({sheetsEnabled:false});assert.throws(h.run,/Sheets service/);assert.equal(h.changes.length,0);});
test('missing auth files fail rather than inventing a different header',()=>{const h=harness({authInstalled:false});assert.throws(h.run,/Rows.gs and SignIn.gs/);assert.equal(h.changes.length,0);});
test('inaccessible workbook makes no changes',()=>{const h=harness({accessible:false});assert.throws(h.run,/Access denied/);assert.equal(h.changes.length,0);});
test('a different configured workbook is never silently replaced',()=>{const h=harness({properties:{SPREADSHEET_ID:'another-sheet',ALLOW_UNSIGNED:'true'}});assert.throws(h.run,/different spreadsheet/);assert.equal(h.props.SPREADSHEET_ID,'another-sheet');assert.equal(h.props.ALLOW_UNSIGNED,'true');assert.equal(h.changes.length,0);});
test('unexpected header refuses all writes, including to other missing tabs',()=>{const h=harness({tabs:{Submissions:[['Unrelated table']]}});assert.throws(h.run,/unexpected or blank header/);assert.equal(h.changes.length,0);assert(!Object.hasOwn(h.data,'Members'));});
test('a preexisting blank header requires manual inspection, not overwrite',()=>{const h=harness({tabs:{Members:[]}});assert.throws(h.run,/unexpected or blank header/);assert.equal(h.changes.length,0);});
test('no public web entry point or remotely callable setup helper is introduced',()=>{for(const [,name]of source.matchAll(/^function\s+(\w+)\s*\(/gm))assert(name.endsWith('_'));assert(!source.includes('MailApp.'));});
console.log(`${passed} setup tests passed; no network or live writes.`);
