import { demoAccounts, getDemoAccount, setDemoAccount, clearDemoAccount } from './member-session.js';

const ROOT = new URL('../', import.meta.url);
const url = path => new URL(path, ROOT).href;
const route = location.pathname.slice(ROOT.pathname.length);
const embedded = new URLSearchParams(location.search).has('embed');
const dashboard = route.startsWith('dashboard/');
const intake = route.startsWith('intake/');
const guided = route.startsWith('form-demo/');
let workspacePage = dashboard ? route.includes('programs.html') ? 'programs' : route.includes('checkin.html') ? 'checkin' : 'overview' : 'intake';

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
  const account = activeAccount();
  const member = link(account ? 'Account' : 'Members Login', account ? `dashboard/#${account}` : 'members/', 'login');
  if (dashboard || intake || guided || route.startsWith('members/')) member.setAttribute('aria-current', 'page');
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
function sidebarMarkup(sidebar) {
  sidebar.replaceChildren(); sidebar.classList.add('tpw-sidebar');
  const account = element('div', 'sidebar-account');
  const avatar = element('span', 'sidebar-avatar'); avatar.dataset.accountInitials = '';
  const details = element('div'); const name = element('strong'); name.dataset.accountName = '';
  const type = element('small'); type.dataset.accountType = ''; details.append(name, type); account.append(avatar, details);
  const menu = element('div', 'sidebar-menu'); menu.id = 'tpw-member-menu';
  menu.append(element('div', 'sidebar-label', 'Member workspace'));
  const nav = element('nav'); nav.setAttribute('aria-label', 'Member navigation'); menu.append(nav);
  const toggle = element('button', 'tpw-menu-toggle', 'Menu'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'tpw-member-menu tpw-member-actions');
  toggle.addEventListener('click', () => {
    const open = sidebar.dataset.menuOpen !== 'true';
    sidebar.dataset.menuOpen = String(open); toggle.setAttribute('aria-expanded', String(open));
  });
  const bottom = element('div', 'sidebar-bottom'); bottom.id = 'tpw-member-actions';
  bottom.append(element('small', '', 'Demo workspace · synthetic data'));
  const exit = link('Leave demo', 'members/?signout=1');
  exit.addEventListener('click', () => clearDemoAccount());
  bottom.append(exit, link('Back to website', ''));
  sidebar.append(account, toggle, menu, bottom);
}
export function updateMemberWorkspace(account, page = workspacePage) {
  if (embedded) return;
  workspacePage = page;
  if (Object.hasOwn(demoAccounts, account)) setDemoAccount(account);
  const sidebar = document.querySelector('#dashboard-sidebar, #member-sidebar');
  if (!sidebar) return;
  const name = demoAccounts[account]; sidebar.hidden = !name;
  const layout = sidebar.parentElement;
  layout.classList.toggle('choosing-account', !name);
  if (!name) return;
  if (!sidebar.classList.contains('tpw-sidebar')) sidebarMarkup(sidebar);
  sidebar.querySelector('[data-account-name]').textContent = name;
  sidebar.querySelector('[data-account-initials]').textContent = account === 'tpw' ? 'TPW' : account.slice(-1).padStart(2, '0');
  sidebar.querySelector('[data-account-type]').textContent = account === 'tpw' ? 'Network overview' : 'Organization workspace';
  const links = [
    ['overview', 'Overview', `dashboard/#${account}`],
    ['programs', 'Programs', `dashboard/programs.html#${account}`],
    ['intake', 'Intake', `intake/simple.html?account=${account}`]
  ];
  if (account !== 'tpw') links.push(['checkin', 'Quarterly check-in', `dashboard/checkin.html#${account}`]);
  const nav = sidebar.querySelector('nav'); nav.replaceChildren();
  for (const [key, label, path] of links) {
    const anchor = link(label, path);
    if (page === key) anchor.setAttribute('aria-current', 'page');
    nav.append(anchor);
  }
  const member = document.querySelector('.tpw-header .login');
  if (member) { member.textContent = 'Account'; member.href = url(`dashboard/#${account}`); }
}
function mountIntakeWorkspace() {
  const content = document.querySelector('body > .wrap, body > main, body > .controls');
  if (!content) return;
  const layout = element('main', 'tpw-workspace choosing-account');
  const sidebar = element('aside', 'dashboard-sidebar'); sidebar.id = 'member-sidebar'; sidebar.hidden = true;
  sidebar.setAttribute('aria-label', 'Member workspace');
  const panel = element('div', 'tpw-workspace-content'); content.before(layout); layout.append(sidebar, panel);
  if (content.tagName === 'MAIN') {
    panel.append(...content.childNodes); content.remove(); // Keep one main landmark.
  } else panel.append(content);
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
  document.body.classList.add('tpw-site');
  mountHeader(); mountFooter();
  if (intake || guided) mountIntakeWorkspace();
  if (dashboard) updateMemberWorkspace(activeAccount(), workspacePage);
  sizeForms();
  window.addEventListener('hashchange', () => {
    if (dashboard) updateMemberWorkspace(activeAccount(), workspacePage);
  });
}
mount();
