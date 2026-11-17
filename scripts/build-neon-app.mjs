import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const publicFiles = [
  'assets/fonts',
  'assets/img',
  'assets/account-drawer.css',
  'assets/dashboard-exports.css',
  'assets/dashboard-exports.js',
  'assets/member-session.js',
  'assets/neon-api.js',
  'assets/neon-auth-client.js',
  'assets/neon-config.js',
  'assets/site-shell.css',
  'assets/team-dashboard.css',
  'assets/workspace-log-data.css',
  'assets/workspace-signin.css',
  'dashboard/js/rolling-number.js',
  'team-dashboard/js/data.js',
  'team-dashboard/js/rac.js',
  'team-dashboard/js/rolling-number.js',
  'team-dashboard/loading.css',
  'team-dashboard/workspace.css',
];

const temp = await mkdtemp(path.join(tmpdir(), 'tpw-app-'));
try {
  for (const source of publicFiles) {
    const destination = path.join(temp, source);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true });
  }
  await cp('report', path.join(temp, 'report'), {
    recursive: true,
    filter: source => !path.extname(source) || path.extname(source) === '.pdf',
  });
  await rm('public', { recursive: true, force: true });
  await cp(temp, 'public', { recursive: true });
  console.log('Prepared Next.js public assets.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
