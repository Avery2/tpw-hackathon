// Router and boot. Hash routing so the whole thing works from a static host with
// no rewrite rules — including from a subpath on GitHub Pages.

import * as S from './schema.js';
import { allCycles, pendingCount, store } from './store.js';
import * as form from './views/form.js';
import * as ledger from './views/ledger.js';
import * as impact from './views/impact.js';
import * as guide from './views/guide.js';

const VIEWS = { submit: form, ledger, impact, guide };
const root = document.getElementById('view');
const NARROW = new Set(['submit', 'guide']);

let current = 'submit';

const ctx = {
  state: S.state,
  refresh() {
    paint(current);
  },
};

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const name = raw.split('/')[0] || 'submit';
  return VIEWS[name] ? name : 'submit';
}

function paint(name) {
  current = name;
  root.className = NARROW.has(name) ? 'narrow' : '';
  for (const a of document.querySelectorAll('#nav a')) {
    a.toggleAttribute('aria-current', a.dataset.route === name);
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  VIEWS[name].render(root, ctx);
  window.scrollTo({ top: 0 });
  chrome();
}

function chrome() {
  const state = S.state;
  const all = allCycles(state);
  const pending = pendingCount(state);
  const foot = document.getElementById('rail-status');
  const pill = document.getElementById('repo-pill');

  if (pill && state.config?.repo) {
    pill.outerHTML = `<a class="pill" id="repo-pill" href="https://github.com/${state.config.repo}" target="_blank" rel="noopener">${state.config.repo}</a>`;
  }

  if (foot) {
    const synced = state.cycles.length;
    foot.innerHTML = `
      ${all.length} cycles on record<br>
      ${synced ? `${synced} committed` : 'nothing committed yet'}${
      pending ? ` · <span style="color:var(--warn)">${pending} local</span>` : ''
    }<br>
      <a href="#/guide">schema ${state.schema?.version || ''}</a>`;
  }
}

async function boot() {
  try {
    await S.loadAll();
  } catch (err) {
    root.innerHTML = `
      <div class="page-head"><div>
        <p class="eyebrow">Cannot load</p>
        <h1>The ledger did not load</h1>
        <p>${String(err.message || err)}</p>
      </div></div>
      <div class="card">
        <h3>Most likely cause</h3>
        <p>This page fetches <code>data/intake/*.json</code> from the same origin. Open it through a web
           server rather than the filesystem:</p>
        <pre class="mono" style="white-space:pre-wrap;margin-top:10px">cd intake &amp;&amp; python3 -m http.server 8080</pre>
      </div>`;
    return;
  }

  window.addEventListener('hashchange', () => paint(currentRoute()));
  if (!location.hash) history.replaceState(null, '', '#/submit');
  paint(currentRoute());

  // A quiet escape hatch for demos where somebody left a queue behind.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'D' && e.shiftKey && e.metaKey) {
      store.clearAll();
      location.reload();
    }
  });
}

boot();
