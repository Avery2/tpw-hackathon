import { database } from '../../../server/db.js';
import { reportingAccess } from '../../../server/reporting-access.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const access = await reportingAccess(request.headers, new URL(request.url).searchParams.get('org'));
  if (access.demo) return Response.json({ error: 'Authentication is not configured.' }, { status: 503, headers });
  if (access.status) return Response.json({ error: access.error }, { status: access.status, headers });
  const { rows: organizations } = access.staff ? { rows: [] } : await database().query(
    `SELECT org.id, org.name FROM member m
     JOIN reporting_auth_organizations link ON link.auth_org_id = m."organizationId"
     JOIN organizations org ON org.id = link.reporting_org_id
     WHERE m."userId" = $1 ORDER BY org.name, org.id`,
    [access.userId]
  );
  return Response.json({ organizations, orgId: access.orgId, staff: Boolean(access.staff), canSubmit: access.canSubmit, canManageMembers: access.canManageMembers }, { headers });
}
