import { reportingAccess } from '../../../lib/server/reporting-access.js';
import { database } from '../../../lib/server/db.js';

export const runtime = 'nodejs';

const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function dispatch(request) {
  const access = await reportingAccess(request.headers, new URL(request.url).searchParams.get('org'));
  if (!access.canManageMembers) {
    return reply({ error: access.error || 'Only organization admins can manage members.' }, access.status || 403);
  }

  const db = database();
  if (request.method === 'GET') {
    const { rows } = await db.query(
      `SELECT m.id, u.name, u.email, m.role, m.can_submit_reports AS "canSubmit"
       FROM member m JOIN "user" u ON u.id = m."userId"
       WHERE m."organizationId" = $1 ORDER BY u.name, u.email`,
      [access.authOrgId]
    );
    return reply({ members: rows });
  }

  if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL).origin) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== 'string' || (request.method === 'PATCH' && typeof body.canSubmit !== 'boolean')) {
    return reply({ error: 'Invalid member change.' }, 400);
  }

  const target = `id = $1 AND "organizationId" = $2 AND role = 'member'
    AND EXISTS (SELECT 1 FROM member admin WHERE admin.id = $3 AND admin."organizationId" = $2 AND admin.role IN ('admin', 'owner'))`;
  const params = [body.id, access.authOrgId, access.memberId];
  const result = request.method === 'DELETE'
    ? await db.query(`DELETE FROM member WHERE ${target}`, params)
    : await db.query(`UPDATE member SET can_submit_reports = $4 WHERE ${target}`, [...params, body.canSubmit]);
  if (!result.rowCount) return reply({ error: 'That member could not be changed.' }, 404);
  return reply({ ok: true });
}

export { dispatch as GET, dispatch as PATCH, dispatch as DELETE };
