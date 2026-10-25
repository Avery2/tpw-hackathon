# AGENTS.md

Signpost for AI agents working in this repo. Read this first, then `README.md` for the full design write-up.

## What this repo is

The team repo for **Transformative Programming Works (TPW)** at Hack for Social Impact 2026. TPW is a coalition of about 120 community-based organizations (CBOs) that run rehabilitation programs inside California state prisons.

The hackathon brief: TPW can only track *process* data (who enrolled, how many hours). Join that to parole and recidivism data so TPW can track *impact*.

What we've built is a static site with no server, hosted on GitHub Pages at <https://www.averychan.site/tpw-hackathon/>. Members open **Log data** (`intake/simple.html`) from a copy of TPW's website and submit their quarterly totals. Two Google Apps Scripts check each submission and add it to one private Google Sheet. Alongside sit a Dashboard and a Data page that show the sheet, and a printable report prototype. Firebase was retired on 25 Oct 2026, so the Google Sheet is the only record: both dashboards read it, with made-up sample organizations that are always badged as sample data. The older "git is the database" ledger is kept for history; new submissions don't go there. `VERSIONS.md` says which route is which.

## Read these first

1. `README.md`: problem statement, the intake design, the join spine, how to run everything, honest limits.
2. `docs/AGENTS.md`: what every source document is and when to read it.
3. `NOTES-data-recon.md`: deep profile of the real Collective Impact data, its quality problems, three ways to do the join, a schema proposal and open questions for TPW.
4. `docs/TPW Data Glossary Instructions.docx`: TPW's own field definitions for its current form. The intake schema is built from it.
5. `docs/tpw-language.md`: how TPW talks about incarcerated people, participants, members and programs, and its mission. Read it before you write any text a member or TPW will see.

## Map

