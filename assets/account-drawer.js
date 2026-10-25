import { getDemoAccount, setDemoAccount, clearDemoAccount, demoEntryPath } from './member-session.js';

const root = new URL('../', import.meta.url);
let dialog, entry, returnFocus, stylesReady;
const changed = () => window.dispatchEvent(new Event('tpw:member-change'));

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
  signout.addEventListener('click', () => { clearDemoAccount(); changed(); dialog.close(); });
  greeting.append(element('h3', '', 'Hi, Member'), signout);
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
  entry.append(label, element('span', 'tpw-account-caption', 'Quarterly totals and sessions'));
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
export async function openAccountDrawer(trigger) {
  if (!dialog) mount();
  await stylesReady;
  if (dialog.open) return;
  // Fake signed-in preview only. Never ask for or store a real password/profile.
  setDemoAccount(getDemoAccount() || 'org-1'); changed();
  entry.href = new URL(demoEntryPath(), root).href;
  returnFocus = trigger || document.activeElement;
  document.documentElement.classList.add('tpw-account-open');
  dialog.showModal();
}
