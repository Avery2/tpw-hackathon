// Loaded first in the published mirror, without changing the captured source.
// Override Squarespace's account controls, not the TPW page's design/content.
(() => {
  const root = new URL('../', document.currentScript.src);
  const selector = 'a.user-accounts-text-link, .customerAccountLoginDesktop a, .customerAccountLoginMobile a';
  function account() {
    try {
      const key = sessionStorage.getItem('tpw.member.demo.v1');
      return ['org-1', 'org-2', 'tpw'].includes(key) ? key : null;
    } catch { return null; }
  }
  function destination() {
    const key = account();
    return new URL(`intake/simple.html?account=${key || 'org-1'}`, root).href;
  }
  function wire() {
    const href = destination();
    const label = account() ? 'Account' : 'Members Login';
    document.querySelectorAll(selector).forEach(link => {
      if (link.href !== href) link.href = href;
      if (link.textContent !== label) link.textContent = label;
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
    location.assign(link.href);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    wire();
    new MutationObserver(wire).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }, { once: true });
  window.addEventListener('pageshow', wire);
})();
