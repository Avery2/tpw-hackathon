import { readFile } from 'node:fs/promises';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Intake from './intake.jsx';
import LegacyView from './view.jsx';

const sources = {
  'dashboard/checkin.html': 'dashboard/checkin.html',
  'dashboard/programs.html': 'dashboard/programs.html',
  'dashboard/organizations.html': 'dashboard/organizations.html',
  'dashboard/submissions.html': 'dashboard/submissions.html',
  'dashboard/submission-data.html': 'dashboard/submission-data.html',
  'team-form': 'team-form/index.html',
  'form-demo': 'form-demo/index.html'
};

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
      .tpw-site .tpw-workspace .quarter-preview .demo-form { max-width: none; padding: clamp(24px, 4vw, 48px); border: 1px solid #e4e4e4; }
      .quarter-preview .saved-program { background: white; border: 1px solid #d4e2d6; border-radius: 10px; padding: 16px; }
      .quarter-preview .react-yard-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; }
      .quarter-preview .facility-card { --prison: #24714b; --prison-bg: #e2f4e9; }
      .quarter-preview #organization-step .form-field label, .quarter-preview label[for="reporting-year"] { font-size: 13.5px; }
      .quarter-preview #organization, .quarter-preview #reporting-year { font-size: 17px; padding: 13px 14px; border-color: #d5d1c9; }
      .quarter-preview #organization { max-width: 640px; }
      .quarter-preview .program-sidebar { padding: 20px; }
      .quarter-preview #prison-summary > li { display: block; }
      .quarter-preview #facilities-step .form-title { margin-bottom: 0; }
      .quarter-preview #facilities-step .form-hint { margin-block: -8px -14px; }
    `} />;
  }
  if (!Object.hasOwn(sources, key)) notFound();
  const source = await readFile(/* turbopackIgnore: true */ sources[key], 'utf8');
  const css = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
  return <LegacyView key={key} route={key} css={css} html={body} />;
}
