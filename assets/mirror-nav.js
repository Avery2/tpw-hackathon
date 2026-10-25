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
  function wire() {
    const href = destination();
    const label = account() ? 'Account' : 'Members Login';
    document.querySelectorAll(selector).forEach(link => {
      if (link.href !== href) link.href = href;
      if (link.textContent !== label) link.textContent = label;
      link.setAttribute('aria-haspopup', 'dialog');
    });
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
