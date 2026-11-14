import { demoApi } from './neon-api.js';
import { mountDashboardExports } from './dashboard-exports.js?v=reporting-1';

let revision = 0;

export async function loadDashboard(orgId) {
  const request = ++revision;
  if (typeof document !== 'undefined') document.querySelector('#dashboard-exports')?.remove();
  const query = orgId ? '?' + new URLSearchParams({ org: orgId }) : '';
  const data = await demoApi('dashboard' + query);
  if (request === revision) mountDashboardExports(data, orgId);
  return data;
}
