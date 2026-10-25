# AGENTS.md

Signpost for AI agents working in this repo. Read this first, then `README.md` for the full design write-up.

## What this repo is

The team repo for **Transformative Programming Works (TPW)** at Hack for Social Impact 2026. TPW is a coalition of about 120 community-based organizations (CBOs) that run rehabilitation programs inside California state prisons.

The hackathon brief: TPW can only track *process* data (who enrolled, how many hours). Join that to parole and recidivism data so TPW can track *impact*.

What we've built is a static site with no server, hosted on GitHub Pages at <https://www.averychan.site/tpw-hackathon/>. Members open **Log data** (`intake/simple.html`) from a copy of TPW's website and file either their quarterly totals or one session's attendance. Two Google Apps Scripts check each filing and add it to one private Google Sheet. Alongside sit a Dashboard (still showing Firebase sample data, not new filings), a Data page that shows the sheet, and a printable report prototype. The older "git is the database" ledger is kept for history; new filings don't go there.

## Read these first

1. `README.md`: problem statement, the intake design, the join spine, how to run everything, honest limits.
2. `docs/AGENTS.md`: what every source document is and when to read it.
3. `NOTES-data-recon.md`: deep profile of the real Collective Impact data, its quality problems, three ways to do the join, a schema proposal and open questions for TPW.
4. `docs/TPW Data Glossary Instructions.docx`: TPW's own field definitions for its current form. The intake schema is built from it.

## Map

| Path | What it is | Edit it? |
|---|---|---|
| `index.html` | Front page of the published site, in TPW's style. Links to Log data, the Dashboard, the copy of TPW's site and the source documents. | Yes |
| `assets/` | Code every member page shares. `site-shell.js`/`.css`: TPW's header and footer plus the **Log data · Dashboard · Data** links. `account-drawer.*`: a mock of TPW's account menu, with one new **Intake** entry. `member-session.js`: the one-click demo login, which stores only a demo account key and is **not** authentication. `mirror-nav.js`: makes the copy of TPW's site open that menu. Also fonts and images. | Yes |
| `members/` | The old member entry address; it now sends people straight to Log data. `test/` checks the demo login and the menu. | Rarely |
| `intake/` | **Log data.** `simple.html` is the page members use: a **Quarterly totals** tab (the guided form from `form-demo/`) and a **Session** tab. The follow-up form (`#followup`) and the older quick quarter form (`#aggregate`) have no tab. `sheet.html` prints a session roster with participant IDs already on it; `scan.html` reads which boxes are ticked from a photo of one. `upload.html` reads a partner's application packet (still the older GitHub route). `index.html` only redirects to `simple.html`. Plain JS in `intake/js/`, no build step. | Yes |
| `intake/backend.js` | Web address of the second Apps Script (`admin/additional-forms/`). Points at the live demo deployment, so a filing from your own computer is a real row. | Only when that deployment changes |
| `form-demo/` | The guided **quarterly** form (`index.html`): one row per program, per yard, per prison. `backend.js` holds the quarterly Apps Script's web address (the live demo deployment, so local filings are real rows). `js/` has the quarter logic and the dashboard's Firebase client. `test/` has the receiver, quarter and browser tests. | Yes |
| `form-demo/receiver/` | The quarterly Apps Script's `Code.gs`, and how to update the live project. **Only `Code.gs` is here.** The deployed project also runs `Rows.gs` and `Session.gs` (on branch `sheet-firebase`), `Sheet.gs` (only in the Google project, writes the "DO NOT RENAME" tab) and an unused `Dashboard.gs`. Bring them into the repo before relying on it to rebuild the script. | Carefully |
| `admin/additional-forms/` | The **second Apps Script**, for Sessions, follow-ups and the older quick quarter form. `Code.gs` is the engine, the same for every form. `Config.gs` is generated from `data/intake/additional_forms.json` by `scripts/build_additional_forms.py`. Writes its own tabs in the same workbook and never touches the quarterly tab. | `Code.gs` yes; `Config.gs` never by hand |
| `admin/sheetforms/`, `admin/steward/` | Older and unused: an earlier receiver and a staff console. Nothing posts to them. | Rarely |
| `dashboard/` | `index.html` is the **Dashboard**: charts, totals and credit estimates from **Firebase sample data**, not from new filings. `raw-data.html` is the **Data** page: the real Google Sheet, through Google's preview, so Google decides who can see it. `programs.html`, `checkin.html`, `js/` and the `seed_*.py` scripts belong to the Firebase dashboard. | Yes |
| `data/intake/simple_forms.json` | Field definitions for the Session, follow-up and quick quarter forms. The page and the scripts both read it. | Yes, carefully |
| `data/intake/additional_forms.json` | Which kinds of filing the second Apps Script accepts, their rules, and the tab each one goes to. Rebuild `Config.gs` after changing it. | Yes, carefully |
| `data/intake/sheets.json` | The printable checkbox sheets the scanner reads off a photo: which columns, in which order. Also compiled into `Config.gs`. | Yes, carefully |
| `data/intake/facilities.json`, `config.json` | Prison list and site settings the forms read. `facilities.json` is also compiled into `Config.gs`. | Yes |
| `data/intake/documents.json` | What a complete application packet contains, for `intake/upload.html`. | Yes, carefully |
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
| `.github/workflows/intake.yml` | The older ledger bot: turns a labelled GitHub issue into a validated commit, and re-validates and re-indexes on every push to `main` that touches `data/intake/`. Only the packet upload still files this way. | Carefully |
| `NOTES-data-recon.md` | Analysis notes (see above). | Yes |

## Rules

- **No personal data, ever.** This repo is public. Never commit participant names, CDCR numbers, dates of birth or anything else that identifies a person. The join uses an HMAC token made in the browser from an organization key. The key never leaves the browser and must never be committed.
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
node form-demo/test/receiver.cjs            # quarterly Apps Script checks, Google faked
node admin/additional-forms/test.cjs        # second Apps Script checks, Google faked
python3 scripts/test_additional_forms.py    # tests for the Config.gs builder
python3 scripts/build_additional_forms.py   # rebuild admin/additional-forms/Config.gs (--check tests it's current)
```

## Outside the repo

- TPW's live Collective Impact Google Sheet and the hackathon pack are linked in the Resources table in `README.md`.
- Judging: impact 30%, live demo 35%, innovation 20%, storytelling 15%. Devpost deadline is 3pm on Sunday 25 October 2026.
