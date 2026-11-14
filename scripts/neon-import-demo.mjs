// Read the existing public demo project once; never writes to the old backend.
import pg from 'pg';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const oldProject='https://firestore.googleapis.com/v1/projects/tpw-hackathon/databases/(default)/documents';
const decode=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'booleanValue'in v?v.booleanValue:'timestampValue'in v?v.timestampValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null;
async function collection(name){
  const result=[];let token;
  do{const url=new URL(`${oldProject}/${name}`);url.searchParams.set('pageSize','1000');if(token)url.searchParams.set('pageToken',token);
    const response=await fetch(url);if(!response.ok)throw new Error(`Old demo export failed: HTTP ${response.status}`);
    const body=await response.json();for(const doc of body.documents||[])result.push({id:doc.name.split('/').pop(),...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]))});token=body.nextPageToken;
  }while(token);return result;
}
let snapshot;
try{snapshot=JSON.parse(await readFile('work/neon-demo-export.json','utf8'));}catch{
 const [orgs,submissions]=await Promise.all([collection('orgs'),collection('submissions')]);
 // Import only the demonstration organizations we created; never real org records.
 const demo=orgs.filter(o=>o.name && (o.id==='org-1'||o.id==='org-2'||o.synthetic===true));
 const ids=new Set(demo.map(o=>o.id));
 snapshot={orgs:demo,submissions:submissions.filter(d=>ids.has(d.orgId)||demo.some(o=>o.name===d.organization && !d.orgId))};
 await mkdir('work',{recursive:true});await writeFile('work/neon-demo-export.json',JSON.stringify(snapshot));
}
const client=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await client.connect();
try{
 await client.query('BEGIN');
 for(const org of snapshot.orgs){const {id,name,...profile}=org;await client.query('INSERT INTO organizations(id,name,profile) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[id,name,{...profile,synthetic:true}]);}
 let inserted=0;
 for(const record of snapshot.submissions){const {id,...document}=record;const orgId=document.orgId||snapshot.orgs.find(o=>o.name===document.organization)?.id;if(!orgId)continue;
 const result=await client.query('INSERT INTO submissions(id,org_id,document,received_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[id,orgId,{...document,orgId,synthetic:true},document.receivedAt||document.submittedAt||new Date().toISOString()]);inserted+=result.rowCount;
 }
 await client.query('COMMIT');console.log(`Imported demo data: ${snapshot.orgs.length} organization profiles, ${inserted} new submissions (${snapshot.submissions.length} exported). Existing IDs preserved.`);
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
