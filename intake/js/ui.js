// Small DOM + formatting helpers. No framework, on purpose: this has to keep
// running on GitHub Pages years from now with nothing to rebuild.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (n) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

export const pct = (x, digits = 0) =>
  x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`;

export const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export function toast(message, kind = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 320);
  }, kind === 'bad' ? 6000 : 3600);
}

/**
 * Every render aborts the listeners its predecessor installed. Without this,
 * re-rendering a view stacks duplicate handlers and one click advances a wizard
 * by however many paints have happened.
 */
export function bindFresh(root) {
  root._ac?.abort();
  const ac = new AbortController();
  root._ac = ac;
  return ac.signal;
}

export function delegate(root, type, selector, fn, signal) {
  root.addEventListener(
    type,
    (e) => {
      const hit = e.target.closest(selector);
      if (hit && root.contains(hit)) fn(e, hit);
    },
    { signal }
  );
}

/**
 * Modal with an optional set of actions. Returns a close() function.
 * actions: [{ label, kind, onClick(close) }]
 */
export function modal({ title, sub, body, actions = [], wide = false }) {
  const host = document.getElementById('modal');
  host.innerHTML = `
    <div class="modal" ${wide ? 'style="max-width:900px"' : ''}>
      <h2>${esc(title)}</h2>
      ${sub ? `<p class="modal-sub">${esc(sub)}</p>` : ''}
      <div class="modal-body">${body}</div>
      ${actions.length ? '<div class="modal-actions"></div>' : ''}
    </div>`;
  host.classList.add('open');

  const close = () => {
    host.classList.remove('open');
    host.innerHTML = '';
  };

  if (actions.length) {
    const bar = host.querySelector('.modal-actions');
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.kind || ''}`;
      b.textContent = a.label;
      b.onclick = () => a.onClick?.(close);
      bar.appendChild(b);
    }
  }

  host.onclick = (e) => {
    if (e.target === host) close();
  };
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && host.classList.contains('open')) close();
    },
    { once: true }
  );

  return close;
}

export function copy(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(
    () => toast(label, 'good'),
    () => toast('Copy failed — select and copy manually', 'bad')
  );
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
