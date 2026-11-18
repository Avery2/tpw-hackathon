import { randomUUID } from 'node:crypto';
import { getAuth, getInviteSignupAuth } from '../../../lib/server/auth.js';
import { database } from '../../../lib/server/db.js';
import { reportingAccess } from '../../../lib/server/reporting-access.js';

const reply = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request) {
  const access = await reportingAccess(request.headers, new URL(request.url).searchParams.get('org'));
  if (!access.canManageMembers) return reply({ error: 'Organization admin access required.' }, access.status || 403);
  const { rows } = await database().query(
    `SELECT id, email, "expiresAt" FROM invitation WHERE "organizationId" = $1 AND status = 'pending'
     AND "expiresAt" > now() ORDER BY "createdAt" DESC`, [access.authOrgId]
  );
  return reply({ invitations: rows });
}

export async function POST(request) {
  const auth = getAuth();
  if (!auth) return reply({ error: 'Invitations are unavailable.' }, 503);
  if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL).origin) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }
  const body = await request.json().catch(() => null);
  const db = database();
  if (body?.action === 'register') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (typeof body.id !== 'string' || body.id.length > 64 || !name || name.length > 120 ||
        email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return reply({ error: 'Enter your name, invited email, and a password of 8–128 characters.' }, 400);
    }
    const { rows: [invitation] } = await db.query(
      `SELECT i.email FROM invitation i
       JOIN reporting_auth_organizations link ON link.auth_org_id = i."organizationId"
       WHERE i.id = $1 AND i.status = 'pending' AND i."expiresAt" > now() AND i.role IN ('member', 'admin')`,
      [body.id]
    );
    if (!invitation) return reply({ error: 'This invitation is no longer available. Ask your admin for a new link.' }, 409);
    if (invitation.email.toLowerCase() !== email) return reply({ error: 'Use the email address your admin invited.' }, 403);

    if ((await db.query('SELECT 1 FROM "user" WHERE lower(email) = $1', [email])).rowCount) {
      return reply({ error: 'An account already exists for this email. Log in to accept the invitation.' }, 409);
    }
    try {
      await getInviteSignupAuth().api.signUpEmail({ body: { name, email, password } });
      return reply({ ok: true }, 201);
    } catch (error) {
      if (error.body?.code === 'USER_ALREADY_EXISTS' || error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        return reply({ error: 'An account already exists for this email. Log in to accept the invitation.' }, 409);
      }
      console.error('Invite account creation failed:', error.code || error.name);
      return reply({ error: 'Could not create your account. Try again.' }, 503);
    }
  }
  if (body?.action === 'accept') {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return reply({ error: 'Sign in first.' }, 401);
    if (typeof body.id !== 'string') return reply({ error: 'Invalid invitation.' }, 400);
    const { rows } = await db.query(
      `WITH claimed AS (
         UPDATE invitation i SET status = 'accepted'
         FROM reporting_auth_organizations link
         WHERE i.id = $1 AND lower(i.email) = lower($2) AND i.status = 'pending'
           AND i."expiresAt" > now() AND i.role IN ('member', 'admin') AND i."organizationId" = link.auth_org_id
         RETURNING i."organizationId", i.role, link.reporting_org_id
       ), joined AS (
         INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
         SELECT $3, "organizationId", $4, role, now() FROM claimed
         ON CONFLICT ("organizationId", "userId") DO NOTHING
       )
       SELECT reporting_org_id AS "orgId" FROM claimed`,
      [body.id, session.user.email, randomUUID(), session.user.id]
    );
    return rows.length ? reply(rows[0]) : reply({ error: 'This invitation is expired, revoked, already used, or for a different email.' }, 409);
  }
  const access = await reportingAccess(request.headers, new URL(request.url).searchParams.get('org'));
  if (!access.canManageMembers) return reply({ error: 'Organization admin access required.' }, access.status || 403);
  if (body?.action === 'revoke' && typeof body.id === 'string') {
    const result = await db.query(
      `UPDATE invitation SET status = 'canceled' WHERE id = $1 AND "organizationId" = $2 AND status = 'pending'`,
      [body.id, access.authOrgId]
    );
    return result.rowCount ? reply({ ok: true }) : reply({ error: 'Pending invitation could not be found.' }, 404);
  }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (body?.action !== 'create' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply({ error: 'Enter a valid email address.' }, 400);
  }
  const { rows } = await db.query(
    `INSERT INTO invitation (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId")
     SELECT $1, m."organizationId", $2, 'member', 'pending', now() + interval '7 days', now(), m."userId"
     FROM member m WHERE m.id = $3 AND m.role IN ('admin', 'owner')
     RETURNING id, email, "expiresAt"`,
    [randomUUID(), email, access.memberId]
  );
  return rows.length ? reply(rows[0], 201) : reply({ error: 'Organization admin access required.' }, 403);
}
