'use client';

import { LuChevronDown, LuX } from 'react-icons/lu';
import { AccountDrawer } from './controls.jsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const validAccount = value => typeof value === 'string' && /^(tpw|org-[a-z0-9-]+)$/.test(value);
const websiteLinks = [
  ['Our Members', 'https://www.thetpw.org/our-members'],
  ['Our Story', 'https://www.thetpw.org/ourstory'],
  ['Our Work', 'https://www.thetpw.org/ourwork'],
  ['Our Team', 'https://www.thetpw.org/our-team'],
];
function subscribe(listener) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}
function readAccount() {
  const account = location.hash.slice(1) || new URLSearchParams(location.search).get('account');
  return validAccount(account) ? account : '';
}

export function useWorkspaceAccount() {
  return useSyncExternalStore(subscribe, readAccount, () => '');
}

export default function Workspace({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const fragmentAccount = useSyncExternalStore(subscribe, readAccount, () => '');
  const [queryAccount, setQueryAccount] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('account');
    setQueryAccount(validAccount(value) ? value : '');
    document.body.classList.toggle('embed', new URLSearchParams(location.search).has('embed'));
    return () => document.body.classList.remove('embed');
  }, [pathname]);
  const selectedAccount = fragmentAccount || queryAccount;
  useEffect(() => {
    if (pathname === '/team-dashboard/members/' && location.hash) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
  }, [pathname]);
  const dashboardPage = pathname.startsWith('/team-dashboard/');
  const [managedOrg, setManagedOrg] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const account = selectedAccount || (dashboardPage ? managedOrg : '');
  const [inviteAccepted, setInviteAccepted] = useState(false);
  useEffect(() => {
    if (!account || pathname !== '/team-dashboard/' || sessionStorage.getItem('tpw-invite-accepted') !== account) return;
    sessionStorage.removeItem('tpw-invite-accepted');
    setInviteAccepted(true);
  }, [account, pathname]);

  useEffect(() => {
    if (!inviteAccepted) return;
    const timeout = setTimeout(() => setInviteAccepted(false), 6000);
    return () => clearTimeout(timeout);
  }, [inviteAccepted]);
  useEffect(() => {
    if (!dashboardPage && !selectedAccount) return;
    const controller = new AbortController();
    fetch('/api/pilot-account/' + (selectedAccount ? '?org=' + encodeURIComponent(selectedAccount) : ''), { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        setManagedOrg(data?.canManageMembers ? data.orgId : '');
        setOrganizations(data?.organizations || []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [dashboardPage, selectedAccount]);
  useEffect(() => {
    if (pathname === '/sign-in/' && account) {
      router.replace('/team-dashboard/' + location.search + '#' + account);
    }
  }, [account, pathname, router]);
  const tabs = [
    ['Overview', '/team-dashboard/'],
    ['Programs', '/team-dashboard/programs/'],
    ...(account === 'tpw' ? [['Organizations', '/team-dashboard/organizations/']] : []),
    ['Submissions', '/team-dashboard/submissions/']
  ];
  const annualReport = account === 'tpw' ? '/report/TPW-Collective-Impact-Report-2026.pdf' :
    `/report/organizations/${account}-annual-report-2026.pdf`;

  const dialog = useRef(null);
  function openAccount(event) {
    event.preventDefault();
    dialog.current.showModal();
    document.documentElement.classList.add('tpw-account-open');
  }

  function navigateDashboard(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/team-dashboard/')) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    event.preventDefault();
    router.push(url.pathname + url.search + url.hash);
  }

  return <>
    <header className="site-header tpw-header noprint">
      <a href="https://www.thetpw.org/" className="logo" aria-label="TPW home">
        <img src="/assets/img/logo.png" alt="Transformative Programming Works" width="220" />
      </a>
      <nav aria-label="Main navigation">
        {websiteLinks.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        <Link href={account ? `/team-dashboard/#${account}` : '/sign-in/'} aria-current="location">Member tools</Link>
        {account ? <a className="login" href={`/log-data/?account=${account}`} aria-haspopup="dialog" onClick={openAccount}>Account</a>
          : <a className="login" href="/sign-in/">Members Login</a>}
      </nav>
    </header>
    {account && <nav className="tpw-member-nav noprint" aria-label="Member navigation">
      {tabs.slice(0, 1).map(([label, path]) => <Link key={path} href={path + '#' + account} aria-current={pathname === path ? 'page' : undefined}>{label}</Link>)}
      <Link href={`/log-data/?account=${account}`} aria-current={pathname === '/log-data/' ? 'page' : undefined}>Log data</Link>
      {tabs.slice(1).map(([label, path]) => <Link key={path} href={path + '#' + account} aria-current={pathname === path || (label === 'Submissions' && pathname === '/team-dashboard/submission-data/') ? 'page' : undefined}>{label}</Link>)}
      {account && account === managedOrg && <Link href={`/team-dashboard/members/?account=${encodeURIComponent(account)}`}
        aria-current={pathname === '/team-dashboard/members/' ? 'page' : undefined}>Members</Link>}
      <a href={annualReport} target="_blank" rel="noopener noreferrer">Annual report</a>
      {organizations.some(org => org.id === account) && <div className="tpw-org-picker-wrap"><select className="tpw-org-picker"
        aria-label="Current organization" value={account} onChange={event => {
          location.assign('/team-dashboard/#' + encodeURIComponent(event.target.value));
        }}>
        {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
      </select><LuChevronDown aria-hidden="true" size={16} /></div>}
    </nav>}
    {inviteAccepted && <div className="tpw-invite-toast">
      <div role="status"><strong>Invitation accepted</strong><span>You’ve joined the organization.</span></div>
      <button type="button" aria-label="Dismiss confirmation" onClick={() => setInviteAccepted(false)}><LuX aria-hidden="true" size={18} /></button>
      <style>{`
        .tpw-invite-toast { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 20px; width: max-content; max-width: calc(100% - 32px); padding: 14px 18px; border: 1px solid #b8d2be; border-radius: 12px; background: #edf6ef; color: #214c30; box-shadow: 0 6px 24px #0002; }
        .tpw-invite-toast [role="status"] { display: grid; gap: 2px; }
        .tpw-invite-toast button { border: 0; background: transparent; color: inherit; font: inherit; font-size: 22px; cursor: pointer; }
      `}</style>
    </div>}
    <AccountDrawer account={account} dialog={dialog} organizations={organizations} />
    <div onClick={navigateDashboard}>{children}</div>
  </>;
}
