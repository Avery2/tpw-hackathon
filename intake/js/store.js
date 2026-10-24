// Persistence. Everything durable lives either in localStorage (drafts, a
// submission queue, a device-local token) or in git (committed cycle files).
// There is no database and no server.

const K = {
  draft: 'tpw.intake.draft.v2',
  queue: 'tpw.intake.queue.v2',
  published: 'tpw.intake.published.v2',
  gh: 'tpw.intake.github.v2',
  secret: 'tpw.intake.secret.v2',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  get draft() {
    return read(K.draft, null);
  },
  set draft(v) {
    v ? write(K.draft, v) : localStorage.removeItem(K.draft);
  },

  get queue() {
    return read(K.queue, []);
  },
  set queue(v) {
    write(K.queue, v);
  },

  /** ids this device has already pushed to the repo, so the queue stops nagging */
  get published() {
    return read(K.published, []);
  },
  markPublished(id) {
    const set = new Set(this.published);
    set.add(id);
    write(K.published, [...set]);
  },

  get github() {
    return read(K.gh, null);
  },
  set github(v) {
    v ? write(K.gh, v) : localStorage.removeItem(K.gh);
  },

  get secret() {
    return read(K.secret, '');
  },
  set secret(v) {
    v ? write(K.secret, v) : localStorage.removeItem(K.secret);
  },

  clearAll() {
    Object.values(K).forEach((k) => localStorage.removeItem(k));
  },
};

export function enqueue(cycle, meta = {}) {
  const q = store.queue.filter((c) => c.id !== cycle.id);
  q.push({ ...cycle, _local: { ...meta, queued_at: new Date().toISOString() } });
  store.queue = q;
}

export function dequeue(id) {
  store.queue = store.queue.filter((c) => c.id !== id);
}

/**
 * One ledger: what the repo holds, plus anything submitted on this device that
 * has not landed in git yet. Repo wins on id collisions so a published cycle
 * never appears twice.
 */
export function allCycles(state) {
  const byId = new Map();
  for (const c of state.seed) byId.set(c.id, { ...c, _source: 'sheet' });
  for (const c of state.cycles) byId.set(c.id, { ...c, _source: 'repo' });
  for (const c of store.queue) if (!byId.has(c.id)) byId.set(c.id, { ...c, _source: 'local' });
  return [...byId.values()];
}

export function pendingCount(state) {
  const repoIds = new Set(state.cycles.map((c) => c.id));
  return store.queue.filter((c) => !repoIds.has(c.id)).length;
}
