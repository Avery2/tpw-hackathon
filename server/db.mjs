// LOCAL development bridge only. Never put a connection URL in process arguments.
import { spawn } from 'node:child_process';

export function databaseEnvironment(env = process.env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Set a valid DATABASE_URL privately before starting.'); }
  if (env.TPW_DEMO_SERVER !== '1') throw new Error('Local demo requires TPW_DEMO_SERVER=1.');
  if (!env.NEON_EXPECTED_HOST || url.hostname !== env.NEON_EXPECTED_HOST) throw new Error('DATABASE_URL hostname must exactly match NEON_EXPECTED_HOST.');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.pathname.slice(1) || url.hash) throw new Error('Invalid database configuration.');
  // Do not allow URL query parameters to override PGHOST, credentials or TLS.
  for (const key of url.searchParams.keys()) if (!['sslmode', 'channel_binding'].includes(key)) throw new Error('Unsupported database URL option.');
  // libpq can expand a dbname that looks like conninfo into connection options.
  // Restrict this demo's database name so it cannot override the confirmed host.
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('Use a simple database name, not connection options.');
  const tls = url.searchParams.get('sslmode') || 'require';
  if (!['require', 'verify-ca', 'verify-full'].includes(tls)) throw new Error('Database TLS must be require or stronger.');
  if (url.searchParams.has('channel_binding') && !['require', 'prefer', 'disable'].includes(url.searchParams.get('channel_binding'))) throw new Error('Invalid channel binding option.');
  return {
    PATH: env.PATH, LANG: 'C.UTF-8', PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database, PGSSLMODE: tls,
    PGCHANNELBINDING: url.searchParams.get('channel_binding') || 'prefer',
    PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8', PGPASSFILE: '/dev/null',
    PGOPTIONS: '-c statement_timeout=8000 -c lock_timeout=4000 -c standard_conforming_strings=on'
  };
}

// E literals explicitly escape both backslashes and quotes, independent of session defaults.
// Reject NUL (Postgres text cannot represent it). Identifiers never come from a request.
export function literal(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid SQL text.');
  return "E'" + value.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
}

export function createQuery(env, spawnProcess = spawn) {
  const childEnv = databaseEnvironment(env);
  return sql => new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Database unavailable.'));
    const child = spawnProcess('psql', ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], shell: false
    });
    let output = '', size = 0, failed = false;
    const timer = setTimeout(() => { failed = true; child.kill('SIGKILL'); fail(); }, 12000);
    child.on('error', () => { clearTimeout(timer); fail(); });
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {}); // never expose psql diagnostics, which may contain credentials/data
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) { failed = true; child.kill('SIGKILL'); }
      else output += chunk;
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || failed) return fail();
      try { resolve(JSON.parse(output.trim())); } catch { fail(); }
    });
    child.stdin.end('BEGIN;\nSET LOCAL standard_conforming_strings = on;\nSET LOCAL statement_timeout = 8000;\nSET LOCAL lock_timeout = 4000;\n' + sql + '\nCOMMIT;\n');
  });
}

export function createDatabase(query) {
  return {
    organizations: () => query(`SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'profile',profile) ORDER BY id),'[]'::jsonb) FROM public.organizations;`),
    records: orgIds => query(`SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'orgId',org_id,'document',document,'receivedAt',received_at) ORDER BY received_at,id),'[]'::jsonb) FROM public.submissions WHERE org_id IN (${orgIds.length ? orgIds.map(literal).join(',') : 'NULL'});`),
    save: (id, orgId, document, receivedAt) => query(`INSERT INTO public.submissions AS existing (id,org_id,document,received_at)
VALUES (${literal(id)},${literal(orgId)},${literal(JSON.stringify(document))}::jsonb,${literal(receivedAt)}::timestamptz)
ON CONFLICT (id) DO UPDATE SET id = existing.id
RETURNING jsonb_build_object('id',id,'orgId',org_id,'document',document,'receivedAt',received_at);`),
    health: () => query(`SELECT jsonb_build_object('organizations',(SELECT count(*) FROM public.organizations),'submissions',(SELECT count(*) FROM public.submissions));`)
  };
}
