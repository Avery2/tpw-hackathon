// Explicit operator-only commands. Never imported by the website; needs Neon CLI.
// Hard pinned to the isolated sandbox. Passwords stay in child environment only.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { databaseEnvironment, literal } from '../server/db.mjs';
const args = process.argv.slice(2);
let sql;
if (args.length === 1 && args[0] === '--apply') {
  // Applying migrations never opts into public access. Existing explicit gate
  // state survives reruns; a fresh installation remains disabled.
  sql = ['001_data_api.sql', '002_public_sandbox.sql'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
} else if (args.length === 1 && args[0] === '--apply-sandbox') {
  // Only 002, with enabling in the SAME transaction as its installation. The
  // exact project/branch CLI selection and exact host check below are mandatory.
  sql = readFileSync(new URL('./002_public_sandbox.sql', import.meta.url), 'utf8')
    .replace(/COMMIT;\s*$/, 'UPDATE tpw_private.sandbox_settings SET enabled = true WHERE singleton;\nCOMMIT;\n');
} else if (args.length === 1 && args[0] === '--disable-sandbox') {
  // Emergency switch only: never deletes answers or durable retry receipts.
  sql = 'BEGIN; UPDATE tpw_private.sandbox_settings SET enabled = false WHERE singleton; COMMIT;';
} else if (args.length === 1 && args[0] === '--test-fixtures') {
  const users = JSON.parse(readFileSync(new URL('../work/neon-data-api/identities.json', import.meta.url), 'utf8'));
  sql = 'BEGIN;\n' + ['member-a', 'member-b', 'staff'].map((label, i) => {
    const id = users[label]?.id;
    if (typeof id !== 'string' || !id) throw Error('Missing synthetic identity fixture.');
    const target = label === 'staff' ? 'tpw_private.staff_users(user_id)' : 'tpw_private.memberships(user_id,org_id)';
    const values = label === 'staff' ? 'id' : `id, ${literal('org-' + (i + 1))}`;
    return `INSERT INTO ${target} SELECT ${values} FROM neon_auth."user" WHERE id=${literal(id)} AND email LIKE ${literal('tpw-api-' + label + '-%@example.invalid')} ON CONFLICT DO NOTHING;`;
  }).join('\n') + '\nCOMMIT;';
} else if (args[0] === '--grant-user' && typeof args[1] === 'string' && ((args.length === 4 && args[2] === '--org') || (args.length === 3 && args[2] === '--staff'))) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(args[1])) throw Error('Use the verified Auth user ID, not an email, URL or SQL expression.');
  const user = literal(args[1]);
  // The operator checks the verified Auth user ID; email never grants a privilege.
  sql = `BEGIN; DO $check$ BEGIN IF NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=${user}) THEN RAISE EXCEPTION 'Auth user ID does not exist on this branch'; END IF; END $check$;\n`;
  sql += args[2] === '--staff'
    ? `INSERT INTO tpw_private.staff_users(user_id) VALUES (${user}) ON CONFLICT DO NOTHING;`
    : `INSERT INTO tpw_private.memberships(user_id,org_id) VALUES (${user},${literal(args[3])}) ON CONFLICT DO NOTHING;`;
  sql += '\nCOMMIT;';
} else {
  console.error('Usage: node database/admin.mjs --apply | --apply-sandbox | --disable-sandbox | --test-fixtures | --grant-user VERIFIED_AUTH_USER_ID --org ORG_ID | --grant-user VERIFIED_AUTH_USER_ID --staff');
  process.exit(1);
}
try {
  const DATABASE_URL = execFileSync('neon', ['connection-string', 'avery-neon-connection', '--project-id', 'twilight-bread-18135398', '--database-name', 'neondb', '--role-name', 'neondb_owner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const env = databaseEnvironment({ ...process.env, DATABASE_URL, TPW_DEMO_SERVER: '1', NEON_EXPECTED_HOST: 'ep-restless-surf-arinnqli.c-4.us-west-2.aws.neon.tech' });
  const result = spawnSync('psql', ['-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { env, input: sql, encoding: 'utf8', timeout: 90000 });
  if (result.error || result.status !== 0) throw Error('Database command failed; no credentials printed.');
  if (['--apply', '--apply-sandbox'].includes(args[0])) {
    // Persist the managed service's schema snapshot, not just a running
    // PostgREST instance's NOTIFY cache (which may vanish after scale-to-zero).
    execFileSync('neon', ['data-api', 'refresh-schema', '--project-id', 'twilight-bread-18135398', '--branch', 'avery-neon-connection', '--database', 'neondb'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  }
  console.log('Sandbox command completed on avery-neon-connection only.');
} catch { console.error('Sandbox command failed. Check CLI access, confirmed user/organization IDs, and migration prerequisites. No credentials printed.'); process.exitCode = 1; }
