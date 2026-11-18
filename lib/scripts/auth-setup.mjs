import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import pg from 'pg';

const {
  DATABASE_URL_UNPOOLED: connectionString,
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: baseURL,
  TPW_BOOTSTRAP_STAFF_EMAIL: staffEmail,
  TPW_BOOTSTRAP_STAFF_PASSWORD: staffPassword,
} = process.env;

if (!connectionString || !secret || !baseURL) {
  throw new Error('Set DATABASE_URL_UNPOOLED, BETTER_AUTH_SECRET, and BETTER_AUTH_URL for the target database.');
}
if (Boolean(staffEmail) !== Boolean(staffPassword) || (staffPassword && staffPassword.length < 8)) {
  throw new Error('To bootstrap staff, provide both staff variables and a password of at least eight characters.');
}

const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10000 });
try {
  const auth = betterAuth({
    database: pool,
    secret,
    baseURL,
    emailAndPassword: { enabled: true, autoSignIn: false },
    plugins: [organization({ allowUserToCreateOrganization: false })],
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('tpw-auth-setup'))");
    if (!(await client.query("SELECT to_regclass('public.organizations') AS name")).rows[0].name) {
      throw new Error('Run the reporting migrations on this database first.');
    }
    await (await auth.$context).runMigrations();
    await client.query('BEGIN');
    try {
      const files = (await readdir('db/auth')).filter(name => name.endsWith('.sql')).sort();
      for (const file of files) {
        const name = 'auth/' + file;
        const sql = await readFile('db/auth/' + file, 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const { rows: [applied] } = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
        if (applied) {
          if (applied.checksum !== checksum) throw new Error('Applied migration changed: ' + name);
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
        console.log('Applied ' + name);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    if (staffEmail) {
      const email = staffEmail.trim().toLowerCase();
      const { rows: [existing] } = await client.query(
        'SELECT u.id, s.user_id IS NOT NULL AS staff FROM "user" u LEFT JOIN tpw_staff s ON s.user_id=u.id WHERE u.email=$1',
        [email]
      );
      if (existing && !existing.staff) throw new Error('Staff bootstrap email already belongs to a non-staff account.');
      if (!existing) {
        const { user } = await auth.api.signUpEmail({ body: { email, password: staffPassword, name: 'TPW Staff' } });
        await client.query('INSERT INTO tpw_staff(user_id) VALUES ($1)', [user.id]);
      }
      console.log('Staff bootstrap verified.');
    }
    console.log('Better Auth and reporting access schema are ready.');
  } finally {
    client.release(true);
  }
} finally {
  await pool.end();
}
