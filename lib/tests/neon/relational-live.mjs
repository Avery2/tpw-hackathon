// Uses a transaction and rolls it back: no fixtures remain after testing.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function verifyRelationalSchema(db) {
const id=`schema-test-${randomUUID()}`;
const doc={organization:'Synthetic relational test',orgId:id,reportingPeriod:{year:2026,quarter:4},submittedAt:'2026-11-04T12:00:00Z',prisons:[{code:'schema-test-a',name:'Synthetic A',yards:['North','South']},{code:'schema-test-b',name:'Synthetic B',yards:['North']}],programs:[{id:'program-a',name:'Shared program',status:'Completed',startDate:'2026-10-01',endDate:'2026-10-31',courseHours:104,participants:20,participantsCompleted:15,assignments:[{code:'schema-test-a',yards:['North','South']},{code:'schema-test-b',yards:['North']}]}]};
try{
 await db.query('SAVEPOINT relational_fixture');await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id,doc.organization]);
 await db.query('INSERT INTO submissions(id,org_id,document) VALUES($1,$1,$2)',[id,doc]);await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
 let totals=(await db.query('SELECT * FROM submission_report_totals WHERE submission_id=$1',[id])).rows[0];
 assert.equal(totals.programs,1);assert.equal(totals.participants,20);assert.equal(totals.participants_completed,15);assert.equal(Number(totals.participant_hours_delivered),1560);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM submission_program_locations WHERE submission_id=$1',[id])).rows[0].n,3);
 const roundtrip=(await db.query('SELECT document FROM submission_read_models WHERE id=$1',[id])).rows[0].document;
 assert.deepEqual(roundtrip.programs,doc.programs);assert.deepEqual(roundtrip.prisons,doc.prisons);
 // Current program edits cannot rewrite earlier quarterly names.
 await db.query('UPDATE programs SET name=$2 WHERE org_id=$1',[id,'New current name']);
 assert.equal((await db.query('SELECT name FROM submission_programs WHERE submission_id=$1',[id])).rows[0].name,'Shared program');
 // Retrying the snapshot replaces rows rather than multiplying facts.
 await db.query('UPDATE submissions SET document=$2 WHERE id=$1',[id,doc]);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM program_metric_groups WHERE submission_id=$1',[id])).rows[0].n,1);
 // Future per-yard mode: each yard gets its own distinct metrics group.
 const locations=(await db.query('SELECT yard_id FROM submission_program_locations WHERE submission_id=$1 ORDER BY yard_id',[id])).rows;
 for(let index=0;index<locations.length;index++){
  await db.query(`INSERT INTO program_metric_groups VALUES($1,'program-a',$2,'location','Completed',NULL,NULL,$3,$4,$5)`,[id,`yard-${index}`,52*(index+1),10+index,8+index]);
  await db.query(`UPDATE submission_program_locations SET group_key=$2 WHERE submission_id=$1 AND yard_id=$3`,[id,`yard-${index}`,locations[index].yard_id]);
 }
 await db.query("DELETE FROM program_metric_groups WHERE submission_id=$1 AND group_key='shared'",[id]);await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 totals=(await db.query('SELECT * FROM submission_report_totals WHERE submission_id=$1',[id])).rows[0];
 assert.equal(totals.participants,33);assert.equal(totals.participants_completed,27);assert.equal(Number(totals.participant_hours_delivered),2912);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM submission_read_models WHERE id=$1',[id])).rows[0].n,0,'future per-location data must not be silently flattened into the shared UI');
 // Constraints reject double assignment of a location-scoped fact group.
 await db.query('SAVEPOINT invalid_scope');
 await assert.rejects(db.query('UPDATE submission_program_locations SET group_key=$2 WHERE submission_id=$1',[id,'yard-0']),error=>error.code==='23514');
 await db.query('ROLLBACK TO SAVEPOINT invalid_scope');
 await db.query('DELETE FROM submissions WHERE id=$1',[id]);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM submission_program_locations WHERE submission_id=$1',[id])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM program_metric_groups WHERE submission_id=$1',[id])).rows[0].n,0);
 console.log('PASS: shared figures counted once across 3 yards / 2 facilities; exact UI roundtrip; historical names preserved; retries stay singular; future per-location metrics aggregate correctly; unsafe flattening and invalid scopes blocked; complete report deletion cascades cleanly.');
}finally{await db.query('ROLLBACK TO SAVEPOINT relational_fixture');console.log('Relational test fixtures rolled back.');}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const db=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await db.connect();
 try{await db.query('BEGIN');await verifyRelationalSchema(db);}finally{await db.query('ROLLBACK');await db.end();}
}
