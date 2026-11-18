'use client';

import Link from 'next/link';
import { LuArrowRight, LuExternalLink } from 'react-icons/lu';
import { useEffect, useState } from 'react';
import { authClient } from '../../../lib/server/auth-client.js';
import { useWorkspaceAccount } from './workspace.jsx';

// Content moved from TPW's Squarespace member portal, paraphrased, with the original links.
// Update it here when TPW posts something new; nothing here is generated from the database.
const initiatives = [
  {
    title: 'AB 581 (PATH Act)',
    body: 'AB 581, which TPW co-sponsored with GRIP Training Institute and Initiate Justice, was signed into law. It gives community-based program providers a standard process for being cleared into CDCR facilities. TPW tracks how the new process is working in practice.',
    links: [['AB 581 Clearance Reporting Form', 'https://forms.gle/6V48HgrJC8e3Xqja7']],
    note: 'Your organization’s clearance information is not shared with CDCR.'
  },
  {
    title: 'The 1% Campaign',
    body: 'A collective budget ask, not an individual one. TPW asks members to raise the coalition’s budget and policy priorities with legislators and staff, and to join the 1% meetings for lobbying and strategy.',
    links: []
  },
  {
    title: 'CRM report cards',
    body: 'TPW is working with CDCR headquarters on a feedback channel for Community Resource Managers, so members can report which ones help and which ones block access.',
    links: []
  }
];

const resources = [
  ['CARE Grant RFA 2025–2028', 'The California Reentry and Enrichment grant request for applications.', 'https://www.cdcr.ca.gov/rehabilitation/wp-content/uploads/sites/173/2024/11/CARE-RFA-2025-2028.pdf'],
  ['2024 San Quentin report', 'Recommendations for transforming San Quentin into a rehabilitation center.', 'https://www.cdcr.ca.gov/wp-content/uploads/2023/06/FINAL-San-Quentin-Report_1.3.24.pdf'],
  ['CDCR statewide Livescan form', 'Sends Livescan results to the central CDCR database, so a new one is not needed at every facility.', 'https://www.thetpw.org/s/CDCR-Default-Statewide-Livescan.pdf'],
  ['Webinar: supporting participants with immigration issues', 'Recording of the session with Asian Prisoner Support Committee.', 'https://us02web.zoom.us/rec/share/cJhpCpen7sdxAk9tL6SdnadjgDtY--7jke83Y8-LB82sT011tGMdoETw'],
  ['Webinar: tablets and in-prison programming', 'How Edovo works inside CDCR facilities and beyond.', 'https://us02web.zoom.us/rec/share/TAuuFHJ29lKcexzend-HL8eE7MefIZX7WJy8tlxkVI4QPctfL7ZITd7D'],
  ['CDCR gate clearance memos and CRM list', 'The memos, FAQs, workflow and CRM list live on TPW’s member portal.', 'https://www.thetpw.org/member-portal']
];

const announcements = [
  ['We have a new Advocacy Associate', 'https://www.thetpw.org/member-portal-blog/we-have-a-new-advocacy-associate'],
  ['Save the date: Annual Member Convening', 'https://www.thetpw.org/member-portal-blog/save-the-date'],
  ['In-district advocacy', 'https://www.thetpw.org/member-portal-blog/znewb09zdortis88c8pdd1shj51dkp'],
  ['AB 581 updates', 'https://www.thetpw.org/member-portal-blog/ab-581-updates'],
  ['October newsletter updates', 'https://www.thetpw.org/member-portal-blog/october-newsletter-updates'],
  ['AB 581 (Carrillo)', 'https://www.thetpw.org/member-portal-blog/the-tpw-has-a-new-name-rr425-7k8wj'],
  ['New Membership Manager', 'https://www.thetpw.org/member-portal-blog/the-tpw-has-a-new-name-rr425']
];

