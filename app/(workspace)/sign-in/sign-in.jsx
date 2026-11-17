import Link from 'next/link';
import { LuBuilding2, LuShield } from 'react-icons/lu';
import Login from './login.jsx';
import DevelopmentPicker from './development-picker.jsx';
import { developmentLoginEnabled } from '../../../server/development-login.js';

export default function SignIn({ id }) {
  const invitePage = Boolean(id);
  const authConfigured = Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.DATABASE_URL);
  const oneClick = authConfigured && developmentLoginEnabled();
  const showDevelopmentPicker = !invitePage && (oneClick || !authConfigured);
  return <><link rel="stylesheet" href="/assets/workspace-signin.css" /><main className="dashboard-layout choosing-account">
    <div className="workspace-content">
      <section className="dashboard-heading"><div className="shell"><h1>Sign in</h1></div></section>
      <div className="shell dashboard-content">
        <Login inviteId={invitePage ? id : undefined} configured={authConfigured} />
        {showDevelopmentPicker && <section id="signin" aria-labelledby="signin-heading">
        <div className="view-heading"><h2 id="signin-heading">Development Picker</h2></div>
        {oneClick ? <DevelopmentPicker /> : <div className="signin-grid">
          {[
            ['org-1', 'Org 1', LuBuilding2, ''],
            ['org-2', 'Org 2', LuBuilding2, 'org-two'],
            ['tpw', 'TPW View', LuShield, 'tpw-icon']
          ].map(([id, label, Icon, style]) => <Link key={id} className="signin-option" href={`/team-dashboard/#${id}`}>
            <span className={`option-icon ${style}`} aria-hidden="true"><Icon size={18} /></span><span>{label}</span>
          </Link>)}
        </div>}
      </section>}</div>
    </div>
  </main></>;
}
