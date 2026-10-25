// Loaded first in the published mirror, without changing the captured source.
// Mock the existing account drawer, with one new Intake entry; no real sign-in.
(() => {
  const root = new URL('../', document.currentScript.src);
  const selector = 'a.user-accounts-text-link, .customerAccountLoginDesktop a, .customerAccountLoginMobile a';
  const drawerUrl = new URL('assets/account-drawer.js', root).href;
  function account() {
    try {
      const key = sessionStorage.getItem('tpw.member.demo.v1');
      return ['org-1', 'org-2', 'tpw'].includes(key) ? key : null;
    } catch { return null; }
  }
  function destination() {
    const key = account();
    // Signed out, no account: a link must never sign anyone in as Org 1.
    return new URL(key ? `intake/simple.html?account=${key}` : 'intake/simple.html', root).href;
  }
  // Signed in, these pages get the same Log data, Dashboard and Annual report links as the rest of
  // the site (memberMenu in assets/member-session.js); signed out, only TPW's own menu.
  let session = null;
  import(new URL('assets/member-session.js', root).href).then(module => { session = module; wire(); }).catch(() => {});
  function memberItem(item, mobile) {
    const box = document.createElement('div');
    box.className = mobile ? 'container header-menu-nav-item header-menu-nav-item--collection' : 'header-nav-item header-nav-item--collection';
    box.dataset.tpwMember = '';
    const anchor = document.createElement('a');
    anchor.href = new URL(item.path, root).href;
    if (item.newTab) { anchor.target = '_blank'; anchor.rel = 'noopener'; }
    if (mobile) {
      const text = document.createElement('div'); text.className = 'header-menu-nav-item-content'; text.textContent = item.label;
      anchor.append(text);
    } else anchor.textContent = item.label;
    box.append(anchor);
    return box;
  }
  function placeMemberLinks() {
    if (!session) return;
    const menu = session.memberMenu(account());
    const wanted = menu.map(item => item.label).join('|');
    const lists = [
      ...[...document.querySelectorAll('.header-nav-list')].map(list => [list, false]),
      ...[...document.querySelectorAll('.header-menu-nav-folder[data-folder="root"] .header-menu-nav-wrapper')].map(list => [list, true])
    ];
    for (const [list, mobile] of lists) {
      const current = [...list.querySelectorAll(':scope > [data-tpw-member]')];
      if (current.map(node => node.textContent.trim()).join('|') === wanted) continue; // already right
      current.forEach(node => node.remove());
      list.append(...menu.map(item => memberItem(item, mobile)));
    }
  }
  function wire() {
    const href = destination();
    const label = account() ? 'Account' : 'Members Login';
    document.querySelectorAll(selector).forEach(link => {
      if (link.href !== href) link.href = href;
      if (link.textContent !== label) link.textContent = label;
      link.setAttribute('aria-haspopup', 'dialog');
    });
    // The logo goes to the site's home page, as it does on every other page.
    const home = new URL('index.html', root).href;
    document.querySelectorAll('.header-title-logo a, .header-title-text a').forEach(logo => { if (logo.href !== home) logo.href = home; });
    placeMemberLinks();
  }
  // Capture on window before the saved Squarespace scripts register handlers.
  // Rewriting href alone is insufficient: their controller intercepts the click.
  window.addEventListener('click', event => {
    const link = event.target.closest?.(selector);
    if (!link) return;
    link.href = destination();
    event.stopImmediatePropagation();
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    import(drawerUrl).then(({ openAccountDrawer }) => openAccountDrawer(link)).catch(() => location.assign(link.href));
  }, true);
  // Do not let Squarespace also dismiss its mobile menu behind our modal.
  window.addEventListener('keydown', event => {
    const drawer = document.querySelector('.tpw-account-drawer[open]');
    if (event.key !== 'Escape' || !drawer) return;
    event.stopImmediatePropagation(); event.preventDefault(); drawer.close();
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    wire();
    new MutationObserver(wire).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }, { once: true });
  window.addEventListener('pageshow', wire);
  window.addEventListener('tpw:member-change', wire);
})();
