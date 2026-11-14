import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../../neon/index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../../neon/auth-page.js', import.meta.url), 'utf8');
function renderContext(context) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', children: [], replaceChildren(...items) { this.children = items; } });
    return elements.get(id);
  };
  const scope = vm.createContext({ $: get, document: { createElement: () => ({ textContent: '' }) }, context });
  vm.runInContext(source.slice(source.indexOf('function showContext('), source.indexOf('async function loadContext(')) + '\nshowContext(context);', scope);
  return get;
}
test('sign-in keeps one test notice and puts technical help and user ID behind disclosures', () => {
  assert.match(html, /Test site · synthetic data only/);
  assert.match(html, /<h1 id="form-title">Sign in<\/h1>/);
  assert.match(html, /<p id="password-help"[^>]* hidden>/);
  assert.match(html, /<details class="help-note">\s*<summary>Trouble signing in\?/);
  assert.match(html, /<details class="user-id">\s*<summary>Account details/);
  assert.doesNotMatch(html, /class="introduction"|separate test environment|About sign-in cookies/);
  for (const id of source.matchAll(/\$\('([^']+)'\)/g)) assert(html.includes(`id="${id[1]}"`), `Controller target exists: ${id[1]}`);
});
test('staff sees a short scope label, not a 122-organization wall', () => {
  const get = renderContext({ isStaff: true, accountKey: 'tpw', orgs: Array.from({ length: 122 }, (_, i) => ({ id: `sample-${i}`, name: `Synthetic organization ${i}` })) });
  assert.equal(get('access-message').textContent, 'TPW staff · all organizations');
  assert.equal(get('organizations').hidden, true); assert.equal(get('organizations').children.length, 0);
  assert.equal(get('destinations').hidden, false);
});
test('members retain their organization label and authorized destinations', () => {
  const get = renderContext({ isStaff: false, accountKey: 'sample-member', orgs: [{ id: 'sample-member', name: 'Synthetic member' }] });
  assert.equal(get('organizations').children[0].textContent, 'Synthetic member');
  assert.equal(get('organizations').hidden, false); assert.equal(get('destinations').hidden, false);
  assert.match(get('dashboard-link').href, /backend=neon#sample-member$/);
});
test('simpler pending-access copy does not expose destinations to unassigned users', () => {
  const get = renderContext({ isStaff: false, accountKey: null, orgs: [] });
  assert.equal(get('destinations').hidden, true); assert.equal(get('organizations').hidden, true);
  assert.match(get('access-message').textContent, /Access pending.*user ID/);
});