function External({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <LuExternalLink aria-hidden="true" focusable="false" size={14} /></a>;
}

export default function MemberPortal() {
  const account = useWorkspaceAccount();
  const suffix = account ? `#${account}` : '';
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authClient.getSession().then(({ data }) => setUser(data?.user || null)).catch(() => {});
  }, []);
  async function signOut() {
    setError(''); setBusy(true);
    try {
      const session = await authClient.getSession();
      if (session.error && session.error.status !== 503) throw session.error;
      if (session.data) {
        const { error: signOutError } = await authClient.signOut();
        if (signOutError) throw signOutError;
      }
      const { clearDemoAccount } = await import(/* turbopackIgnore: true */ '/assets/member-session.js?v=reporting-1');
      clearDemoAccount();
      location.replace('/sign-in/');
    } catch { setError('Sign-out could not be confirmed. Please try again.'); setBusy(false); }
  }
  return <main className="dashboard-layout"><div className="workspace-content">
    <section className="dashboard-heading"><div className="shell"><h1>Member Portal</h1></div></section>
    <div className="shell portal-page">
      <p className="portal-intro">What you do matters. You matter. And you are not alone — we are 100+ strong.</p>

      {account && <section className="portal-account" aria-labelledby="portal-account-heading">
        <h2 id="portal-account-heading">Your account</h2>
        <p>{user?.email ? <>Signed in as <strong>{user.email}</strong>.</> : <>Signed in as <strong>{account === 'tpw' ? 'TPW staff' : account}</strong>.</>}</p>
        <div className="portal-account-actions">
          <Link href={`/team-dashboard/#${account}`}>Go to your dashboard <LuArrowRight aria-hidden="true" size={14} /></Link>
          <button type="button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>}

      {account && <nav className="portal-jump" aria-label="On this page">
        <a href="#initiatives">Current initiatives</a>
        <a href="#resources">Resources</a>
        <a href="#announcements">Announcements</a>
        <a href="#help">Help</a>
      </nav>}

      <section id="initiatives" aria-labelledby="initiatives-heading">
        <h2 id="initiatives-heading">Current initiatives</h2>
        {initiatives.map(initiative => <article className="portal-entry" key={initiative.title}>
          <h3>{initiative.title}</h3>
          <p>{initiative.body}</p>
          {initiative.links.map(([label, href]) => <p key={href}><External href={href}>{label}</External></p>)}
          {initiative.note && <p className="portal-note">{initiative.note}</p>}
        </article>)}
      </section>

      <section id="resources" aria-labelledby="resources-heading">
        <h2 id="resources-heading">Resources</h2>
        <ul className="portal-list">{resources.map(([title, description, href]) => <li key={href}>
          <h3><External href={href}>{title}</External></h3>
          <p>{description}</p>
        </li>)}</ul>
      </section>

      <section id="announcements" aria-labelledby="announcements-heading">
        <h2 id="announcements-heading">Announcements</h2>
        <p>Recent posts from TPW. They open on TPW’s website.</p>
        <ul className="portal-list portal-announcements">{announcements.map(([title, href]) => <li key={href}>
          <External href={href}>{title}</External>
        </li>)}</ul>
      </section>

      <section id="help" aria-labelledby="help-heading">
        <h2 id="help-heading">Help</h2>
        <p>Email <a href="mailto:membership@thetpw.org">membership@thetpw.org</a> or call <a href="tel:+18332438135">833-243-8135</a>, weekdays 9am–5pm.</p>
        <ul className="portal-list">
          <li><External href="https://groups.google.com/g/_tpw">TPW member Google group</External></li>
          <li><External href="https://www.thetpw.org/membership-dues">Membership dues</External></li>
          <li><External href="https://www.thetpw.org/contact-us">Contact TPW</External></li>
        </ul>
        {account && <p><Link href={`/team-dashboard/${suffix}`}>Back to your dashboard <LuArrowRight aria-hidden="true" size={14} /></Link></p>}
      </section>
    </div>
  </div></main>;
}
