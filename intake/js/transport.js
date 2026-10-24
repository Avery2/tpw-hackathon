// Three ways a submission becomes durable, all of them inside GitHub:
//
//   issue  — opens a prefilled issue; .github/workflows/intake.yml turns it into
//            a commit. Works for any collaborator with a GitHub account and no
//            local tooling.
//   token  — commits straight to the Contents API with a fine-grained PAT that
//            stays in this browser. For the coordinator who does not want to
//            open an issue per cycle.
//   file   — exports the exact JSON that would have been committed, for email or
//            a pull request.
//
// Nothing here talks to a service that is not GitHub.

const API = 'https://api.github.com';
const PAGES = (repo, branch) => `https://github.com/${repo}/blob/${branch}`;

export const paths = (config) => ({
  cycle: (id) => `${config.paths.cycles}/${id}.json`,
  index: config.paths.index,
});

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function gh(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}/repos/${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg =
      data.message ||
      (res.status === 401 ? 'Token rejected.' : res.status === 403 ? 'Token lacks contents:write.' : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function issueUrl(cycle, config) {
  const title = `[intake] ${cycle.org} — ${cycle.program} @ ${cycle.facility}`.slice(0, 240);
  const payload = JSON.stringify(cycle, null, 2);
  const params = new URLSearchParams({
    title,
    labels: config.labels?.intake || 'intake',
    body: [
      'Automated submission from the TPW intake form.',
      '',
      '<!-- tpw-intake-payload -->',
      '```json',
      payload,
      '```',
    ].join('\n'),
  });
  const template = config.issue_template ? `?template=${config.issue_template}&` : '?';
  return `https://github.com/${config.repo}/issues/new${template}${params.toString()}`;
}

/**
 * Commit one cycle plus the index update. Two commits, in this order, so the
 * index never points at a file that does not exist yet.
 */
export async function commitCycle(cycle, config, token) {
  const repo = config.repo;
  const branch = config.branch || 'main';
  const p = paths(config);

  const file = `${p.cycle(cycle.id)}`;
  let existingSha = null;
  try {
    const cur = await gh(`${repo}/contents/${file}?ref=${branch}`, { token });
    existingSha = cur.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  const write = await gh(`${repo}/contents/${file}`, {
    token,
    method: 'PUT',
    body: {
      message: `intake: ${cycle.org} — ${cycle.program} at ${cycle.facility}${cycle.yard ? ` (${cycle.yard})` : ''}`,
      content: b64(JSON.stringify(cycle, null, 2) + '\n'),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
      committer: {
        name: cycle.submitter_name || 'TPW Intake',
        email: cycle.submitter_email || 'intake@thetpw.org',
      },
    },
  });

  // Refresh the manifest.
  let index = { schema: 'tpw.intake.index/1', cycles: [] };
  let indexSha = null;
  try {
    const cur = await gh(`${repo}/contents/${p.index}?ref=${branch}`, { token });
    indexSha = cur.sha;
    index = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))));
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const files = new Set((index.cycles || []).map((c) => (typeof c === 'string' ? c : c.file)));
  files.add(`${cycle.id}.json`);
  index.cycles = [...files].sort().map((file) => {
    const id = file.replace(/\.json$/, '');
    return { file, id };
  });
  index.updated_at = new Date().toISOString();

  await gh(`${repo}/contents/${p.index}`, {
    token,
    method: 'PUT',
    body: {
      message: `intake: index +${cycle.id}`,
      content: b64(JSON.stringify(index, null, 2) + '\n'),
      branch,
      ...(indexSha ? { sha: indexSha } : {}),
    },
  });

  return {
    kind: 'commit',
    url: write.content?.html_url || `${PAGES(repo, branch)}/${file}`,
    sha: write.commit?.sha,
  };
}

export function exportBundle(cycles) {
  return JSON.stringify(
    {
      schema: 'tpw.intake/1',
      kind: 'export',
      exported_at: new Date().toISOString(),
      cycles: cycles.map(({ _source, _local, ...c }) => c),
    },
    null,
    2
  );
}

/** Rebuild the Collective Impact sheet rows from ledger entries. */
export function toSheetRows(cycles) {
  const head = [
    'CDCR Facility',
    'Yard',
    'Organization Name',
    'Program Name',
    'Schedule Status (Planned, In Progress, Completed)',
    'Start Date',
    'End Date',
    'Total Programming hours',
    'Number of Participants',
    'Number of Participants Completed',
    'CALC: Total Participant Programming hours (Participants Completed * Total Programming Hours',
    'CALC: Program Year (Year of Program Start Date)',
    'Notes',
  ];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const us = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${Number(m)}/${Number(d)}/${y}`;
  };
  const lines = [head.map(cell).join(',')];
  for (const c of cycles) {
    const hours = c.course_hours ?? '';
    const done = c.participants_completed ?? '';
    lines.push(
      [
        c.facility,
        c.yard,
        c.org,
        c.program,
        c.status,
        us(c.start_date),
        us(c.end_date),
        hours,
        c.participants_started,
        done,
        hours && done !== '' ? hours * done : '',
        c.start_date ? c.start_date.slice(0, 4) : '',
        c.notes,
      ]
        .map(cell)
        .join(',')
    );
  }
  return lines.join('\n') + '\n';
}
