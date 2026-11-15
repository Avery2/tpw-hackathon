'use client';

import { AccountDrawer } from './controls.jsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const accounts = ['org-1', 'org-2', 'tpw'];
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
  return accounts.includes(account) ? account : '';
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
    setQueryAccount(accounts.includes(value) ? value : '');
    document.body.classList.toggle('embed', new URLSearchParams(location.search).has('embed'));
    return () => document.body.classList.remove('embed');
  }, [pathname]);
  const account = fragmentAccount || queryAccount;
  useEffect(() => {
    if ((pathname === '/dashboard/' || pathname === '/dashboard/index.html') && account) {
      router.replace('/team-dashboard/' + location.search + '#' + account);
    }
  }, [account, pathname, router]);
  const tabs = [
    ['Overview', '/team-dashboard/'],
    ['Programs', '/team-dashboard/programs.html'],
    ...(account === 'tpw' ? [['Organizations', '/team-dashboard/organizations.html']] : []),
    ['Submissions', '/team-dashboard/submissions.html']
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
    <header hidden={pathname === '/team-form/' || pathname === '/form-demo/'} className="site-header tpw-header noprint">
      <Link href={account ? `/team-dashboard/#${account}` : '/dashboard/?entry=team'} className="logo" aria-label="TPW dashboard">
        <img src="/assets/img/logo.png" alt="Transformative Programming Works" width="220" />
      </Link>
      <nav aria-label="Account navigation">
        {account ? <a className="login" href={`/intake/simple.html?backend=demo&account=${account}`} aria-haspopup="dialog" onClick={openAccount}>Account</a>
          : <a className="login" href="/dashboard/?entry=team">Members Login</a>}
      </nav>
    </header>
    {account && !['/team-form/', '/form-demo/'].includes(pathname) && <nav className="tpw-member-nav noprint" aria-label="Member navigation">
      {tabs.slice(0, 1).map(([label, path]) => <Link key={path} href={path + '#' + account} aria-current={pathname === path ? 'page' : undefined}>{label}</Link>)}
      <Link href={`/intake/simple.html?backend=demo&account=${account}`} aria-current={pathname === '/intake/simple.html' ? 'page' : undefined}>Log data</Link>
      {tabs.slice(1).map(([label, path]) => <Link key={path} href={path + '#' + account} aria-current={pathname === path || (label === 'Submissions' && pathname.endsWith('/submission-data.html')) ? 'page' : undefined}>{label}</Link>)}
      <a href={annualReport} target="_blank" rel="noopener noreferrer">Annual report</a>
    </nav>}
    <AccountDrawer account={account} dialog={dialog} />
    <div onClick={navigateDashboard}>{children}</div>
  </>;
}
