// Exercise captured Squarespace account controls without a browser or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setDemoAccount, clearDemoAccount } from '../../assets/member-session.js';
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.sessionStorage = storage;
const anchors = Array.from({ length: 3 }, () => ({ href: '#', textContent: 'Login Account' }));
const windowHandlers = new Map(), documentHandlers = new Map();
let navigated;
const context = {
  URL, sessionStorage: storage,
  location: { assign: href => { navigated = href; } },
  document: {
    currentScript: { src: 'https://example.invalid/tpw-hackathon/assets/mirror-nav.js' },
    body: {}, querySelectorAll: () => anchors,
    addEventListener: (type, fn) => documentHandlers.set(type, fn)
  },
  window: { addEventListener: (type, fn, capture) => { windowHandlers.set(type, fn); if (type === 'click') assert.equal(capture, true); } },
  MutationObserver: class { observe() {} }
};
vm.runInNewContext(await readFile(new URL('../../assets/mirror-nav.js', import.meta.url), 'utf8'), context);
documentHandlers.get('DOMContentLoaded')();
assert(anchors.every(a => a.href === 'https://example.invalid/tpw-hackathon/intake/simple.html?account=org-1' && a.textContent === 'Members Login'));
function click(modifiers = {}, accountLink = true) {
  navigated = undefined;
  const result = { stopped: false, prevented: false };
  windowHandlers.get('click')({
    target: { closest: () => accountLink ? anchors[0] : null }, button: 0, ...modifiers,
    stopImmediatePropagation: () => { result.stopped = true; },
    preventDefault: () => { result.prevented = true; }
  });
  return result;
}
assert.deepEqual(click(), { stopped: true, prevented: true });
assert.equal(navigated, 'https://example.invalid/tpw-hackathon/intake/simple.html?account=org-1');
for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
  assert.deepEqual(click(modifiers), { stopped: true, prevented: false });
  assert.equal(navigated, undefined); // Native new-tab behavior uses the corrected href.
}
assert.deepEqual(click({}, false), { stopped: false, prevented: false });
for (const account of ['org-1', 'org-2', 'tpw']) {
  setDemoAccount(account);
  windowHandlers.get('pageshow')();
  assert(anchors.every(a => a.textContent === 'Account' && a.href.endsWith(`/intake/simple.html?account=${account}`)));
  click(); assert.equal(navigated, `https://example.invalid/tpw-hackathon/intake/simple.html?account=${account}`);
}
clearDemoAccount(); windowHandlers.get('pageshow')();
assert(anchors.every(a => a.textContent === 'Members Login'));
console.log('PASS desktop/mobile login links, captured-handler suppression, instant log entry, account continuity, modified clicks and unrelated links.');
