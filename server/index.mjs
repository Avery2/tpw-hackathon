import { createDatabase, createQuery } from './db.mjs';
import { createDemoServer } from './app.mjs';

// Startup does not query the database. Only an explicit API request does.
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required.');
  const db = createDatabase(createQuery(process.env));
  const server = createDemoServer({ db });
  server.on('error', () => { console.error('Could not start the local demo on 127.0.0.1:8830.'); process.exitCode = 1; });
  server.listen(8830, '127.0.0.1', () => console.log('LOCAL synthetic demo: http://127.0.0.1:8830 (not authentication; never use real participant data)'));
} catch {
  console.error('Local demo not started. Require Node 22+, TPW_DEMO_SERVER=1, a private DATABASE_URL with TLS, and an exactly matching NEON_EXPECTED_HOST. See server/README.md.');
  process.exitCode = 1;
}
