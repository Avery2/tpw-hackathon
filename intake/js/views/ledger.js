// The ledger: every cycle the collective has on record, whether it came from the
// 2026 sheet import, a committed submission, or this browser's queue.

import { esc, num, pct, shortDate, toast, delegate, modal, download, bindFresh } from '../ui.js';
import * as S from '../schema.js';
import { allCycles, store, enqueue, dequeue } from '../store.js';
import { toSheetRows, exportBundle } from '../transport.js';

const filters = { q: '', facility: '', org: '', status: '', flagged: false, source: '' };

export function render(root, ctx) {
  const all = allCycles(ctx.state).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  const shown = applyFilters(all);

  root.className = '';
  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Ledger</p>
        <h1>Program cycles on record</h1>
        <p>${num(all.length)} cycles · ${num(new Set(all.map((c) => c.org)).size)} organizations ·
           ${num(new Set(all.map((c) => c.facility)).size)} facilities. Imported rows keep their gaps;
           nothing was guessed to fill a blank.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small" data-act="csv">Export sheet CSV</button>
        <button class="btn small" data-act="json">Export JSON</button>
        <button class="btn small ghost" data-act="import">Import</button>
      </div>
    </div>

    ${pendingBanner(ctx)}

    <div class="toolbar">
      <input type="text" id="f-q" placeholder="Search program, organization, notes…" value="${esc(filters.q)}">
      <select id="f-facility">
        <option value="">All facilities</option>
        ${[...new Set(all.map((c) => c.facility).filter(Boolean))]
          .sort()
          .map((f) => `<option ${filters.facility === f ? 'selected' : ''}>${esc(f)}</option>`)
          .join('')}
      </select>
      <select id="f-org">
        <option value="">All organizations</option>
        ${[...new Set(all.map((c) => c.org).filter(Boolean))]
          .sort()
          .map((o) => `<option ${filters.org === o ? 'selected' : ''}>${esc(o)}</option>`)
          .join('')}
      </select>
      <select id="f-status">
        <option value="">Any status</option>
        ${S.state.schema.statuses.map((s) => `<option ${filters.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <select id="f-source">
        <option value="">Any source</option>
        <option value="sheet" ${filters.source === 'sheet' ? 'selected' : ''}>Sheet import</option>
        <option value="repo" ${filters.source === 'repo' ? 'selected' : ''}>Committed</option>
        <option value="local" ${filters.source === 'local' ? 'selected' : ''}>This device</option>
      </select>
      <label class="check" style="margin:0 0 0 4px">
        <input type="checkbox" id="f-flagged" ${filters.flagged ? 'checked' : ''}><span>Flagged only</span>
      </label>
      <div class="spacer"></div>
      <span class="savebit">${shown.length} shown</span>
    </div>

    ${
      shown.length
        ? `<div class="tablewrap"><table>
            <thead><tr>
              <th>Cycle</th><th>Facility</th><th>Start</th><th>End</th>
              <th class="num">Began</th><th class="num">Finished</th>
              <th class="num">P-hours</th><th>Join</th><th>Signals</th>
            </tr></thead>
            <tbody>
            ${shown.map(row).join('')}
            </tbody>
          </table></div>`
        : '<div class="empty">No cycles match those filters.</div>'
    }
  `;

  bind(root, ctx);
}

function pendingBanner(ctx) {
  const repoIds = new Set(ctx.state.cycles.map((c) => c.id));
  const pending = store.queue.filter((c) => !repoIds.has(c.id));
  if (!pending.length) return '';
  return `<div class="card tight" style="border-color:#3f3622;background:#1a1710;margin-bottom:18px">
    <h3 style="color:var(--warn)">${pending.length} cycle${pending.length > 1 ? 's' : ''} on this device only</h3>
    <p>They are included below and in the impact figures, but they are not in git. Publish them, or
      export the JSON.</p>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn small" data-act="export-pending">Export queue</button>
      <button class="btn small ghost danger" data-act="clear-queue">Discard</button>
    </div>
  </div>`;
}

function row(c) {
  const d = S.derive(c);
  const flags = c.flags || [];
  const isSample = flags.includes('sample-data');
  const tokens = c.join?.tokens?.length || 0;
  return `<tr data-id="${esc(c.id)}">
    <td>
      <b>${esc(c.program || '—')}</b>
      <div class="dim">${esc(c.org || 'no organization')}${c._source === 'local' ? ' · <span class="tag warn">local</span>' : ''}</div>
    </td>
    <td>${esc((c.facility || '—').replace(/\s*\([A-Z]+\)$/, ''))}${c.yard ? `<div class="dim">${esc(c.yard)}</div>` : ''}</td>
    <td class="mono">${c.start_date ? esc(c.start_date) : '—'}</td>
    <td class="mono">${c.end_date ? esc(c.end_date) : '—'}</td>
    <td class="num">${num(c.participants_started)}</td>
    <td class="num">${c.participants_completed == null ? '<span class="tag bad">TBD</span>' : num(c.participants_completed)}</td>
    <td class="num">${d.total_participant_hours == null ? '—' : num(d.total_participant_hours)}</td>
    <td>${tokens ? `<span class="tag good">${num(tokens)}</span>` : '<span class="tag">—</span>'}</td>
    <td><div class="flags">
      ${isSample ? '<span class="tag bad">sample</span>' : ''}
      ${flags.includes('duplicate-cycle') ? '<span class="tag warn">dupe?</span>' : ''}
      ${flags.includes('implausible-duration') ? '<span class="tag warn">long</span>' : ''}
      ${flags.includes('unknown-completions') ? '<span class="tag warn">unknown</span>' : ''}
      ${flags.includes('import-gap') ? '<span class="tag warn">gap</span>' : ''}
      ${flags.length === 0 ? '<span class="tag">clean</span>' : ''}
    </div></td>
  </tr>`;
}

function bind(root, ctx) {
  const rerender = () => render(root, ctx);
  const signal = bindFresh(root);

  root.addEventListener('input', (e) => {
    if (e.target.id === 'f-q') {
      filters.q = e.target.value;
      rerender();
      const box = root.querySelector('#f-q');
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    }
  }, { signal });
  root.addEventListener('change', (e) => {
    const map = { 'f-facility': 'facility', 'f-org': 'org', 'f-status': 'status', 'f-source': 'source' };
    if (map[e.target.id]) {
      filters[map[e.target.id]] = e.target.value;
      rerender();
    }
    if (e.target.id === 'f-flagged') {
      filters.flagged = e.target.checked;
      rerender();
    }
  }, { signal });

  delegate(root, 'click', 'tbody tr', (e, tr) => {
    const cycle = allCycles(ctx.state).find((c) => c.id === tr.dataset.id);
    if (cycle) openDetail(cycle, ctx);
  }, signal);

  delegate(root, 'click', '[data-act="csv"]', () => {
    const cycles = applyFilters(allCycles(ctx.state));
    download('tpw-collective-impact.csv', toSheetRows(cycles), 'text/csv');
    toast('Sheet-format CSV exported', 'good');
  }, signal);

  delegate(root, 'click', '[data-act="json"]', () => {
    download('tpw-intake-export.json', exportBundle(applyFilters(allCycles(ctx.state))));
    toast('JSON exported', 'good');
  }, signal);

  delegate(root, 'click', '[data-act="export-pending"]', () => {
    download('tpw-intake-queue.json', exportBundle(store.queue.filter((c) => !ctx.state.cycles.some((r) => r.id === c.id))));
  }, signal);

  delegate(root, 'click', '[data-act="clear-queue"]', () => {
    store.queue = [];
    ctx.refresh();
  }, signal);

  delegate(root, 'click', '[data-act="import"]', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const cycles = Array.isArray(parsed) ? parsed : parsed.cycles || [];
        if (!cycles.length) throw new Error('No cycles found in that file.');
        let ok = 0;
        for (const c of cycles) {
          const { errors } = S.validate(c, { all: [] });
          if (errors.length) {
            toast(`${c.id || 'cycle'}: ${errors[0].msg}`, 'bad');
            continue;
          }
          enqueue(c, { channel: 'import' });
          ok += 1;
        }
        toast(`${ok} cycle${ok === 1 ? '' : 's'} imported into this device's ledger`, 'good');
        ctx.refresh();
      } catch (e) {
        toast(`Import failed: ${e.message}`, 'bad');
      }
    };
    input.click();
  }, signal);
}