| Path | What it is | Edit it? |
|---|---|---|
| `index.html` | Front page of the published site, in TPW's style. Links to Log data, the Dashboard, the copy of TPW's site and the source documents. | Yes |
| `assets/` | Code every member page shares. `site-shell.js`/`.css`: TPW's header and footer plus the **Log data · Dashboard · Data** links. `account-drawer.*`: a mock of TPW's account menu, with one new **Intake** entry. `member-session.js`: the one-click demo login, which stores only a demo account key and is **not** authentication. `mirror-nav.js`: makes the copy of TPW's site open that menu. Also fonts and images. | Yes |
| `members/` | The old member entry address; it now sends people straight to Log data. `test/` checks the demo login and the menu. | Rarely |
| `intake/` | **Log data.** `simple.html` is the page members use: one **Quarterly totals** tab (the guided form from `team-form/`). The follow-up form (`#followup`) and the older quick quarter form (`#aggregate`) have no tab. The Session tab, the printable roster (`sheet.html`), the sheet scanner (`scan.html`) and the packet reader (`upload.html`) were **removed on 25 Oct 2026** because they collected a coded ID per person; those three pages now only redirect to `simple.html`, and their code is in git history. `index.html` only redirects to `simple.html`. Plain JS in `intake/js/`, no build step. | Yes |
| `intake/backend.js` | Web address of the second Apps Script (`admin/additional-forms/`). Points at the live demo deployment, so a filing from your own computer is a real row. | Only when that deployment changes |
| `team-form/` | The team's guided **quarterly** form (`index.html`) → Google Sheet: one row per program, per yard, per prison. `backend.js` holds the quarterly Apps Script's web address (the live demo deployment, so local filings are real rows). `js/` has the quarter logic and the last-quarter prefill (`last-quarter.js`: given `?account=`, the form opens on this quarter's numbers with that organization's prisons, yards and programs carried forward). `test/` has the receiver, quarter and browser tests. | Yes |
| `team-form/receiver/` | The live quarterly Apps Script project, **all of it** (copied from the demo account's editor on 25 Oct 2026 and checked character for character): `Code.gs`, `Rows.gs`, `Session.gs`, `Sheet.gs` (writes to the tab "Submissions; comes from website form DO NOT RENAME"), `Dashboard.gs` (`?view=dashboard`: reads submissions back for the dashboards and prefill) and `appsscript.json`. Change these here first, test, then copy into Google; never edit the live project by hand. | Yes, carefully |
| `form-demo/` | Yuki's original guided form, **retired** with Firebase on 25 Oct 2026: `index.html` forwards to `team-form/`. | No |
| `admin/additional-forms/` | The **second Apps Script**, for follow-ups and the older quick quarter form. Since 25 Oct 2026 it refuses Session records, matching the site, which no longer offers that form. `Code.gs` is the engine, the same for every form. `Config.gs` is generated from `data/intake/additional_forms.json` by `scripts/build_additional_forms.py`. Writes its own tabs in the same workbook and never touches the quarterly tab. | `Code.gs` yes; `Config.gs` never by hand |
| `admin/sheetforms/`, `admin/steward/` | Older and unused: an earlier receiver and a staff console. Nothing posts to them. | Rarely |
| `dashboard/` | Yuki's original dashboard: Overview, Programs and the submissions pages (`submissions.html`, `submission-data.html`). Reads TPW's Google Sheet through `assets/dashboard-source.js`. | Yes |
| `team-dashboard/` | The team's dashboard, reading TPW's Google Sheet through `assets/dashboard-source.js`, plus the **Data** page (`raw-data.html`, TPW staff view only): the real Google Sheet, through Google's preview, so Google decides who can see it. | Yes |
| `assets/dashboard-source.js` | The one place the dashboards and the form's last-quarter prefill get data: TPW's Google Sheet via the receiver's `?view=dashboard`, plus the sample organizations. Tests: `team-form/test/dashboard.cjs`, `team-form/test/dashboard-source.mjs`; `team-form/test/dashboard-mutants.mjs` checks they catch planted bugs. | Yes |
| `data/demo/dashboard-sample.json` | Made-up sample organizations (Org 1, Org 2) and their submissions, exported once from the retired Firebase project. Always shown with a Sample data badge. Delete or empty it once real data is enough. | Yes |
| `VERSIONS.md` | Which route is which version of the form and dashboard, and where each one's data goes (all Google Sheet since Firebase was retired on 25 Oct 2026). | Yes |
| `data/intake/simple_forms.json` | Field definitions for the Session, follow-up and quick quarter forms. The page and the scripts both read it. | Yes, carefully |
| `data/intake/additional_forms.json` | Which kinds of filing the second Apps Script accepts, their rules, and the tab each one goes to. Rebuild `Config.gs` after changing it. | Yes, carefully |
| `data/intake/sheets.json` | The printable checkbox sheets the (now removed) scanner read off a photo. Still compiled into `Config.gs`. | Yes, carefully |
| `data/intake/facilities.json`, `config.json` | Prison list and site settings the forms read. `facilities.json` is also compiled into `Config.gs`. | Yes |
| `data/intake/documents.json` | What a complete application packet contains. Its page (`intake/upload.html`) was removed on 25 Oct 2026; the ledger scripts still read it. | Yes, carefully |
| `data/intake/schema.json`, `seed.json`, `example/` | The older cycle form's contract, the 2026 Collective Impact sheet imported as cycles (problems flagged, not fixed), and an example cycle. | `seed.json` no: rebuild with `intake_build_seed.py` |
| `data/intake/demo/join.json` | **Synthetic** participant spine and outcomes, for the demo only. Says so in its own first lines. | No: rebuild with `intake_build_seed.py` |
| `data/intake/cycles/`, `records/`, `orgs/`, `standard/` | The older GitHub ledger: manifests, the organization registry and the quarterly rollup. New filings go to the Google Sheet, not here. | No: rebuilt by the scripts and the bot |
| `data/public/` | Public data layer: CDCR programs by prison, RIGHT 4.0 Attachment A grid, a facility-name crosswalk, the TPW member list. `raw/` caches the source page. | No: rebuild with `build_public_data.py` |
| `data/tpw-collective-impact.csv` | The real TPW form data (Data Entry Sheet tab) as CSV. Input to the seed and the report. | Only when re-pulling the live sheet |
| `data/tpw-collective-impact-form.xlsx`, `data/snapshots/` | Dated snapshots of TPW's live Google Sheet. | No: add a new dated snapshot instead |
| `scripts/` | Python, standard library only. `build_additional_forms.py` builds the second script's `Config.gs`. `build_site.py` builds the published site. `build_public_data.py` rebuilds `data/public/`. `standard_rollup.py` and the `intake_*.py` scripts run the older ledger. `test_*.py` test the first two. Each file's docstring explains it. | Yes |
| `report/build.py` | Builds a print-ready "Collective Impact Report 2026" HTML and PDF from the CSV, not from new filings. Needs headless Chrome for the PDF. Working files go in `report/work/`, which is gitignored. | Yes |
| `report/assets/` | TPW logos and preview images for the report. | Rarely |
| `docs/` | Source documents from TPW, CDCR and the hackathon, plus our write-ups. See `docs/AGENTS.md`. | Add, don't rewrite sources |
| `site/` | Offline copy of thetpw.org (HTML plus all assets). The member pages live inside it on the published site: `build_site.py` adds one script to the published copy so its Members Login opens our account menu. The files here stay untouched. | No: it's a copy of TPW's site. For the text, read `docs/tpw-website-text/` |
| `.github/workflows/pages.yml` | Publishes the website on every push to `main`: runs `scripts/test_build_site.py`, builds with `scripts/build_site.py`, deploys to GitHub Pages. | Carefully |
| `.github/workflows/tests.yml` | Runs every test suite on every push, to any branch, and never publishes anything. A red cross next to a commit on GitHub means a step failed; click it to see which. `members/test/browser.mjs` is left out until it passes again. When you add a test file, add a step for it here. | Yes |
| `.github/workflows/intake.yml` | The older ledger bot: turns a labelled GitHub issue into a validated commit, and re-validates and re-indexes on every push to `main` that touches `data/intake/`. Only the packet upload still files this way. | Carefully |
| `NOTES-data-recon.md` | Analysis notes (see above). | Yes |

## Rules

- **No personal data, ever.** This repo is public. Never commit participant names, CDCR numbers, full dates of birth or anything else that identifies a person. Participants are tracked by a short ID: first initial plus birth year, like `M78`, or an organization's own stable IDs. The facilitator writes it next to each name on the paper sheet, and the scanner never reads the name column, so only the ID reaches the Google Sheet. `docs/standard-input.md` has the full rules. The older HMAC tokens in `data/intake/schema.json`, `data/intake/demo/join.json` and `report/build.py` belong to the retired cycle form and the synthetic demo; don't build new work on them.
- **Use TPW's words.** In the app, forms, dashboard, docs and commit messages, write the way TPW writes: "incarcerated people" (never "inmates", "prisoners" or "offenders"), "participants", "members" or "CBOs", "programs" with American spelling, and "submit". `docs/tpw-language.md` has the full list, with the evidence and the few places the avoided words are fine (names and quotations).
- **Keep synthetic and real apart.** The participant spine and outcomes in `data/intake/demo/join.json` are made up. The activity figures from the Collective Impact sheet are real. Label synthetic numbers wherever they appear, and never present them as evidence of impact.
- **Protect member organizations.** Members may fear retaliation from CDCR. Anything aimed at TPW or the public that shows numbers should show combined figures, not one organization's, unless TPW says otherwise. Cohorts under five are aggregated before release, per `schema.json`.
- **Don't hand-edit derived files.** Manifests, the registry, the seed and the public CSVs are all rebuilt by scripts. Fix the input or the script, then rebuild.
- **No code reviews, but ask before changing someone else's code.** The team pushes straight to `main`. If you're about to modify code a teammate wrote (`git log -- <path>` shows who), stop and tell the human you're working for, so they can go and talk to that person first.
- **Pull before you push.** The CI workflow commits to `main` as `tpw-intake-bot` after pushes that touch `data/intake/`, and teammates are pushing during the hackathon.
- **Keep it buildless and dependency-free.** No npm, no bundler, no third-party Python packages. TPW staff have to be able to keep this running after the hackathon.
- **Check numbers before they reach TPW or the judges.** Some headline figures disagree between sources. `NOTES-data-recon.md` lists the known problems in the data.

## Commands

```bash
python3 -m http.server 8080                 # from the repo root, then open http://localhost:8080/intake/
python3 scripts/intake_reindex.py           # validate everything, rebuild manifests and registry (what CI runs)
python3 scripts/intake_validate.py          # validate every committed cycle
python3 scripts/intake_build_seed.py        # rebuild seed.json and the synthetic spine from the CSV
python3 scripts/intake_profiles.py          # rebuild the organization registry
python3 scripts/build_public_data.py        # re-fetch and rebuild data/public/
python3 report/build.py                     # build the report HTML and PDF
node team-form/test/receiver.cjs            # quarterly Apps Script checks, Google faked
node admin/additional-forms/test.cjs        # second Apps Script checks, Google faked
python3 scripts/test_additional_forms.py    # tests for the Config.gs builder
python3 scripts/build_additional_forms.py   # rebuild admin/additional-forms/Config.gs (--check tests it's current)
```

GitHub runs the tests on every push. `.github/workflows/tests.yml` lists every test command it runs. The browser tests need the repo served first: `python3 -m http.server 8826 --bind 127.0.0.1` from the repo root, then `node team-form/test/browser.mjs` in another terminal.

## Outside the repo

- TPW's live Collective Impact Google Sheet and the hackathon pack are linked in the Resources table in `README.md`.
- Judging: impact 30%, live demo 35%, innovation 20%, storytelling 15%. Devpost deadline is 3pm on Sunday 25 October 2026.
