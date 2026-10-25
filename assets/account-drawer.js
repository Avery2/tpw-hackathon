import { demoAccounts, getDemoAccount, setDemoAccount, clearDemoAccount, demoEntryPath } from './member-session.js';

const root = new URL('../', import.meta.url);
let dialog, entry, greetingName, signin, returnFocus, stylesReady;
const changed = () => window.dispatchEvent(new Event('tpw:member-change'));
// Signing out also takes the account out of the address (?account=org-1, or #org-1 on the
// dashboard), or site-shell.js would read it back and sign the same account straight back in.
function forgetAccountInAddress() {
  const address = new URL(location.href);
  address.searchParams.delete('account');
  const hashWasAccount = Object.hasOwn(demoAccounts, address.hash.slice(1));
  if (hashWasAccount) address.hash = '';
  if (address.href === location.href) return;
  history.replaceState(history.state, '', address);
  // replaceState fires no hashchange, and the dashboard redraws on hashchange.
  if (hashWasAccount) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function mount() {
  const stylesheet = element('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('account-drawer.css', import.meta.url).href;
  stylesReady = new Promise(resolve => { stylesheet.onload = resolve; stylesheet.onerror = resolve; });
  document.head.append(stylesheet);
  dialog = element('dialog', 'tpw-account-drawer');
  dialog.id = 'tpw-account-drawer';
  dialog.setAttribute('aria-labelledby', 'tpw-account-title');
  dialog.setAttribute('aria-describedby', 'tpw-account-preview');
  const header = element('header', 'tpw-account-header');
  const title = element('h2', '', 'Account'); title.id = 'tpw-account-title';
  const close = element('button', 'tpw-account-close', 'Close');
  close.type = 'button'; close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  header.append(title, close);
  const body = element('div', 'tpw-account-body');
  const greeting = element('section', 'tpw-account-greeting');
  const signout = element('button', 'tpw-account-signout', 'Sign out'); signout.type = 'button';
  signout.addEventListener('click', () => { clearDemoAccount(); forgetAccountInAddress(); changed(); dialog.close(); });
  greetingName = element('h3', '', 'Hi, Member');
  greeting.append(greetingName, signout);
  body.append(greeting);
  // A visual mock of the existing account sections, not connected account tools.
  for (const [label, value] of [['Orders', 'No orders yet'], ['Payment Methods', 'No saved payments'], ['Address', 'No saved addresses'], ['Profile', 'Demo member']]) {
    const section = element('section', 'tpw-account-row');
    section.append(element('h3', '', label), element('p', '', value));
    body.append(section);
  }
  entry = element('a', 'tpw-account-row tpw-account-intake');
  const label = element('span', 'tpw-account-intake-label', 'Intake');
  label.append(element('span', 'tpw-new-badge', 'New'));
  entry.append(label, element('span', 'tpw-account-caption', 'Quarterly totals'));
  const preview = element('p', 'tpw-account-preview', 'Demo account preview · no real sign-in');
  preview.id = 'tpw-account-preview';
  body.append(entry, preview);
  dialog.append(header, body); document.body.append(dialog);
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  // Escape should close this modal, not Squarespace's mobile menu behind it.
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('tpw-account-open');
    // Squarespace may close its mobile menu when focus moves into the modal.
    const menuClosed = returnFocus?.closest('.header-menu') && !document.body.classList.contains('header--menu-open');
    const target = menuClosed ? document.querySelector('.header-burger-btn') : returnFocus;
    target?.focus();
  });
}
// A copy of TPW's own sign-in box (thetpw.org/account/login: "Welcome to TPW", Email,
// Password, Sign in), so the demo feels like the site members already use. Nothing real
// happens: the password box is switched off, no password is ever asked for or checked, and
// signing in only picks one of the three demo accounts.
const DEMO_EMAILS = { 'org-1': 'org1@example.org', 'org-2': 'org2@example.org', tpw: 'staff@example.org' };
const DEMO_LABELS = { 'org-1': 'Org 1', 'org-2': 'Org 2', tpw: 'TPW staff' };
function mountSignIn() {
  signin = element('dialog', 'tpw-signin');
  signin.setAttribute('aria-labelledby', 'tpw-signin-title');
  const close = element('button', 'tpw-signin-close', 'Close'); close.type = 'button';
  close.setAttribute('aria-label', 'Close sign-in');
  close.addEventListener('click', () => signin.close());
  const form = element('form', 'tpw-signin-form'); form.noValidate = true;
  const title = element('h2', '', 'Welcome to TPW'); title.id = 'tpw-signin-title';
  const email = element('input', 'tpw-signin-email');
  Object.assign(email, { type: 'email', placeholder: 'Email', autocomplete: 'off', spellcheck: false });
  email.setAttribute('aria-label', 'Email');
  const password = element('input', 'tpw-signin-password');
  Object.assign(password, { type: 'password', placeholder: 'Password: not needed in this demo', disabled: true });
  password.setAttribute('aria-label', 'Password (not used in this demo)');
  const submit = element('button', 'tpw-signin-submit', 'Sign in'); submit.type = 'submit';
  const message = element('p', 'tpw-signin-message'); message.setAttribute('role', 'alert');
  const links = element('p', 'tpw-signin-links');
  for (const label of ['Forgot Password?', 'Create account']) {
    const button = element('button', '', label); button.type = 'button';
    button.addEventListener('click', () => { message.textContent = `${label.replace('?', '')} isn’t part of this demo. On TPW’s site it works as usual.`; });
    links.append(button);
  }
  const demo = element('div', 'tpw-signin-demo');
  demo.append(element('p', '', 'Demo: sign in as'));
  for (const [account, label] of Object.entries(DEMO_LABELS)) {
    const button = element('button', '', label); button.type = 'button'; button.dataset.account = account;
    button.addEventListener('click', () => { email.value = DEMO_EMAILS[account]; signInAs(account); });
    demo.append(button);
  }
  const note = element('p', 'tpw-account-preview', 'Demo of TPW’s sign-in · no password is asked for or checked');
  form.append(title, email, password, submit, message, links);
  signin.append(close, form, demo, note);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const typed = email.value.trim().toLowerCase();
    const account = Object.keys(DEMO_EMAILS).find(key => DEMO_EMAILS[key] === typed);
    if (account) { signInAs(account); return; }
    message.textContent = typed
      ? 'This demo only has three accounts. Pick one below.'
      : 'Enter your email, or pick a demo account below.';
    email.focus();
  });
  signin.addEventListener('click', event => {
    const box = signin.getBoundingClientRect();
    if (event.target === signin && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) signin.close();
  });
  signin.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  signin.addEventListener('close', () => {
    document.documentElement.classList.remove('tpw-account-open');
    message.textContent = '';
    returnFocus?.focus();
  });
  document.body.append(signin);
}
// Signing in goes straight to Log data, where the form starts from that account's last report.
function signInAs(account) {
  if (!setDemoAccount(account)) return;
  changed();
  location.assign(new URL(demoEntryPath(account), root).href);
}

export async function openAccountDrawer(trigger) {
  if (!dialog) mount();
  await stylesReady;
  if (dialog.open || signin?.open) return;
  returnFocus = trigger || document.activeElement;
  // Signed out: show the sign-in box first, as TPW's own site does.
  if (!getDemoAccount()) {
    if (!signin) mountSignIn();
    document.documentElement.classList.add('tpw-account-open');
    signin.showModal();
    signin.querySelector('.tpw-signin-email').focus();
    return;
  }
  greetingName.textContent = `Hi, ${DEMO_LABELS[getDemoAccount()] || demoAccounts[getDemoAccount()]}`;
  entry.href = new URL(demoEntryPath(), root).href;
  document.documentElement.classList.add('tpw-account-open');
  dialog.showModal();
}
