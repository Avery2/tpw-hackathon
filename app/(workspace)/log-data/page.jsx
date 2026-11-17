import { facilities } from './facilities.js';
import { headers } from 'next/headers';
import { reportingAccess } from '../../../server/reporting-access.js';
import Link from 'next/link';
import Intake from './intake.jsx';

export default async function Page({ searchParams }) {
  const query = await searchParams;
  const access = await reportingAccess(await headers(), typeof query.account === 'string' ? query.account : null);
  const account = access.demo
    ? (['org-1', 'org-2', 'tpw'].includes(query.account) ? query.account : 'org-1')
    : access.orgId;
  if (!access.demo && (access.status || !access.canSubmit)) {
    return <><link rel="stylesheet" href="/assets/workspace-log-data.css" /><main className="tpw-workspace"><div className="tpw-workspace-content">
      <h1 className="tpw-page-title">Log data</h1>
      <section className="log-data-access" aria-labelledby="log-data-access-heading">
      <h2 id="log-data-access-heading">{access.status === 401 ? 'Sign in to log data' : access.status ? 'Organization access required' : 'Submission access required'}</h2>
      <p>{access.status === 401 ? 'Sign in to access your organization’s reporting form.'
        : access.status ? 'Your account does not have access to this organization. Contact your organization admin for help.'
        : 'Ask your organization admin to grant you permission to submit reports.'}</p>
      {access.status === 401 && <Link href="/sign-in/">Sign in</Link>}
      </section>
    </div></main></>;
  }
  return <><link rel="stylesheet" href="/assets/workspace-log-data.css" /><Intake organizationName={access.orgName} allowHashAccount={access.demo} key={account + String(query.blank)} facilities={facilities} account={account} blank={query.blank === '1'} /></>;
}
