import { reportingAccess } from './reporting-access.js';
import { organizationsPage, programsPage, submissionsPage, submissionTracking } from './registers.js';
import { loadTpwOverview } from './overview.js';
import { randomUUID } from 'node:crypto';
import { database } from './db.js';
import { InputError, validateSubmission } from './validation.js';
export async function handleApi(req, res) {
  res.setHeader('Cache-Control','no-store');
  const send = (status, body) => { res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body)); };
  if (process.env.DEMO_MODE !== 'true') return send(503,{error:'The demo API is disabled. Set DEMO_MODE=true for synthetic demo data.'});
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') {
      await database().query('SELECT 1'); return send(200,{ok:true,database:'postgres',demo:true});
    }
    const access = await reportingAccess(req.headers, url.searchParams.get('org'));
    if (access.status) return send(access.status, { error: access.error });
    if (!access.demo) {
      if (req.method === 'GET' && !access.staff) {
        if (!['/api/dashboard', '/api/programs', '/api/submissions'].includes(url.pathname)) {
          return send(403, { error: 'This view is unavailable to organization accounts.' });
        }
        if (url.searchParams.has('org') && url.searchParams.get('org') !== access.orgId) {
          return send(403, { error: 'You can only access your own organization.' });
        }
        const detail = url.searchParams.get('detail');
        if (detail && url.pathname === '/api/submissions') {
          let identity;
          try { identity = JSON.parse(detail); } catch { throw new InputError('Invalid submission reference.'); }
          if (!Array.isArray(identity) || identity[0] !== access.orgId) {
            return send(403, { error: 'You can only access your own organization.' });
          }
        }
        url.searchParams.set('org', access.orgId);
      }
      if (req.method === 'POST' && url.pathname === '/api/submissions' && !access.canSubmit) {
        return send(403, { error: 'Your account cannot submit reports.' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/overview') {
      return send(200, await loadTpwOverview(database()));
    }
    if (req.method === 'GET' && url.pathname === '/api/organizations') {
      return send(200, await organizationsPage(database(), url.searchParams));
    }
    if (req.method === 'GET' && url.pathname === '/api/programs') {
      return send(200, await programsPage(database(), url.searchParams));
    }
    if (req.method === 'GET' && url.pathname === '/api/submissions') {
      return send(200, await submissionsPage(database(), url.searchParams));
    }
    if (req.method === 'GET' && url.pathname === '/api/submission-tracking') {
      return send(200, await submissionTracking(database()));
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      const id=url.searchParams.get('org');
      const orgRows=await database().query('SELECT id,name,profile FROM organizations WHERE ($1::text IS NULL OR id=$1) ORDER BY name',[id]);
      const orgs=orgRows.rows.map(r=>({...r.profile,id:r.id,name:r.name}));
      if (id && !orgs.length) return send(404,{error:'Organization profile was not found.'});
      const unsupported=await database().query('SELECT 1 FROM submission_requires_location_ui x JOIN submissions s ON s.id=x.submission_id WHERE ($1::text IS NULL OR s.org_id=$1) LIMIT 1',[id]);
      if(unsupported.rowCount) return send(409,{error:'Location-specific reports need the future location-reporting interface. Shared figures have not been substituted.'});
      const rows=await database().query('SELECT id,org_id,document,received_at FROM submission_read_models WHERE ($1::text IS NULL OR org_id=$1) ORDER BY received_at,id',[id]);
      return send(200,{org:id?orgs[0]:null,orgs,submissions:rows.rows.map(r=>({...r.document,id:r.id,orgId:r.org_id,receivedAt:r.received_at}))});
    }
    if (req.method === 'POST' && url.pathname === '/api/submissions') {
      let payload;
      if (req.body && typeof req.body === 'object') payload=req.body;
      else {
        let raw='';for await (const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>1048576)return send(413,{error:'Submission is too large.'});}
        try {payload=JSON.parse(raw);}catch{return send(400,{error:'Invalid JSON.'});}
      }
      const {id,submission}=payload;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new InputError('Invalid submission ID.');
      const document=validateSubmission(submission);
      if (!access.demo && document.orgId !== access.orgId) {
        return send(403, { error: 'You can only submit for your own organization.' });
      }
      const client=await database().connect();
      try {
        await client.query('BEGIN');
        let org;
        if(document.orgId){
          org=(await client.query('SELECT id,name FROM organizations WHERE id=$1',[document.orgId])).rows[0];
          if(!org || org.name !== document.organization) throw new InputError('Organization does not match its profile.');
        } else {
          org=(await client.query(`INSERT INTO organizations(id,name,profile) VALUES($1,$2,$3) ON CONFLICT (lower(name)) DO UPDATE SET name=organizations.name RETURNING id,name`,[randomUUID(),document.organization,{synthetic:true}])).rows[0];
        }
        document.orgId=org.id;
        if (!access.demo) {
          await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [org.id]);
          const { quarter, year } = document.reportingPeriod;
          const { rows: existing } = await client.query(
            `SELECT id, org_id, document = $5::jsonb AS unchanged FROM submissions
             WHERE id=$1 OR (org_id=$2 AND reporting_year=$3 AND reporting_quarter=$4)`,
            [id, org.id, year, quarter, document]
          );
          if (existing.some(row => row.id === id && row.org_id === org.id && row.unchanged)) {
            await client.query('COMMIT');
            return send(200, { id });
          }
          if (existing.length) {
            await client.query('ROLLBACK');
            return send(409, { error: 'This report has already been submitted. Contact TPW to request a correction.' });
          }
          const inserted = await client.query(
            'INSERT INTO submissions(id,org_id,document) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
            [id, org.id, document]
          );
          await client.query('COMMIT');
          return inserted.rowCount ? send(200, { id }) : send(409, { error: 'This submission ID is already in use.' });
        }
        const previous=(await client.query('SELECT org_id FROM submissions WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if((await client.query('SELECT 1 FROM submission_requires_location_ui WHERE submission_id=$1',[id])).rowCount) throw new InputError('This report has location-specific figures and cannot be overwritten by the shared-count form.');
        if(previous && previous.org_id!==org.id) throw new InputError('This submission ID belongs to another organization.');
        await client.query(`INSERT INTO submissions(id,org_id,document) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document WHERE submissions.org_id=EXCLUDED.org_id`,[id,org.id,document]);
        await client.query('COMMIT');
        return send(200,{id});
      } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    }
    send(404,{error:'API route not found.'});
  } catch(error) {
    if(error instanceof InputError) return send(400,{error:error.message});
    console.error('API request failed:',error.code || error.name);
    send(503,{error:'Could not access the database. Please try again; your entries are still here.'});
  }
}
