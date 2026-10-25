// Exercise captured Squarespace account controls without a browser or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setDemoAccount, clearDemoAccount } from '../../assets/member-session.js';
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.sessionStorage = storage;
const anchors = Array.from({ length: 3 }, () => ({ href: '#', textContent: 'Login Account', setAttribute(name, value) { this[name] = value; } }));
const windowHandlers = new Map(), documentHandlers = new Map();
let opened, imported;
const context = {
  URL, sessionStorage: storage,
  document: {
    currentScript: { src: 'https://example.invalid/tpw-hackathon/assets/mirror-nav.js' },
    // Only the account links are present: no captured logo or menu lists in this stand-in page.
    body: {}, querySelectorAll: selector => (selector.includes('user-accounts-text-link') ? anchors : []),
    addEventListener: (type, fn) => documentHandlers.set(type, fn)
  },
  window: { addEventListener: (type, fn, capture) => { windowHandlers.set(type, fn); if (type === 'click') assert.equal(capture, true); } },
  MutationObserver: class { observe() {} },
  loadDrawer: async url => { imported = url; return { openAccountDrawer: trigger => { opened = trigger; } }; }
};
// Stub only the browser's dynamic module loader; exercise the actual bridge code.
const source = await readFile(new URL('../../assets/mirror-nav.js', import.meta.url), 'utf8');
assert.equal(source.split('import(drawerUrl)').length, 2);
vm.runInNewContext(source.replace('import(drawerUrl)', 'loadDrawer(drawerUrl)'), context);
documentHandlers.get('DOMContentLoaded')();
assert(anchors.every(a => a.href === 'https://example.invalid/tpw-hackathon/intake/simple.html' && a.textContent === 'Members Login' && a['aria-haspopup'] === 'dialog'));
async function click(modifiers = {}, accountLink = true) {
  opened = imported = undefined;
  const result = { stopped: false, prevented: false };
  windowHandlers.get('click')({
    target: { closest: () => accountLink ? anchors[0] : null }, button: 0, ...modifiers,
    stopImmediatePropagation: () => { result.stopped = true; },
    preventDefault: () => { result.prevented = true; }
  });
  await Promise.resolve();
  return result;
}
assert.deepEqual(await click(), { stopped: true, prevented: true });
assert.equal(opened, anchors[0]);
assert.equal(imported, 'https://example.invalid/tpw-hackathon/assets/account-drawer.js');
for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
  assert.deepEqual(await click(modifiers), { stopped: true, prevented: false });
  assert.equal(opened, undefined); // Native new-tab behavior uses the corrected href.
  assert.equal(imported, undefined);
}
assert.deepEqual(await click({}, false), { stopped: false, prevented: false });
for (const account of ['org-1', 'org-2', 'tpw']) {
  setDemoAccount(account);
  windowHandlers.get('pageshow')();
  assert(anchors.every(a => a.textContent === 'Account' && a.href.endsWith(`/intake/simple.html?account=${account}`)));
  await click(); assert.equal(opened, anchors[0]);
}
clearDemoAccount(); windowHandlers.get('tpw:member-change')();
assert(anchors.every(a => a.textContent === 'Members Login'));
console.log('PASS desktop/mobile account links, captured-handler suppression, shared drawer loading, account continuity, modified clicks and unrelated links.');
