import { readFile } from 'node:fs/promises';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Intake from './intake.jsx';

export default async function Page({ params, searchParams }) {
  const { legacy = [] } = await params;
  const key = legacy.join('/');
  if (!key) redirect('/dashboard/?entry=team');
  if (key === 'dashboard' || key === 'dashboard/index.html') {
    const source = await readFile('dashboard/index.html', 'utf8');
    const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
    return <><style>{css}</style><main className="dashboard-layout choosing-account">
      <div className="workspace-content">
        <section className="dashboard-heading"><div className="shell"><h1>Sign in</h1></div></section>
        <div className="shell dashboard-content"><section id="signin" aria-labelledby="signin-heading">
          <div className="view-heading"><div><span className="account-label">Sign in</span>
            <h2 id="signin-heading">Choose an account</h2><p>Continue to your dashboard.</p></div></div>
          <div className="signin-grid">
            {[
              ['org-1', 'Org 1', '01', ''],
              ['org-2', 'Org 2', '02', 'org-two'],
              ['tpw', 'TPW View', 'TPW', 'tpw-icon']
            ].map(([id, label, badge, style]) => <Link key={id} className="signin-option" href={`/team-dashboard/#${id}`}>
              <span className={`option-icon ${style}`} aria-hidden="true">{badge}</span><span>{label}</span>
            </Link>)}
          </div>
        </section></div>
      </div>
    </main></>;
  }
  if (key === 'intake/simple.html') {
    const query = await searchParams;
    const account = ['org-1', 'org-2', 'tpw'].includes(query.account) ? query.account : 'org-1';
    const source = await readFile('team-form/index.html', 'utf8');
    const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
    const picker = source.match(/<select[^>]*id="facility"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
    const facilities = [...picker.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(([, code, name]) => ({ code, name }));
    return <Intake key={account + String(query.blank)} facilities={facilities} account={account} blank={query.blank === '1'} css={styles.replaceAll('../assets/', '/assets/') + `
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
