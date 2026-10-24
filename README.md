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
intake/       the forms: full cycle intake + three quick forms, no build step, no server
data/intake/  the ledger — schema, facilities, seed import, cycles, quick records, registry
scripts/      seed importer, validator, issue ingester, reindexer, profile deriver
docs/         TPW + CDCR source documents
data/         snapshots of the Collective Impact form
site/         local mirror of thetpw.org (offline copy, for reference and extension)
```

## The intake system

**Live:** <https://www.averychan.site/tpw-hackathon/intake/>

A form-intake system that runs entirely in this stack. The browser holds the schema and
the arithmetic; GitHub holds the data. There is no database, no API key, and no service
that can go down between the form and the record.

The reason to rebuild the form at all is the join. The Collective Impact sheet can describe
a program cycle but cannot name a person, so nothing in it can ever meet parole or
recidivism data. This version adds exactly one thing: a **pseudonymous participant spine**.

### What it captures

The June 2026 glossary, enforced as code. `data/intake/schema.json` is the single source of
truth — the browser and the CI validator both read it, so they cannot drift apart.

- Conditional requirements: a `Completed` cycle needs an end date and completions; a
  `Planned` one must not carry them.
- Columns L and M are computed, never stored wrong. The `#VALUE!` class of bug is
  structurally impossible.
- The sheet's warts are preserved as flags, not repaired: `TBD`, sample rows, duplicate
  cycles, and an 18-month "cycle" all surface in the ledger with a reason attached.
- The proposed rename in the glossary (`Total Programming hours` → `Course hours per
  participant`) is applied, and the label now enforces its own meaning.
- Column K (`Funded by RIGHT 2.0`) is generalized to a funding-source field instead of
  being deleted, as the glossary left open.

### The registry — the half that repeats

Nine of the form's fifteen fields are the same on an organization's second cycle as its first:
name, program, facility, yard, course hours, funding source, and who signs for it. Asking again
is not diligence — it is a way to collect three spellings of one organization, and
`cycleKey()` folds facility, yard, program and date into the record's identity, so that drift
silently splits an organization in two. The seed already shows the multiplier: 37 cycles from
3 organizations.

So the registry is derived, not entered. `scripts/intake_profiles.py` groups the seed plus every
committed cycle by organization and program and writes `data/intake/orgs/index.json`.
`intake_reindex.py` runs it on every push, so a profile is a function of the ledger and cannot
disagree with it. Editing a profile by hand edits a cache; correcting a cycle fixes it.

`#/orgs` reads that registry. Picking a site starts a cycle with the known values already filled,
and the next cycle after a submission carries them forward. Nothing is guessed: hours and funding
are the *mode* of past cycles, the contact is whoever signed most recently, and an organization
with twenty-five sites gets no facility filled in — a wrong yard is worse than an empty one.

Because the identity lives in a committed file rather than a URL, there is no prefill link to forge,
and the join spine stays intact: a third-party form host could not derive the token in the
submitter's browser in the first place.

### Three smaller forms

The full cycle intake is the right thing for a quarterly filing and the wrong thing for a
Tuesday. `intake/simple.html` is the twenty-second version — one screen, no steps, no
derived fields, no account:

| Form | Fields | Writes |
|---|---|---|
| **Weekly** | program, facility, week ending, sessions held, people at sessions, a note | `records/weekly/` |
| **Totals** | organization, program, facility, period, people served, people completed | `records/aggregate/` |
| **Follow-up** | participant token, release date, and what happened since | `records/followup/` |

The weekly log is the leading indicator: sessions and attendance, submitted while the week
is still fresh, which is the only cadence most program staff will actually sustain. The
totals form is for organizations that already keep their own spreadsheets and only want to
hand over a period's numbers — it feeds the same activity totals without asking for
per-cycle detail. The follow-up form closes the loop the whole project exists for: one
token, one release date, one outcome, recorded by the organization when they hear it,
months before CDCR could ever match it.

Entries are validated against `data/intake/simple_forms.json`, land as one small JSON file
each, and are indexed alongside the cycles. The issue route, download, and token commit all
work unchanged — the workflow routes by `kind`.

### The join spine
For each enrollee the form derives a 128-bit token in the browser:

```
token = HMAC-SHA256(organization key, CDCR number)[0:32 hex]
```

The key never leaves the machine and is never committed. The identifier is hashed as you
type and discarded. What reaches the repository is a token, a cycle id, `completed` or
`did_not_complete`, and — once matched — a release date and days-to-conviction. No name,
no CDCR number, no date of birth.

