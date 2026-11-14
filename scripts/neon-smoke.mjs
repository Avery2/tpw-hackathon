import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {submissionDocument} from '../form-demo/js/submissions.js';
import {existingPrograms} from '../dashboard/js/data.js';
import {checkinDraft} from '../dashboard/js/checkin-data.js';
const base=process.env.TPW_SMOKE_URL || 'http://localhost:8788';
const id=randomUUID(),org='org-1';
const db=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await db.connect();
try{
 const health=await fetch(`${base}/api/health`).then(r=>r.json());assert.equal(health.ok,true);
 const before=await fetch(`${base}/api/dashboard?org=${org}`).then(r=>r.json());assert.equal(before.org.id,org);assert.ok(before.submissions.length);
 const submission=submissionDocument({organization:before.org.name,orgId:org,reportingPeriod:{year:2026,quarter:4},prisons:[{code:'SQ',name:'Synthetic smoke facility',yards:['North']}],programs:[{id:'neon-smoke-program',name:'Synthetic smoke program',assignments:[{code:'SQ',yards:['North']}],values:Object.fromEntries(Object.entries({program_name:'Synthetic smoke program',scheduled_status:'Completed',start_date:'2026-10-01',end_date:'2026-10-31',course_hours:'104',participants:'20',participants_completed:'15'}).map(([k,v])=>[`programs[0][${k}]`,v]))}],submittedAt:new Date().toISOString()});
 for(let n=0;n<2;n++){const r=await fetch(`${base}/api/submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,submission})});assert.equal(r.status,200,await r.text());}
 const after=await fetch(`${base}/api/dashboard?org=${org}`).then(r=>r.json());assert.equal(after.submissions.length,before.submissions.length+1);
 const stored=after.submissions.find(s=>s.id===id);assert.equal(stored.totals.participants,20);assert.equal(stored.totals.participantHoursDelivered,1560);
 assert.equal(existingPrograms(after.submissions).find(p=>p.id==='neon-smoke-program').participantsCompleted,15);
 const draft=checkinDraft(after);const carried=draft.programs.find(p=>p.id==='neon-smoke-program');assert.ok(carried);assert.ok(Object.values(carried.values).includes('104'));
 const all=await fetch(`${base}/api/dashboard`).then(r=>r.json());assert.ok(all.orgs.length>=2);assert.ok(all.submissions.some(s=>s.id===id));
 submission.programs[0].participantsCompleted=21;
 const invalid=await fetch(`${base}/api/submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,submission})});assert.equal(invalid.status,400);
 for(const resource of ['/.env.local','/server/db.js','/neon.ts']){const response=await fetch(base+resource);assert.equal(response.status,404);}
 console.log('PASS: live Neon health, org/TPW reads, form serialization, save + retry (one row), historical dashboard calculations, check-in prefill, invalid-save rejection, server-secret isolation.');
}finally{await db.query('DELETE FROM submissions WHERE id=$1',[id]);await db.query("DELETE FROM programs p WHERE org_id=$1 AND id='neon-smoke-program' AND NOT EXISTS(SELECT 1 FROM submission_programs r WHERE r.org_id=p.org_id AND r.program_id=p.id)",[org]);await db.end();console.log('Synthetic smoke submission removed.');}
