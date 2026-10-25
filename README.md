# TPW × Hack for Social Impact 2026

Working repo for **Transformative Programming Works (TPW)** at [Hack for Social Impact 2026](https://www.thetpw.org/?utm_source=luma).

TPW is a unified voice for the community-based organizations (CBOs) delivering rehabilitative programs inside California state prisons. This repo holds the source material, a local copy of their site, and (soon) our prototype.

---

## The problem statement

> **⚖️ Justice Reform:** California's corrections department spends under one percent of its budget on rehabilitation. Transformative Programming Works advocates for them across 120 organizations, but so far can only track **process data** — such as who enrolled and how long a class ran. **Join disjoint records such as parole and recidivism data into a framework TPW, and nonprofits generally, can use to track impact.**

The crux: TPW can prove *activity* (enrollment, hours, completions). It cannot yet prove *outcomes* (did people stay out of prison?). The outcome data exists — in CDCR, parole, and recidivism datasets — but it lives in separate systems that have never been joined to program participation.

## Working on this repo

- **No code reviews needed.** Push straight to `main`.
- **Changing someone else's code? Go and find them first.** A quick word saves you both from undoing each other's work. `git log -- <path>` shows who wrote what.
- AI agents: start with `AGENTS.md`.

## Resources

| What | Link |
|---|---|
| TPW website | https://www.thetpw.org/ |
| Hackathon pack (schedule, judging, submission) | https://hackforsocialimpact.notion.site/HSI-Hack-Pack-2026-3eb2cb772f1e802890d1d4b7769c311a |
| Kickoff / briefing video | https://www.loom.com/share/32d61ecd9c764a16803ea4701650396d |
| **TPW Collective Impact data form** (Google Sheet, live) | https://docs.google.com/spreadsheets/d/1icSY90fNL_tF94yN9XKP4W-fGxRFbIp9R11__YHHiuM/edit?gid=0#gid=0 |
| CDCR RIGHT 4.0 grant — RFA (PDF) | https://www.cdcr.ca.gov/rehabilitation/wp-content/uploads/sites/173/2026/09/RIGHT-4.0-RFA.pdf |
| CDCR Rehabilitation grants page | https://www.cdcr.ca.gov/rehabilitation/grants/ |
| CDCR grant application (Qualtrics) | https://cdcrca.sjc1.qualtrics.com/jfe/form/SV_4Z8isIprw8f0RL0 |

### Official CDCR facts worth knowing (from RIGHT 4.0 RFA)

- **$19.4M** available to community-based nonprofits for trauma-informed / restorative programming in CDCR institutions.
- Funding period **Jul 1, 2027 – Dec 1, 2029**; applications due **Nov 30, 2026**.
- Eligibility: 501(c)(3) (or fiscally sponsored), plus a record of providing programming in a CDCR institution in **2 of the last 5 years**.
- **Reporting requirement is process-level only.** Annual reports must cover expenditures, the institution funds were used at, *number of participants*, and *populations served* — a template from DRP. Nothing about recidivism.
- Grantees may **not** self-evaluate for external publication; outcomes research needs an independent third party and CDCR Office of Research approval.

That last pair is the gap in the problem statement, in the state's own words.

## Local materials

### Public data layer (`data/public/`, `docs/public-data-sources.md`)

What is and isn't published by the state and by member orgs — verified source by source.
The short version: **who runs what, where** is public (CDCR's per-institution grant program
list, 113 institution × provider rows); **how many people, how many hours** is not public
for anyone. Rebuild with `python3 scripts/build_public_data.py`.

| File | What |
|---|---|
| `data/public/cdcr-grant-programs-by-institution.csv` | institution × grant program × provider, from CDCR MAPIP (as of 2026-01-01) |
| `data/public/cdcr-attachment-a-institutions.csv` | RIGHT 4.0 Attachment A parsed: underserved flag + population types each institution lacks |
| `data/public/facility-crosswalk.csv` | one `facility_code` per prison, with the TPW-form / Attachment A / MAPIP name variants |
| `data/public/tpw-members.csv` | 125 TPW member orgs + websites |

Bundled so collaborators don't need Downloads access:

- `docs/TPW Data Glossary Instructions.docx` — field-by-field definitions and submission rules for the Collective Impact form (June 2026, Rick Olesek & Kim Moore). **Read this first.**
- `docs/RIGHT 4.0 RFA.pdf` — the state grant that funds these programs, incl. reporting obligations.
- `docs/right-4.0-rfa-dummy-filled.pdf` + `docs/right-4.0-application-example.md` — a filled application packet (fictional org), page by page, incl. how Attachment A gets ticked.
- `docs/kickoff-briefing.md` — kickoff video transcript + what it implies about the design target.
- `docs/hsi-hack-pack-2026.html` — saved hack pack (mostly JS-only; open in a browser).
- `data/tpw-collective-impact-form.xlsx` — snapshot of the live Google Sheet (3 tabs: Data Entry Sheet, Form Responses, Constants).
- `data/snapshots/2026-10-24-tpw-collective-impact.xlsx` — pull of the live sheet on 2026-10-24; identical in content to the bundled snapshot (37 cycles, 3 orgs, 14 facilities).
- `data/tpw-collective-impact.csv` — the Data Entry Sheet tab as CSV, for quick loading in pandas/Sheets.

### What the form actually captures

One row per **program cycle** = one run of one program at one facility (one row per yard).

| Col | Field | Note |
|---|---|---|
| A | CDCR Facility | standardized names, dropdown reference |
| B | Yard | e.g. North, South, Reception, Ad Seg |
| C | Organization Name | member CBO |
| D | Program Name | specific curriculum |
| E | Schedule Status | Planned / In Progress / Completed |
| F–G | Start / End Date | `MM/DD/YYYY` |
| H | Course Hours (per Participant) | *proposed rename* from "Total Programming Hours" |
| I | Number of Participants | began the cycle |
| J | Number of Participants Completed | finished the cycle |
| K | Funded by RIGHT 2.0 | flagged in the doc as possibly removable |
| L | CALC: Total Participant Hours Delivered | `J × H`, auto |
| M | CALC: Program Year | from start date, auto |
| N | Notes | free-text escape hatch |

Seven organizations' worth of rows are in there already, and the sheet has known warts we should handle in any prototype: `TBD` strings, `#VALUE!` errors when J is unknown, sample rows marked `SAMPLE DATA`, and one cycle whose end date (3/26/2026) is far past its start (11/1/2024).

**No demographic, no individual-identifier, and no outcome field exists.** That is the whole design problem: the join key to parole/recidivism data isn't in this form.

## Repo layout

```
intake/       the forms: session, quarterly, follow-up, printable sheets, scanner, packet upload
data/intake/  the ledger — records, derived rollup, org registry, form contracts
scripts/      validators, issue ingester, reindexer, rollup, profile deriver
docs/         TPW + CDCR source documents
data/         snapshots of the Collective Impact form
site/         local mirror of thetpw.org (offline copy, for reference and extension)
admin/        Google-side tools; additional-forms/ is the separate quick-record receiver (see below)
```

## The intake

**Live:** <https://www.averychan.site/tpw-hackathon/intake/simple.html> · `/intake/` redirects here.

The default **Quarterly totals** tab appends guided quarterly submissions to the master
Google Sheet through the existing Apps Script receiver. **That working quarterly
project, its source files, deployment and endpoint remain unchanged.** **Session**,
both scanner paths and the older quick Quarter/follow-up forms instead target a
[new, standalone receiver](admin/additional-forms/README.md), with its own endpoint
and separate approved tabs in the same workbook. Its new endpoint is configured
in `intake/backend.js`; a live synthetic Session and same-ID retry returned the
same confirmed receipt. The Session frontend uses this separate endpoint.
There is no client-side Firebase second write. **Dashboard** retains the original
charts and estimates, with a visible notice that its Firebase preview is not
connected to new Sheet filings. **Data** separately embeds the
[reporting Google Sheet](https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/edit?gid=0#gid=0),
with an **Open in Google Sheets** fallback link. Google's existing sharing
permissions apply; nothing is published publicly.
**Members Login / Account** opens a mock of TPW's existing account drawer, with
one added **Intake · New** entry leading to **Log data**. No passwords are collected.
There is no workspace sidebar; old `/members/` links enter the log automatically.
The shared TPW header/footer remain visible throughout. Real sign-in is deferred: demo access is **not
authentication** and does not protect private data. Use synthetic demo data only.
See `form-demo/README.md` and `dashboard/README.md`.

Four small pages, no build step or application server. The browser holds the
arithmetic; the separate additional-forms Apps Script receiver appends quick records
to private Google Sheet tabs once configured. No account is required in unsigned demo mode (synthetic data only).
Packet-profile upload is still a legacy GitHub-backed route.

| Page | What it is |
|---|---|
| `intake/simple.html` | three single-screen forms — a week, a quarter, a follow-up |
| `intake/sheet.html` | prints a session roster with participant IDs pre-printed and a QR anchor |
| `intake/scan.html` | photograph a filled sheet; it reads which boxes are ticked |
| `intake/upload.html` | read a partner's packet (PDF) into the same shapes |

The old cycle wizard — five steps, a HMAC join spine, a ledger and an impact view — has been
removed. It asked organizations to file a program *cycle*, which turned out to be the wrong
unit: what a program can actually sustain is a session sheet and a quarterly total, and what
the report needs is per-person attendance. `docs/standard-input.md` is the current contract.

### The quarterly standard

The standard is one submission per organization per quarter, built from whichever of these the
organization can actually sustain. All three now target the same Google workbook
in separate tabs; `docs/standard-input.md` describes the historical rollup contract.
The report/rollup still reads historical git records: new Sheet rows are not yet
included automatically.

| Path | Who it is for | Produces |
|---|---|---|
| **Session sheets + scan** (`intake/sheet.html`, `intake/scan.html`) | organizations that run a room | per-person attendance |
| **Quarterly totals** (`intake/simple.html#aggregate`) | organizations that already count their own numbers | one aggregate row per program-quarter, across one or many facilities |
| **Follow-up** (`intake/simple.html#followup`) | anyone who hears what happened after release | one outcome per participant ID |

The join key is the part that makes analytics possible at all: **first initial + birth year**
(`M78`), written on the sheet by the facilitator, pre-printed on every page. It is stable across
sessions and quarters, so attendance accumulates per person — and it is not a name, so the
ledger never holds one.

The sheet is generated, not hand-made: type a roster, print a page per session, tick the people
in the room. A QR code anchors the page; the scanner projects the sheet geometry into the
photograph and reads which boxes have ink. No OCR, no typing, no names digitised.

`scripts/standard_rollup.py` turns sessions into `data/intake/standard/rollup.json`: sessions
held, attendance, participants served, and **completions defined as 70% attendance of the
sessions that person was rostered for** — not 70% of the whole program, so somebody who joined
in week six is judged from week six. It also carries a flat `participants[]` list, which is what
a background check iterates later. Self-submitted quarterly totals ride alongside as `reported`
rather than replacing the computed figures, and are never added to them: a quarter is counted
once. The `packets[]` block is the fold — one quarter with every organization added together,
which is the number TPW hands on.

### The ID

The join key is **first initial + birth year** (`M78`) — written on the sheet by the
facilitator, pre-printed on every page, never a full name. It is stable across sessions and
quarters, so attendance accumulates per person; it is not a direct identifier, so the ledger
never holds one. That is the whole mechanism. The earlier HMAC-of-CDCR-number scheme was
more clever and less usable: it required a number organizations do not have and a key they
would have to keep.

### Storage: private master Google Sheet

There are **two independent Apps Script projects and endpoints**, not an upgrade
to the quarterly receiver:

- **Guided quarterly form:** keeps `form-demo/backend.js` and the existing project,
  source files, Script Properties and deployment exactly as the working baseline.
- **Additional forms:** deploy `admin/additional-forms/Code.gs` and its generated
  `Config.gs` in a new standalone Apps Script project. Give that project its own
  `SPREADSHEET_ID` property pointing to the **same master workbook**, and
  `ALLOW_UNSIGNED=true` for **synthetic demo data only**. Set the new `/exec` URL in
  `intake/backend.js` as `window.TPW_RECORDS_BACKEND_URL` (now configured). Do not
  reuse or replace the quarterly endpoint, or copy these files into its project.

`data/intake/additional_forms.json` declares the additional-form schema and approved
tabs. Run `python3 scripts/build_additional_forms.py` to compile it, together with
`simple_forms.json`, `facilities.json` and `sheets.json`, into the standalone
receiver's `Config.gs`; do not hand-edit generated configuration. See
[additional receiver setup](admin/additional-forms/README.md).

Typed Sessions, roster scans and photo-counted Sessions share the new receiver's
Session tab; quick aggregates and follow-ups use their own approved tabs. A confirmed
receipt is required before success; unchanged retries reuse their record ID. JSON
download is only a local backup, not a filing. Until the new endpoint is configured,
these forms must not fall back to the quarterly receiver or GitHub.

### Historical GitHub ledger (retained, no new quick-form writes)

The old files and scripts remain for historical reports and packet profiles. They
are not a second destination or fallback for new Session/Quarter/follow-up entries.
Historically every entry became one file plus one commit:

```
data/intake/records/session/<id>.json      one session sheet, per-person attendance
data/intake/records/aggregate/<id>.json    one quarterly total
data/intake/records/followup/<id>.json     one outcome
data/intake/standard/rollup.json           derived: the quarterly report input
data/intake/orgs/index.json                derived: orgs, programs, sites
data/intake/simple_forms.json              the quick forms' contract
```

The former quick-record routes (retired from those forms; still used by packet profiles):

| Route | Needs | What happens |
|---|---|---|
| **GitHub issue** | a GitHub account | the page opens a prefilled issue; `intake.yml` validates the payload by `kind`, commits the record, comments and closes |
| **Access token** | a fine-grained PAT with `contents:write`, kept in the browser | two Contents-API commits: the record, then the manifest |
| **JSON file** | nothing | download the exact file that would have been committed |

New quick-form submit buttons send directly to Sheets, with no GitHub account,
issue or token. The old issue workflow remains available for historical/packet
maintenance; it is not part of the Session submission path.

### Run it

```bash
cd intake && python3 -m http.server 8080     # → http://localhost:8080/intake/
```

```bash
python3 scripts/intake_build_seed.py   # rebuild seed.json + the synthetic spine
python3 scripts/intake_validate.py     # validate every committed cycle
python3 scripts/intake_profiles.py     # rebuild the organization registry
python3 scripts/intake_reindex.py      # validate + rebuild manifest and registry (what CI runs)
```

To submit through an issue without the browser:

```bash
ISSUE_BODY="$(cat my-cycle.md)" ISSUE_NUMBER=1 python3 scripts/intake_issue.py
```

### Open-source alternatives, and why the form is hand-rolled

The storage idea is not novel — several projects already treat git as a database. Each
was evaluated against the constraint that matters here: *no server, no database, and a form
an organization will actually fill in between sessions.*

| Project | Why not |
|---|---|
| [Formbricks](https://github.com/formbricks/formbricks) | The strongest OSS form platform available, but the v6 baseline is eight services — PostgreSQL, Redis, Cube, SpiceDB — sized for a 4 vCPU / 8 GB host. Contradicts the premise. |
| [Staticman](https://github.com/eduardoboucas/staticman) | Exactly the right pattern: receives a POST and commits it to GitHub. Requires hosting the Node service, which reintroduces the server. |
| [Decap](https://decapcms.org/) / [Sveltia CMS](https://sveltiacms.app/) | The correct model — content lives in git, no database — and worth adopting if TPW wants a CRUD admin over committed cycles. GitHub sign-in, however, still requires an OAuth proxy *or a pasted access token*, which is the mechanism already implemented here with less configuration. |
| [SurveyJS](https://surveyjs.io/) / [JSON Editor](https://github.com/json-editor/json-editor) | Capable schema-driven renderers, but the hard parts here are not fields: a printable page whose geometry a camera can invert, a QR anchor, and a tick detector. A form library would still need all three, plus a dependency and a theming layer. JSON Editor is in maintenance mode. |

The one place a library would genuinely improve on this code is the contract: the record
shapes are described by `simple_forms.json`, not [JSON Schema](https://json-schema.org/).
Converting would let `ajv` in the browser and `jsonschema` in CI validate the identical file
and let any renderer consume it. Worth doing if this outlives the hackathon.

### Honest limits

- **No outcome data exists here.** CDCR parole and recidivism records are not public at the
  person level, and the RIGHT 4.0 RFA requires an independent third party plus Office of
  Research approval for outcomes research. This builds the join-ready side of that
  arrangement, not the arrangement.
- **Attendance is what is measured, not presence of a person.** A participant who changes
  their ID between quarters looks like two people, and a shared ID looks like one.
- **The comparison is observational.** Completers differ from non-completers before they
  walk into the room. Any rate difference is a hypothesis for a funder, not a causal claim.
- **A follow-up is self-reported.** It is filed by the organization, not matched against
  CDCR records, and it is labelled as such in the rollup.

## Status

- [x] Source materials collected and summarized
- [x] `thetpw.org` mirrored locally → `site/`
- [x] Read the glossary + RFA end to end
- [x] Decide the prototype: a join-ready intake that feeds a report
- [x] Build: git-backed forms, issue→commit automation, no server
- [x] Standard: quarterly input per organization, per-person attendance, 70% completion rule
- [x] Paper: printable roster sheet with pre-printed IDs + camera scan (no OCR)
- [x] Demo: live at `/intake/`
- [ ] Pilot the sheet with one organization for a quarter, then tighten the ID convention

## Local site

`site/` is a static mirror of thetpw.org (all assets local, works offline):

```bash
cd site && python3 -m http.server 8787   # → http://localhost:8787
```
