import { randomUUID } from 'node:crypto';
import { database } from '../../../lib/server/db.js';
import { reportingAccess } from '../../../lib/server/reporting-access.js';

const reply = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const access = await reportingAccess(request.headers);
  if (!access.staff) return reply({ error: 'TPW staff access required.' }, access.status || 403);
  if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL).origin) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || name.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply({ error: 'Enter an organization name and a valid admin email.' }, 400);
  }

  const reportingId = 'org-' + randomUUID();
  const authId = randomUUID();
  const invitationId = randomUUID();
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO organizations(id, name) VALUES ($1, $2)', [reportingId, name]);
    await client.query('INSERT INTO organization(id, name, slug, "createdAt") VALUES ($1, $2, $3, now())', [authId, name, reportingId]);
    await client.query('INSERT INTO reporting_auth_organizations(reporting_org_id, auth_org_id) VALUES ($1, $2)', [reportingId, authId]);
    await client.query(
      `INSERT INTO invitation (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId")
       VALUES ($1, $2, $3, 'admin', 'pending', now() + interval '7 days', now(), $4)`,
      [invitationId, authId, email, access.userId]
    );
    await client.query('COMMIT');
    return reply({ orgId: reportingId, invitationId }, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return reply({ error: 'An organization with that name already exists.' }, 409);
    console.error('Organization creation failed:', error.code || error.name);
    return reply({ error: 'Could not create this organization. Try again.' }, 503);
  } finally {
    client.release();
  }
}
