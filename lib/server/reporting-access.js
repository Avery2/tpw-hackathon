import { getAuth } from './auth.js';
import { database } from './db.js';

export async function reportingAccess(requestHeaders, orgId = null) {
  const auth = getAuth();
  if (!auth) return { demo: true };
  const session = await auth.api.getSession({ headers: new Headers(requestHeaders) });
  if (!session) return { status: 401, error: 'Sign in first.' };

  const staff = await database().query('SELECT 1 FROM tpw_staff WHERE user_id = $1', [session.user.id]);
  if (staff.rowCount) return { orgId: 'tpw', userId: session.user.id, staff: true, canSubmit: false, canManageMembers: false };

  const { rows: [membership] } = await database().query(
    `SELECT link.reporting_org_id AS "orgId", org.name AS "orgName", m.id AS "memberId", link.auth_org_id AS "authOrgId",
       (m.role IN ('admin', 'owner')) AS "canManageMembers",
       (m.role IN ('admin', 'owner') OR m.can_submit_reports) AS "canSubmit"
     FROM reporting_auth_organizations link
     JOIN organizations org ON org.id = link.reporting_org_id
     JOIN member m ON m."organizationId" = link.auth_org_id
     WHERE m."userId" = $1 AND ($2::text IS NULL OR link.reporting_org_id = $2) ORDER BY m."createdAt", m.id LIMIT 1`,
    [session.user.id, orgId]
  );
  return membership ? { ...membership, userId: session.user.id } : { status: 403, error: orgId ? 'You can only access organizations you belong to.' : 'Your account has no pilot organization.' };
}
