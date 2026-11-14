// Convenience launcher for the explicitly isolated development branch.
// Credentials stay in process memory, not files, arguments, logs or the static site.
import { execFileSync } from 'node:child_process';
try {
  process.env.DATABASE_URL = execFileSync('neon', [
    'connection-string', 'avery-neon-connection', '--project-id', 'twilight-bread-18135398',
    '--database-name', 'neondb', '--role-name', 'neondb_owner'
  ], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  process.env.NEON_EXPECTED_HOST = 'ep-restless-surf-arinnqli.c-4.us-west-2.aws.neon.tech';
  process.env.TPW_DEMO_SERVER = '1';
  await import('./index.mjs');
} catch {
  console.error('Could not load the isolated Neon demo connection. Check your Neon CLI sign-in and access to tpw-dev / avery-neon-connection. No credentials were printed.');
  process.exitCode = 1;
}