function applyFilters(all) {
  const q = filters.q.trim().toLowerCase();
  return all.filter((c) => {
    if (filters.facility && c.facility !== filters.facility) return false;
    if (filters.org && c.org !== filters.org) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.source && (c._source || '') !== filters.source) return false;
    if (filters.flagged && !(c.flags || []).length) return false;
    if (q) {
      const hay = [c.program, c.org, c.facility, c.yard, c.notes, c.id, ...(c.flags || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function openDetail(c, ctx) {
  const d = S.derive(c);
  const tokens = c.join?.tokens || [];
  const { errors, warnings } = S.validate(c, { all: allCycles(ctx.state) });
  const sourceLabel = { sheet: 'Imported from the 2026 sheet', repo: 'Committed to the repository', local: 'On this device only' }[
    c._source
  ];

  modal({
    title: c.program || 'Cycle',
    sub: `${c.org || 'No organization'} · ${c.facility || 'No facility'}${c.yard ? ` · ${c.yard}` : ''} · ${sourceLabel}`,
    wide: true,
    body: `
      <dl class="kv" style="margin-bottom:20px">
        <dt>Cycle id</dt><dd class="mono" style="font-size:11.5px">${esc(c.id)}</dd>
        <dt>Status</dt><dd>${esc(c.status)}</dd>
        <dt>Start</dt><dd>${shortDate(c.start_date)}</dd>
        <dt>End</dt><dd>${shortDate(c.end_date)}</dd>
        <dt>Course hours</dt><dd>${c.course_hours == null ? '—' : num(c.course_hours)} per participant</dd>
        <dt>Began / completed</dt><dd>${num(c.participants_started)} / ${num(c.participants_completed)}</dd>
        <dt>Participant hours</dt><dd>${d.total_participant_hours == null ? '—' : num(d.total_participant_hours)}</dd>
        <dt>Completion rate</dt><dd>${d.completion_rate == null ? '—' : pct(d.completion_rate)}</dd>
        <dt>Program year</dt><dd>${d.program_year ?? '—'}</dd>
        <dt>Funding</dt><dd>${esc(c.funded_by || '—')}</dd>
        <dt>Join spine</dt><dd>${tokens.length ? `${num(tokens.length)} tokens (${pct(tokens.length / (c.participants_started || 1))} of enrollees)` : '<span class="tag">none</span>'}</dd>
        ${c.submitted_by ? `<dt>Submitted by</dt><dd>${esc(c.submitted_by.name)} &lt;${esc(c.submitted_by.email)}&gt;</dd>` : ''}
      </dl>
      ${c.notes ? `<p style="border-left:2px solid var(--rule);padding-left:14px;color:#cfcabf;font-size:13.5px">${esc(c.notes)}</p>` : ''}
      ${
        errors.length || warnings.length
          ? `<div style="margin-top:18px">
              <p class="eyebrow">Validation</p>
              <ul style="margin:0;padding-left:18px;font-size:13px">
                ${errors.map((e) => `<li style="color:var(--bad)">${esc(e.msg)}</li>`).join('')}
                ${warnings.map((w) => `<li style="color:var(--muted)">${esc(w.msg)}</li>`).join('')}
              </ul>
            </div>`
          : ''
      }
      <p class="hint" style="margin-top:18px">The JSON is the record. Everything else — this table, the
        impact figures, the sheet export — is a view of it.</p>`,
    actions: [
      { label: 'Copy JSON', kind: 'ghost', onClick: () => navigator.clipboard.writeText(JSON.stringify(c, null, 2)) },
      c._source === 'local'
        ? {
            label: 'Discard',
            kind: 'danger',
            onClick: (close) => {
              dequeue(c.id);
              close();
              ctx.refresh();
            },
          }
        : null,
      { label: 'Close', kind: 'primary', onClick: (close) => close() },
    ].filter(Boolean),
  });
}