Same key plus same number always yields the same token, so a person's participation
accumulates across cycles and years with nothing but a hex string. Whoever holds the
organization key can recompute the mapping; nobody else can. That asymmetry is the whole
security model, and it is why the key is the artifact to protect.

### Storage: git is the database

Every submission becomes one file plus one commit.

```
data/intake/cycles/<id>.json     one program cycle, validated
data/intake/cycles/index.json    manifest the site reads
data/intake/orgs/index.json      derived registry: orgs, programs, sites, contacts
data/intake/seed.json            the 2026 sheet import (37 cycles, warts intact)
data/intake/demo/join.json       SYNTHETIC spine, for demonstration only
```

Three ways in, all of them GitHub:

| Route | Needs | What happens |
|---|---|---|
| **GitHub issue** | a GitHub account | the form opens a prefilled issue; `intake.yml` validates the payload, commits the cycle, comments and closes |
| **Access token** | a fine-grained PAT with `contents:write`, kept in the browser | two Contents-API commits: the cycle file, then the manifest |
| **JSON file** | nothing | download the exact file that would have been committed |

Plus a device-local queue for demos and offline drafting. Drafts autosave; nothing is
transmitted until the submitter picks a route.

### The impact view

`#/impact` computes the outcome side from the join. It shows the funnel honestly —
enrolled → token → released → window matured → observed — and evaluates 12, 24 and 36
month windows separately, because a cohort that is too young should read as *not yet*,
never as *clean*. Rows with fewer than 50 matured records are dimmed rather than
interpreted.

**The spine shipped here is synthetic.** It exists so the join can be demonstrated and
reviewed; `data/intake/demo/join.json` says so in its own first line, and the UI labels it
everywhere. The activity figures, by contrast, are the real 2026 sheet.

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
was evaluated against the constraint that matters here: *no server, no database, and a
participant key that must never leave the browser.*

| Project | Why not |
|---|---|
| [Formbricks](https://github.com/formbricks/formbricks) | The strongest OSS form platform available, but the v6 baseline is eight services — PostgreSQL, Redis, Cube, SpiceDB — sized for a 4 vCPU / 8 GB host. Contradicts the premise. |
| [Staticman](https://github.com/eduardoboucas/staticman) | Exactly the right pattern: receives a POST and commits it to GitHub. Requires hosting the Node service, which reintroduces the server. |
| [Decap](https://decapcms.org/) / [Sveltia CMS](https://sveltiacms.app/) | The correct model — content lives in git, no database — and worth adopting if TPW wants a CRUD admin over committed cycles. GitHub sign-in, however, still requires an OAuth proxy *or a pasted access token*, which is the mechanism already implemented here with less configuration. |
| [SurveyJS](https://surveyjs.io/) / [JSON Editor](https://github.com/json-editor/json-editor) | Capable schema-driven renderers, but none do derived formula columns, status-conditional requirements, or the in-browser HMAC token tool. Using one means writing custom widgets anyway — the work below — plus a dependency and a theming layer. JSON Editor is also in maintenance mode. |

The one place a library would genuinely improve on this code is the contract itself:
`schema.json` is a bespoke format, not [JSON Schema](https://json-schema.org/). Converting
it would let `ajv` in the browser and `jsonschema` in CI validate the identical file, and
would let any form renderer consume it. That is the follow-up worth doing if this outlives
the hackathon; the validator here is 130 lines and already shared, so the switch buys
interoperability rather than correctness.

### Honest limits

- **No outcome data exists here.** CDCR parole and recidivism records are not public at the
  person level, and the RIGHT 4.0 RFA requires an independent third party plus Office of
  Research approval for outcomes research. This builds the join-ready side of that
  arrangement, not the arrangement.
- **The comparison is observational.** Completers differ from non-completers before they
  walk into the room. Any rate difference is a hypothesis for a funder, not a causal claim.
- **Rotation breaks continuity.** Tokens are only stable while the organization key is.
- Cohorts smaller than five are aggregated before release, per `schema.json`.

## Status

- [x] Source materials collected and summarized
- [x] `thetpw.org` mirrored locally → `site/`
- [x] Read the glossary + RFA end to end
- [x] Decide the prototype: a join-ready intake that feeds an impact view
- [x] Build: schema-driven form, git-backed ledger, issue→commit automation
- [x] Registry: recurring fields derived from the ledger, filled in per organization
- [x] Demo: live at `/intake/` — form, ledger, registry, and the join with 12/24/36-month windows
- [ ] Swap the synthetic spine for real participant tokens (needs the data-sharing path)

## Local site

`site/` is a static mirror of thetpw.org (all assets local, works offline):

```bash
cd site && python3 -m http.server 8787   # → http://localhost:8787
```
