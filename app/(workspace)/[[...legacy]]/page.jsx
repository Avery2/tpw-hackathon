import { readFile } from 'node:fs/promises';
import { headers } from 'next/headers';
import { reportingAccess } from '../../../server/reporting-access.js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Intake from './intake.jsx';
import Login from './login.jsx';
import DevelopmentPicker from './development-picker.jsx';
import { developmentLoginEnabled } from '../../../server/development-login.js';

export default async function Page({ params, searchParams }) {
  const { legacy = [] } = await params;
  const key = legacy.join('/');
  if (!key) redirect('/dashboard/?entry=team');
  if (key === 'dashboard' || key === 'dashboard/index.html' || key === 'accept-invite') {
    const invitePage = key === 'accept-invite';
    const authConfigured = Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.DATABASE_URL);
    const oneClick = authConfigured && developmentLoginEnabled();
    const showDevelopmentPicker = !invitePage && (oneClick || !authConfigured);
    const { id } = invitePage ? await searchParams : {};
    if (invitePage && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) notFound();
    const source = await readFile('dashboard/index.html', 'utf8');
    const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
    return <><style>{css + `
      .dashboard-login { width: min(100%, 480px); margin: 0 auto 24px; padding: 24px; border: 1px solid #dce3da; border-radius: 16px; background: #fff; }
      .dashboard-login h2 { margin: 0 0 16px; }
      .dashboard-login form, .dashboard-login label { display: grid; gap: 8px; }
      .dashboard-login form { gap: 16px; }
      .dashboard-login label { font-weight: 700; }
      .dashboard-login input { min-width: 0; padding: 10px 12px; border: 1px solid #aaa; border-radius: 8px; font: inherit; font-weight: 400; }
      .dashboard-login button { justify-self: start; border: 0; border-radius: 999px; padding: 10px 22px; background: #111; color: #fff; font: inherit; font-weight: 700; }
      .dashboard-login button:disabled { opacity: .5; }
      .dashboard-login p { margin: 0; }
      .dashboard-login [role="status"]:empty { display: none; }
    `}</style><main className="dashboard-layout choosing-account">
      <div className="workspace-content">
        <section className="dashboard-heading"><div className="shell"><h1>Sign in</h1></div></section>
        <div className="shell dashboard-content">
          <Login inviteId={invitePage ? id : undefined} configured={authConfigured} />
          {showDevelopmentPicker && <section id="signin" aria-labelledby="signin-heading">
          <div className="view-heading"><h2 id="signin-heading">Development Picker</h2></div>
          {oneClick ? <DevelopmentPicker /> : <div className="signin-grid">
            {[
              ['org-1', 'Org 1', '01', ''],
              ['org-2', 'Org 2', '02', 'org-two'],
              ['tpw', 'TPW View', 'TPW', 'tpw-icon']
            ].map(([id, label, badge, style]) => <Link key={id} className="signin-option" href={`/team-dashboard/#${id}`}>
              <span className={`option-icon ${style}`} aria-hidden="true">{badge}</span><span>{label}</span>
            </Link>)}
          </div>}
        </section>}</div>
      </div>
    </main></>;
  }
  if (key === 'intake/simple.html') {
    const query = await searchParams;
    const access = await reportingAccess(await headers(), typeof query.account === 'string' ? query.account : null);
    const account = access.demo
      ? (['org-1', 'org-2', 'tpw'].includes(query.account) ? query.account : 'org-1')
      : access.orgId;
    if (!access.demo && (access.status || !access.canSubmit)) {
      return <main className="tpw-workspace"><div className="tpw-workspace-content">
        <h1 className="tpw-page-title">Log data</h1>
        <section className="log-data-access" aria-labelledby="log-data-access-heading">
        <h2 id="log-data-access-heading">{access.status === 401 ? 'Sign in to log data' : access.status ? 'Organization access required' : 'Submission access required'}</h2>
        <p>{access.status === 401 ? 'Sign in to access your organization’s reporting form.'
          : access.status ? 'Your account does not have access to this organization. Contact your organization admin for help.'
          : 'Ask your organization admin to grant you permission to submit reports.'}</p>
        {access.status === 401 && <Link href="/dashboard/?entry=team">Sign in</Link>}
        </section>
        <style>{`
          .log-data-access {
            max-width: 640px;
            margin: 24px auto 0;
            padding: clamp(24px, 5vw, 48px);
            border: 1px solid #d4e2d6;
            border-radius: 16px;
            background: #edf6ef;
            text-align: center;
            font-family: var(--tpw-text);
          }
          .log-data-access h2 { margin: 0 0 8px; font-size: 1.65rem; line-height: 1.2; }
          .log-data-access p { margin: 0; color: #344a39; font-size: 1.125rem; }
          .log-data-access a { display: inline-block; margin-top: 16px; font-weight: 700; }
        `}</style>
      </div></main>;
    }
    const source = await readFile('team-form/index.html', 'utf8');
    const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
    const picker = source.match(/<select[^>]*id="facility"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
    const facilities = [...picker.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(([, code, name]) => ({ code, name }));
    return <Intake organizationName={access.orgName} allowHashAccount={access.demo} key={account + String(query.blank)} facilities={facilities} account={account} blank={query.blank === '1'} css={styles.replaceAll('../assets/', '/assets/') + `
      .quarter-preview { padding-top: 8px; }
      .quarter-preview .prefill-loading { justify-items: center; text-align: center; padding-block: 24px; }
      .quarter-preview .prefill-loading .continue-button { justify-self: center; }
      .quarter-preview #finish-form { display: inline-flex; align-items: center; gap: 8px; }
      .quarter-preview #finish-form:has(.submit-spinner) { opacity: 1; cursor: progress; }
      .quarter-preview .submit-spinner {
        width: 1em;
        height: 1em;
        border: 2px solid #ffffff60;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: tpw-submit-spin .75s linear infinite;
      }
      @keyframes tpw-submit-spin { to { transform: rotate(1turn); } }
      @media (prefers-reduced-motion: reduce) {
        .quarter-preview .submit-spinner { animation: none; }
      }
      .quarter-preview .prefill-loading a { font-weight: 700; }
      .quarter-preview #submission-result .start-over { justify-self: center; }
      .quarter-preview #submission-result .report-grid { align-items: stretch; grid-auto-rows: auto auto 1fr; row-gap: 0; }
      .quarter-preview #submission-result .report-prison {
        display: grid;
        grid-row: span 3;
        grid-template-rows: subgrid;
        row-gap: 0;
        margin-bottom: 24px;
      }
      .quarter-preview #submission-result .report-card-header {
        display: grid;
        grid-template-rows: auto 1fr auto;
        justify-items: start;
      }
      .quarter-preview #submission-result .report-card-body { align-content: start; }
      @media (max-width: 560px) {
        .quarter-preview #submission-result .report-grid { grid-auto-rows: auto; row-gap: 24px; }
        .quarter-preview #submission-result .report-prison { display: block; grid-row: auto; margin-bottom: 0; }
      }
      .quarter-preview :is(.program-review, .program-delete) { align-self: center; padding: 6px 14px; font-size: 14px; }
      .quarter-preview .program-review { inline-size: 4.5rem; padding-inline: 8px; box-sizing: border-box; }
      .quarter-preview .program-edit { background: #edf6ef; color: #000; box-shadow: inset 0 0 0 1px var(--sage); }
      .quarter-preview .program-edit:hover { background: #e3f0e6; }
      .quarter-preview .program-delete { background: #b42318; }
      .quarter-preview .program-delete:hover { background: #912018; }
      .quarter-preview .program-error {
        background: #fef3f2;
        box-shadow: inset 0 0 0 1px #fda29b;
      }
      .quarter-preview .program-error { color: #912018; padding: 12px 16px; border-radius: 8px; font-weight: 700; }
      .quarter-preview .yard-number-row { position: relative; }
      .quarter-preview .yard-warning-icon {
        position: absolute;
        inset-block-start: 5px;
        inset-inline-end: 5px;
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #b42318;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      }
      .quarter-preview .yard-count-error { grid-column: 1 / -1; margin: 0; color: #912018; font-weight: 700; }
      .quarter-preview .field-label { font-weight: 700; font-size: 20px; }
      .quarter-preview .count-row .field-label { font-size: 16px; line-height: 1.25; }
      .tpw-site .tpw-workspace .quarter-preview .demo-form { max-width: none; padding: clamp(24px, 4vw, 48px); border: 1px solid #e4e4e4; }
      .tpw-site .tpw-workspace .quarter-preview .demo-form:has(#submission-result) { border-bottom: 0; }
      .quarter-preview .saved-program { background: white; border: 1px solid #d4e2d6; border-radius: 10px; padding: 16px; }
      .quarter-preview .react-yard-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; }
      .quarter-preview .facility-card { --prison: #24714b; --prison-bg: #e2f4e9; }
      .quarter-preview #organization-step .form-field label, .quarter-preview label[for="reporting-year"] { font-size: 13.5px; }
      .quarter-preview #organization, .quarter-preview #reporting-year { font-size: 17px; padding: 13px 14px; border-color: #d5d1c9; }
      .quarter-preview #organization { max-width: 640px; }
      .quarter-preview .program-sidebar { padding: 20px; }
      .quarter-preview #prison-summary > li { display: block; }
      .quarter-preview #facility-cards {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, max(240px, calc((100% - 24px) / 3))), 1fr));
        row-gap: 0;
      }
      .quarter-preview #facility-cards .facility-card {
        display: grid;
        grid-row: span 3;
        grid-template-rows: subgrid;
        row-gap: 0;
        margin-bottom: 12px;
      }
      .quarter-preview #facility-cards .yard-choices { align-content: start; margin-bottom: 0; }
      .quarter-preview #facility-cards .yard-add { margin: 14px 16px 16px; }
      .quarter-preview .form-step-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .quarter-preview #facilities-step .form-title { margin-bottom: 0; }
      .quarter-preview #facilities-step .form-hint { margin-block: -8px -14px; }
    `} />;
  }
  notFound();
}
