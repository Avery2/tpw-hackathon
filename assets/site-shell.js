import { mountDashboardExports } from './dashboard-exports.js?v=history-download-1';
import { isSandboxMode, enableSandboxMode } from './neon-config.js?v=reporting-1';
if (isSandboxMode()) enableSandboxMode();
import { demoAccounts, getDemoAccount, setDemoAccount, clearDemoAccount, demoEntryPath, memberMenu } from './member-session.js?v=reporting-1';
import { openAccountDrawer } from './account-drawer.js?v=reporting-2';
import { isNeonMode, authStateReady, signOut } from './neon-auth-client.js?v=reporting-1';

const ROOT = new URL('../', import.meta.url);
const url = path => new URL(path, ROOT).href;
const route = location.pathname.slice(ROOT.pathname.length);
const embedded = new URLSearchParams(location.search).has('embed');
const accountPicker = route === 'dashboard/' && new URLSearchParams(location.search).get('entry') === 'team';
const dashboard = route.startsWith('team-dashboard/');
const intake = route.startsWith('intake/');
const guided = route.startsWith('team-form/');
const dashboardPages = [['raw-data.html', 'raw-data'], ['programs.html', 'programs'], ['organizations.html', 'organizations'], ['submission', 'submissions']];
let workspacePage = dashboard ? (dashboardPages.find(([file]) => route.includes(file)) || [, 'overview'])[1] : 'intake';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(label, path, className) {
  const node = element('a', className, label); node.href = url(path); return node;
}
function activeAccount() {
  if (isNeonMode()) return getDemoAccount();
  const params = new URLSearchParams(location.search);
  const explicit = dashboard ? location.hash.slice(1) : params.get('account');
  if (explicit && Object.hasOwn(demoAccounts, explicit)) setDemoAccount(explicit);
  return getDemoAccount();
}
function mountHeader() {
  let header = document.querySelector('body > .site-header, body > .workspace-topbar');
  if (!header) { header = element('header'); document.body.prepend(header); }
  header.className = 'site-header tpw-header noprint';
  header.replaceChildren();
  const logo = link('', 'team-dashboard/', 'logo'); logo.setAttribute('aria-label', 'TPW dashboard');
  const image = element('img'); image.src = url('assets/img/logo.png'); image.alt = 'Transformative Programming Works';
  image.width = 220; logo.append(image);
  const nav = element('nav'); nav.setAttribute('aria-label', 'Main navigation');
  const account = activeAccount();
  const member = link(account ? 'Account' : 'Members Login', isNeonMode() ? 'neon/?backend=neon' : demoEntryPath(account), 'login');
  member.setAttribute('aria-haspopup', 'dialog');
  member.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (accountPicker) document.querySelector('#signin-heading')?.focus();
    else if (isNeonMode()) location.assign(member.href);
    else openAccountDrawer(member);
  });
  // Signing in or out, or switching account in the address (#org-1 → #tpw), updates the label.
  // Only an address change reads the account from the address: after Sign out, the address
  // still says #org-1, and reading it then would sign the visitor straight back in.
  const refresh = () => {
    member.textContent = getDemoAccount() ? 'Account' : 'Members Login';
    member.href = url(isNeonMode() ? 'neon/?backend=neon' : demoEntryPath());
    // The Log data / Dashboard tabs too, or after Sign out they still carry ?account=org-1.
    if (document.querySelector('.tpw-member-nav')) updateMemberWorkspace(getDemoAccount());
  };
  window.addEventListener('tpw:member-change', refresh);
  window.addEventListener('tpw:neon-change', refresh);
  window.addEventListener('hashchange', () => { activeAccount(); refresh(); });
  nav.append(member); header.append(logo, nav);
}
// Data embeds TPW's private Google Sheet, which holds every organization's numbers, so only the
// TPW staff view gets the tab; members would only hit Google's sign-in wall. Not access control:
// Google's sharing still decides who can open the Sheet.
const seesData = account => account === 'tpw';
function leaveDataForMembers() {
  if (!route.includes('raw-data.html') || (!isNeonMode() && !isSandboxMode() && seesData(activeAccount()))) return false;
  const account = getDemoAccount();
  location.replace(url(`team-dashboard/${isNeonMode() ? '?backend=neon' : isSandboxMode() ? '?backend=demo' : ''}${account ? `#${account}` : ''}`));
  return true;
}
// A small horizontal navigation, not a separate application shell.
export function updateMemberWorkspace(account, page = workspacePage) {
  if (embedded) return;
  workspacePage = page;
  if (!isNeonMode() && Object.hasOwn(demoAccounts, account)) setDemoAccount(account);
  const key = getDemoAccount();
  if (dashboard) {
    document.querySelector('#dashboard-exports')?.remove();
    if (['overview', 'programs'].includes(page) && Object.hasOwn(demoAccounts, account)) {
      mountDashboardExports(null, key === 'tpw' ? null : key);
    }
  }
  document.querySelector('#dashboard-sidebar, #member-sidebar')?.remove();
  document.querySelector('.dashboard-layout, .tpw-workspace')?.classList.remove('choosing-account');
  let nav = document.querySelector('.tpw-member-nav');
  if (!nav) {
    nav = element('nav', 'tpw-member-nav noprint');
    nav.setAttribute('aria-label', 'Member navigation');
    document.querySelector('.tpw-header').after(nav);
  }
  nav.replaceChildren();
  const tabs = [['overview', 'Overview', key ? `team-dashboard/#${key}` : 'team-dashboard/'], ['intake', 'Log data', demoEntryPath(key)]];
  // Signed in, the pages of the dashboard workspace: this account's programs and submissions, and
  // for the TPW staff view the list of organizations. Signed out there is nothing to show.
  if (key) {
    tabs.push(['programs', 'Programs', `team-dashboard/programs.html#${key}`]);
    if (key === 'tpw') tabs.push(['organizations', 'Organizations', 'team-dashboard/organizations.html#tpw']);
    tabs.push(['submissions', 'Submissions', `team-dashboard/submissions.html#${key}`]);
  }
  // Signed in: that account's own annual report (memberMenu), a PDF in a new tab.
  const report = memberMenu(key).find(item => item.label === 'Annual report');
  if (report) tabs.push(['report', report.label, report.path, true]);
  if (!isNeonMode() && !isSandboxMode() && seesData(key)) tabs.push(['raw-data', 'Data', `team-dashboard/raw-data.html#${key}`]);
  for (const [id, label, path, newTab] of tabs) {
    const anchor = link(label, path);
    if ((isNeonMode() || isSandboxMode()) && !newTab) {
      const destination = new URL(anchor.href); destination.searchParams.set('backend', isSandboxMode() ? 'demo' : 'neon'); anchor.href = destination.href;
    }
    if (newTab) { anchor.target = '_blank'; anchor.rel = 'noopener'; anchor.title = 'PDF · opens in a new tab'; }
    if (page === id) anchor.setAttribute('aria-current', 'page');
    nav.append(anchor);
  }
  if (isNeonMode()) nav.append(element('span', 'tpw-prototype-note', 'Neon sandbox · synthetic data only'));
  const member = document.querySelector('.tpw-header .login');
  if (member) {
    member.textContent = getDemoAccount() ? 'Account' : 'Members Login';
    member.href = url(isNeonMode() ? 'neon/?backend=neon' : demoEntryPath(key));
  }
}
function mountIntakeWorkspace() {
  const content = document.querySelector('body > .wrap, body > main, body > .controls');
  if (!content) return;
  const layout = element('main', 'tpw-workspace');
  const panel = element('div', 'tpw-workspace-content'); content.before(layout); layout.append(panel);
  if (content.tagName === 'MAIN') {
    panel.append(...content.childNodes); content.remove(); // Keep one main landmark.
  } else panel.append(content);
  if (route === 'intake/simple.html') content.prepend(element('h1', 'tpw-page-title', 'Log data'));
  const sheet = document.querySelector('body > .page');
  if (sheet) { const preview = element('div', 'tpw-sheet-preview'); preview.append(sheet); panel.append(preview); }
  updateMemberWorkspace(activeAccount(), 'intake');
}
// Same-origin frames grow with each form step: no viewport-wide breakout or nested scrollbars.
function sizeForms() {
  const wired = new WeakSet();
  const connect = frame => {
    if (wired.has(frame)) return; wired.add(frame);
    const resize = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc?.body.classList.contains('embed')) return;
        const main = doc.querySelector('main'); if (!main) return;
        const observer = new ResizeObserver(() => { frame.style.height = `${Math.ceil(main.getBoundingClientRect().height) + 8}px`; });
        observer.observe(main);
        frame.addEventListener('load', () => observer.disconnect(), { once: true });
      } catch { /* Foreign frames retain their own sizing. */ }
    };
    frame.addEventListener('load', resize); resize();
  };
  const scan = () => document.querySelectorAll('.demo-panel iframe, #checkin-form').forEach(connect);
  scan(); new MutationObserver(scan).observe(document.body, {childList:true, subtree:true});
}
function memberPickerNavigation() {
  const member = document.querySelector('.tpw-header .login');
  member.textContent = 'Members Login';
  member.href = '#signin';
  member.removeAttribute('aria-haspopup');
}
function mount() {
  if (embedded) return;
  if (!isNeonMode() && new URLSearchParams(location.search).has('signout')) clearDemoAccount();
  if (leaveDataForMembers()) return;
  document.body.classList.add('tpw-site');
  mountHeader();
  document.querySelector('body > footer, body > .site-foot')?.remove();
  if (new URLSearchParams(location.search).has('signin') && !getDemoAccount()) openAccountDrawer(document.querySelector('.tpw-header .login'));
  if (intake || guided) mountIntakeWorkspace();
  if (accountPicker) {
    memberPickerNavigation();
  } else if (dashboard) updateMemberWorkspace(activeAccount(), workspacePage);
  sizeForms();
  if (isNeonMode()) {
    // Mount chrome synchronously: dashboard controllers can call updateWorkspace immediately.
    const ready = new URLSearchParams(location.search).has('signout') ? signOut() : authStateReady();
    ready.catch(() => { /* Keep the real sign-in link; never fall back to a demo label. */ });
  }
  window.addEventListener('hashchange', () => {
    if (dashboard && !leaveDataForMembers()) updateMemberWorkspace(activeAccount(), workspacePage);
  });
}
mount();
