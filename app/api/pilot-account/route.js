import { reportingAccess } from '../../../server/reporting-access.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const access = await reportingAccess(request.headers);
  if (access.demo) return Response.json({ error: 'Authentication is not configured.' }, { status: 503, headers });
  if (access.status) return Response.json({ error: access.error }, { status: access.status, headers });
  return Response.json({ orgId: access.orgId, staff: Boolean(access.staff), canSubmit: access.canSubmit, canManageMembers: access.canManageMembers }, { headers });
}
