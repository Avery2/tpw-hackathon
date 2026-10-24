// How the system works, in the open. This page is the "why" a reviewer needs
// before trusting a number on the impact view.

import { esc, num } from '../ui.js';
import * as S from '../schema.js';
import { allCycles } from '../store.js';

export function render(root, ctx) {
  const cfg = S.state.config;
  const cycles = allCycles(ctx.state);
  root.className = 'narrow';
  root.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">How it works</p>
        <h1>One form, one git repository, no server</h1>
        <p>The Collective Impact form asked organizations to describe activity. It could not ask the
           one thing that makes activity meaningful — who the people were, in a way that survives a
           join to outcome records. This is that form, rebuilt with a key.</p>
      </div>
    </div>

    <div class="section">
      <h2>The gap, restated</h2>
      <div class="grid2">
        ${card(
          'What the sheet captures',
          'Facility, yard, organization, program, dates, course hours, enrollment and completions.',
          'Every one of these is a property of a program cycle. None is a property of a person.'
        )}
        ${card(
          'What it cannot answer',
          'Did participants reoffend after release, and less often than comparable non-participants?',
          'Answering it needs a person-level key that survives from the program into the parole and recidivism record.'
        )}
      </div>
    </div>

    <div class="section">
      <h2>What the intake adds</h2>
      <div class="grid2">
        ${card('A pseudonymous participant spine', 'Each enrollee gets a 128-bit token derived on the submitting machine: HMAC-SHA256(organization key, CDCR number). No name, no number, no date of birth enters the repository.', 'The same number always yields the same token, so cycles join across years. The key never leaves the browser.')}
        ${card('Glossary as code', 'The June 2026 field definitions live in schema.json. The form and the CI validator read the same file, so they cannot drift apart.', 'Required fields become conditional: a Completed cycle must have an end date and completions; a Planned one must not.')}
        ${card('The formula columns, computed', 'L and M were spreadsheet formulas that broke — #VALUE! wherever completions were TBD. They are now derived at validation time and never stored wrong.', 'One source of truth for every calculated field, in both the browser and CI.')}
        ${card('Quality flags instead of silent repair', 'TBD stays missing. Sample rows stay flagged. Duplicate cycles and 18-month "cycles" are surfaced, not scrubbed.', 'The team can see its own reporting hygiene, which is the first step to fixing it.')}
      </div>
    </div>

    <div class="section">
      <h2>Field mapping</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>Col</th><th>Sheet field (2026)</th><th>Intake field</th><th>Change</th></tr></thead>
        <tbody>
          ${S.state.schema.fields
            .map(
              (f) => `<tr><td class="mono">${esc(f.column || '—')}</td>
              <td>${esc(legend(f.key))}</td>
              <td>${esc(f.label)}</td>
              <td class="dim">${esc(change(f.key))}</td></tr>`
            )
            .join('')}
          <tr><td class="mono">—</td><td>—</td><td>Participant join spine</td><td class="dim">New. Optional per cycle, decisive per report.</td></tr>
        </tbody>
      </table></div>
    </div>

    <div class="section">
      <h2>Privacy model</h2>
      <div class="card">
        <dl class="kv">
          <dt>In the repo</dt><dd>Tokens, cycle attributes, counts. No names, no CDCR numbers, no dates of birth, no release dates tied to an individual.</dd>
          <dt>On the device</dt><dd>The organization key, drafts, and any unpublished queue. Cleared by "Reset this device".</dd>
          <dt>Never</dt><dd>The raw identifier. It is hashed in the tab and discarded; the form does not have a field for it on the server side because there is no server side.</dd>
          <dt>Small cohorts</dt><dd>${esc(S.state.schema.join.note)}</dd>
        </dl>
      </div>
    </div>

    <div class="section">
      <h2>Where the data lives</h2>
      <div class="card">
        <dl class="kv">
          <dt>Schema</dt><dd><code>${esc(cfg.paths.schema)}</code></dd>
          <dt>Facility reference</dt><dd><code>${esc(cfg.paths.facilities)}</code></dd>
          <dt>Historic import</dt><dd><code>${esc(cfg.paths.seed)}</code> — ${num(S.state.seed.length)} cycles from the sheet</dd>
          <dt>Submissions</dt><dd><code>${esc(cfg.paths.cycles)}/*.json</code> — ${num(S.state.cycles.length)} committed</dd>
          <dt>Manifest</dt><dd><code>${esc(cfg.paths.index)}</code></dd>
          <dt>Synthetic spine</dt><dd><code>${esc(cfg.paths.join)}</code> — demonstration only</dd>
        </dl>
        <p class="hint" style="margin-top:14px">The ledger in this browser currently holds ${num(cycles.length)} cycles.
          Each submission is a file plus a commit, so the history of a correction is the git log.</p>
      </div>
    </div>

    <div class="section">
      <h2>Three ways to publish</h2>
      <div class="grid2">
        ${card('GitHub issue', 'The form opens a prefilled issue containing the cycle JSON. The workflow at .github/workflows/intake.yml parses it, runs the validator, commits the cycle and closes the issue with a link.', 'No token, no local setup. Needs a GitHub account.')}
        ${card('Access token', 'A fine-grained personal access token with contents:write commits straight to the Contents API, cycle file and manifest in two commits.', 'Fastest for a coordinator doing several cycles. The token stays in this browser.')}
        ${card('JSON file', 'Download the exact file that would be committed, to send by email or attach to a pull request.', 'Works entirely offline.')}
        ${card('Local queue', 'Nothing published, but visible in this device\'s ledger and counted in its impact figures.', 'Useful for a demo; not a record.')}
      </div>
    </div>

    <div class="section">
      <h2>Limits worth stating out loud</h2>
      <div class="caveat">
        <p style="margin:0 0 10px"><b>This system does not have outcome data.</b> CDCR parole and
        recidivism records are not public at the person level, and the RIGHT 4.0 RFA requires an
        independent third party plus Office of Research approval for outcomes research. What this
        builds is the join-ready side of that arrangement: the format the state would need to match
        against, without TPW ever holding a direct identifier.</p>
        <p style="margin:0 0 10px"><b>Token matching cuts both ways.</b> Whoever holds the
        organization key can recompute tokens from a list of CDCR numbers. Treat the key as the
        sensitive artifact it is; rotate deliberately, because rotation breaks continuity.</p>
        <p style="margin:0"><b>The comparison is observational.</b> Completers differ from
        non-completers before they walk into the room. Any rate difference is a hypothesis, and
        should be presented to a funder as one.</p>
      </div>
    </div>

    <div class="section">
      <h2>Run it yourself</h2>
      <div class="card">
        <pre class="mono" style="margin:0;white-space:pre-wrap;font-size:12.5px;line-height:1.75">cd intake &amp;&amp; python3 -m http.server 8080      # → http://localhost:8080
python3 scripts/intake_build_seed.py            # rebuild seed.json + synthetic spine
python3 scripts/intake_validate.py              # validate every committed cycle
python3 -m json.tool data/intake/schema.json    # the contract</pre>
      </div>
    </div>

    <div class="section">
      <h2>Reset</h2>
      <div class="card">
        <h3>This device</h3>
        <p style="margin-bottom:12px">Drafts, the unpublished queue, the organization key and any stored
          access token live in this browser's localStorage. Nothing else is affected.</p>
        <button class="btn small danger" id="reset-local">Clear this device's intake data</button>
      </div>
    </div>

    <p class="hint" style="margin-top:26px">Source: <a href="https://github.com/${esc(cfg.repo)}">github.com/${esc(cfg.repo)}</a>
      · Form intake and join spine built for Hack for Social Impact 2026.</p>
  `;

  root.querySelector('#reset-local').onclick = () => {
    localStorage.clear();
    location.reload();
  };
}

const card = (title, body, sub) =>
  `<div class="card"><h3>${esc(title)}</h3><p style="color:#cfcabf;margin-bottom:8px">${esc(body)}</p><p>${esc(sub)}</p></div>`;

const LEGEND = {
  org: 'Organization Name',
  program: 'Program Name',
  facility: 'CDCR Facility',
  yard: 'Yard',
  status: 'Schedule Status',
  start_date: 'Start Date',
  end_date: 'End Date',
  course_hours: 'Total Programming hours',
  participants_started: 'Number of Participants',
  participants_completed: 'Number of Participants Completed',
  funded_by: 'Funded by RIGHT 2.0',
  notes: 'Notes',
  submitter_name: '—',
  submitter_email: '—',
  submitter_role: '—',
};

const CHANGES = {
  org: '',
  program: '',
  facility: 'Reference list unchanged; typos now rejected at the source',
  yard: '',
  status: 'Conditional requirements per status',
  start_date: 'Date picker; ISO in storage, MM/DD/YYYY on export',
  end_date: 'Required for Completed — was optional and broke formulas',
  course_hours: 'Renamed per the glossary proposal; "per participant" is now enforced by the label',
  participants_started: '',
  participants_completed: 'Cannot exceed enrollments; TBD is a flag, not #VALUE!',
  funded_by: 'Generalized from RIGHT 2.0 only',
  notes: 'Unchanged',
  submitter_name: 'New: who to ask about this row',
  submitter_email: 'New: follow-up without a mail merge',
  submitter_role: 'New: optional',
};

const legend = (k) => LEGEND[k] ?? k;
const change = (k) => CHANGES[k] ?? '';
