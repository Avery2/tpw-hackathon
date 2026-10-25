import { demoAccounts, getDemoAccount, setDemoAccount, clearDemoAccount, demoEntryPath, memberMenu } from './member-session.js';
import { openAccountDrawer } from './account-drawer.js';

const ROOT = new URL('../', import.meta.url);
const url = path => new URL(path, ROOT).href;
const route = location.pathname.slice(ROOT.pathname.length);
const embedded = new URLSearchParams(location.search).has('embed');
const dashboard = route.startsWith('team-dashboard/');
const intake = route.startsWith('intake/');
const guided = route.startsWith('team-form/');
let workspacePage = dashboard ? route.includes('raw-data.html') ? 'raw-data' : route.includes('programs.html') ? 'programs' : route.includes('checkin.html') ? 'checkin' : 'overview' : 'intake';

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
  const logo = link('', '', 'logo'); logo.setAttribute('aria-label', 'TPW home');
  const image = element('img'); image.src = url('assets/img/logo.png'); image.alt = 'Transformative Programming Works';
  image.width = 220; logo.append(image);
  const nav = element('nav'); nav.setAttribute('aria-label', 'Main navigation');
  for (const [label, path] of [['Our Members', 'site/our-members/'], ['Our Story', 'site/ourstory/'], ['Our Work', 'site/ourwork/'], ['Our Team', 'site/our-team/']]) nav.append(link(label, path));
  // Log data, Dashboard and Annual report appear only once a member is signed in (memberMenu).
  // Yuki's originals at form-demo/ and dashboard/ only forward here (Firebase retired 25 Oct 2026).
  const memberLinks = () => memberMenu().map(item => {
    const anchor = link(item.label, item.path, 'tpw-member-link');
    if (item.newTab) { anchor.target = '_blank'; anchor.rel = 'noopener'; anchor.title = 'PDF · opens in a new tab'; }
    return anchor;
  });
  const account = activeAccount();
  nav.append(...memberLinks());
  const member = link(account ? 'Account' : 'Members Login', demoEntryPath(account), 'login');
  member.setAttribute('aria-haspopup', 'dialog');
  member.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); openAccountDrawer(member);
  });
  // Signing in or out, or switching account in the address (#org-1 → #tpw), redraws these links.
  const refresh = () => {
    activeAccount();
    member.textContent = getDemoAccount() ? 'Account' : 'Members Login';
    member.href = url(demoEntryPath());
    nav.querySelectorAll('.tpw-member-link').forEach(node => node.remove());
    member.before(...memberLinks());
    // The Log data / Dashboard tabs too, or after Sign out they still carry ?account=org-1.
    if (document.querySelector('.tpw-member-nav')) updateMemberWorkspace(getDemoAccount());
  };
  window.addEventListener('tpw:member-change', refresh);
  window.addEventListener('hashchange', refresh);
  nav.append(member); header.append(logo, nav);
}
function mountFooter() {
  const disclosure = document.querySelector('body > footer, body > .site-foot');
  const footer = element('footer', 'tpw-footer noprint'); footer.setAttribute('aria-label', 'TPW site footer');
  const inner = element('div', 'tpw-footer-inner');
  const logo = link('', '', 'tpw-footer-logo');
  const image = element('img'); image.src = url('assets/img/logo-footer.png'); image.alt = 'Transformative Programming Works'; image.width = 220;
  logo.append(image);
  const nav = element('nav'); nav.setAttribute('aria-label', 'Footer navigation');
  for (const [label, path] of [['Contact', 'site/contact-us/'], ['Donate', 'site/donate/'], ['Home', ''], ['Privacy Policy', 'site/privacy-policy/']]) nav.append(link(label, path));
  const social = element('div', 'tpw-social');
  for (const [label, href] of [['Facebook', 'https://www.facebook.com/theTPW1'], ['Instagram', 'https://www.instagram.com/nytpw2023/?hl=en']]) {
    const anchor = element('a', '', label); anchor.href = href; social.append(anchor);
  }
  nav.append(social); inner.append(logo, nav);
  const legal = element('p', 'tpw-legal', 'Transformative Programming Works is a California nonprofit corporation and registered 501(c)(3) organization. EIN 99-2553658');
  footer.append(inner, legal);
  if (disclosure) {
    disclosure.classList.add('tpw-disclosure', 'noprint');
    // Keep #bar-note and existing development/storage disclosures in the DOM.
    disclosure.before(footer);
  } else {
    footer.append(element('p', 'tpw-prototype-note', 'Unofficial prototype for Hack for Social Impact 2026. Not affiliated with TPW. Demo access is not authentication; use synthetic data only.'));
    document.body.append(footer);
  }
}
// Data embeds TPW's private Google Sheet, which holds every organization's numbers, so only the
// TPW staff view gets the tab; members would only hit Google's sign-in wall. Not access control:
// Google's sharing still decides who can open the Sheet.
const seesData = account => account === 'tpw';
function leaveDataForMembers() {
  if (!route.includes('raw-data.html') || seesData(activeAccount())) return false;
  const account = getDemoAccount();
  location.replace(url(`team-dashboard/${account ? `#${account}` : ''}`));
  return true;
}
// A small horizontal navigation, not a separate application shell.
export function updateMemberWorkspace(account, page = workspacePage) {
  if (embedded) return;
  workspacePage = page;
  if (Object.hasOwn(demoAccounts, account)) setDemoAccount(account);
  const key = getDemoAccount(); // null when signed out: the tabs then carry no account
  document.querySelector('#dashboard-sidebar, #member-sidebar')?.remove();
  document.querySelector('.dashboard-layout, .tpw-workspace')?.classList.remove('choosing-account');
  let nav = document.querySelector('.tpw-member-nav');
  if (!nav) {
    nav = element('nav', 'tpw-member-nav noprint');
    nav.setAttribute('aria-label', 'Member navigation');
    document.querySelector('.tpw-header').after(nav);
  }
  nav.replaceChildren();
  const tabs = [['intake', 'Log data', demoEntryPath(key)], ['overview', 'Dashboard', key ? `team-dashboard/#${key}` : 'team-dashboard/']];
  if (seesData(key)) tabs.push(['raw-data', 'Data', `team-dashboard/raw-data.html#${key}`]);
  for (const [id, label, path] of tabs) {
    const anchor = link(label, path);
    if (page === id) anchor.setAttribute('aria-current', 'page');
    nav.append(anchor);
  }
  const member = document.querySelector('.tpw-header .login');
  if (member) {
    member.textContent = getDemoAccount() ? 'Account' : 'Members Login';
    member.href = url(demoEntryPath(key));
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
function mount() {
  if (embedded) return;
  if (new URLSearchParams(location.search).has('signout')) clearDemoAccount();
  if (leaveDataForMembers()) return;
  document.body.classList.add('tpw-site');
  mountHeader(); mountFooter();
  if (new URLSearchParams(location.search).has('signin') && !getDemoAccount()) openAccountDrawer(document.querySelector('.tpw-header .login'));
  if (intake || guided) mountIntakeWorkspace();
  if (dashboard) updateMemberWorkspace(activeAccount(), workspacePage);
  sizeForms();
  window.addEventListener('hashchange', () => {
    if (dashboard && !leaveDataForMembers()) updateMemberWorkspace(activeAccount(), workspacePage);
  });
}
mount();
