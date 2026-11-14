import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const connectionString=process.env.DATABASE_URL_UNPOOLED;
if(!connectionString)throw new Error('Set DATABASE_URL_UNPOOLED for migrations.');
const client=new pg.Client({connectionString});await client.connect();
const dryRun=process.argv.includes('--dry-run');
try{
 await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('tpw-schema-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 const applied=new Map((await client.query('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));
 for(const name of (await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort()){
  const sql=await readFile(`db/migrations/${name}`,'utf8');const checksum=createHash('sha256').update(sql).digest('hex');
  if(applied.has(name)){if(applied.get(name)!==checksum)throw new Error(`Applied migration changed: ${name}`);continue;}
  await client.query(sql);await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);console.log(`${dryRun?'Rehearsed':'Applied'} ${name}`);
 }
 if(dryRun){const {verifyRelationalSchema}=await import('../test/neon/relational-live.mjs');await verifyRelationalSchema(client);}
 await client.query('SET CONSTRAINTS ALL IMMEDIATE');
 const mismatches=await client.query(`SELECT count(*)::integer AS count FROM submissions s LEFT JOIN submission_read_models r USING(id) WHERE r.id IS NULL OR (s.document->'programs') IS DISTINCT FROM (r.document->'programs') OR (s.document->'prisons') IS DISTINCT FROM (r.document->'prisons')`);
 if(mismatches.rows[0].count)throw new Error(`Historical document mismatch: ${mismatches.rows[0].count}`);
 console.log('Reconciliation passed: all program figures and facility snapshots unchanged.');
 await client.query(dryRun?'ROLLBACK':'COMMIT');console.log(dryRun?'Dry run passed; rolled back.':'Migrations committed.');
}catch(error){await client.query('ROLLBACK');console.error(error.message);process.exitCode=1;}finally{await client.end();}
