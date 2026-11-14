# AGENTS.md

Starting point for AI coding agents working in this repository. Read this, then [`docs/technical-guide.md`](docs/technical-guide.md) for anything involving the Google Apps Script, the Google Sheet or publishing.

## What this repository is

A data collection tool for **Transformative Programming Works (TPW)**, a coalition of about 120 community-based organizations that run rehabilitative programs inside California state prisons. Each quarter, member organizations use the form to submit, for every program at every prison and yard: the program's name, participants enrolled, course hours and participants completed. TPW staff see the combined totals on a dashboard.

How it fits together:

- A static website: plain HTML, CSS and JavaScript modules, no framework, no build step, no npm packages. Published to GitHub Pages by `.github/workflows/pages.yml`.
- The form (`team-form/index.html`, shown inside `intake/simple.html`) POSTs each submission to a Google Apps Script web app, whose address is in `team-form/backend.js`.
- The Apps Script (source in `team-form/receiver/`) checks the submission and appends one row per program per yard to one tab of a Google Sheet.
- The dashboards (`team-dashboard/`) read the Sheet back through the same web app (`?view=dashboard`), via `assets/dashboard-source.js`.

It's a prototype: sign-in is a demo, not security. `docs/go-live-checklist.md` lists what must change before real member data goes in.

Today the Sheet and both Apps Scripts belong to `tpwhackathondemodemo@gmail.com`, a demo Google account the hackathon team made, not to TPW. An agent can't reach them: a person signed in to that account copies code in and deploys. Don't confuse it with the website's one-click "demo accounts" (Org 1, Org 2, TPW staff), which are only labels in the browser. Technical guide, section 3.1, lists every account the tool runs on.

## Map

| Path | What it is | Edit it? |
|---|---|---|
| `team-form/index.html` | The form: HTML, CSS and one JavaScript module in one file. | Yes |
| `team-form/backend.js` | The Apps Script web app's address. | Only when the deployment changes |
| `team-form/js/` | `reporting-period.js` (the current quarter in California time) and `last-quarter.js` (last quarter's answers as a starting point). | Yes |
| `team-form/receiver/` | **The Apps Script back end**, the master copy of every file in the live project: `Code.gs`, `Rows.gs`, `Sheet.gs`, `Dashboard.gs`, `Session.gs`, `appsscript.json`. Change and test here, then copy into Google and deploy a new version (technical guide, section 5.10). | Yes, carefully |
| `team-form/test/` | Tests for the back end (Google faked), the quarter logic, the dashboard data and the form in a browser. | Yes |
| `intake/simple.html`, `intake/js/simple.js` | "Log data": TPW's header with the form in a frame. | Yes |
| `team-dashboard/` | Dashboard pages: Overview, Programs, Organizations (TPW staff), Submissions, Data (TPW staff; the Sheet through Google's preview). Logic in `team-dashboard/js/`. | Yes |
| `assets/` | Shared code. `site-shell.js`: header, footer, member bar. `member-session.js`: the demo sign-in (not authentication). `account-drawer.js`: the account menu. `dashboard-source.js`: the one place dashboards and the form's prefill load data. `mirror-nav.js`: wiring for the offline copy of thetpw.org. | Yes |
| `data/demo/dashboard-sample.json` | Made-up sample organizations (Org 1, Org 2), always badged as sample data. | Yes |
| `data/public/tpw-members.csv` | TPW's public member list; the form suggests these names. | Yes |
| `report/` | Prebuilt annual report PDFs linked from the member bar. | Rarely |
| `site/` | Offline copy of thetpw.org, for the demo only. `scripts/build_site.py` adds one script to the published copy; the files here stay untouched. | No |
| `scripts/build_site.py` | Builds the folder that gets published. | Carefully |
| `.github/workflows/pages.yml` | Publishes the site on every push to `main`. | Carefully |
| `.github/workflows/tests.yml` | Runs every test on every push, to any branch. When you add a test file, add a step here. | Yes |
| `docs/` | The technical guide, the go-live checklist and TPW's own source documents. See `docs/AGENTS.md`. | Yes |

**Older parts, not used by the live tool:** `form-demo/` and `dashboard/` (forwarding pages only), `admin/sheetforms/` and `admin/steward/` (unused), the retired `intake/` pages, `data/intake/`, `scripts/intake_*.py`, `scripts/standard_rollup.py`, `scripts/build_additional_forms.py` and `.github/workflows/intake.yml`. Don't build new work on them. Technical guide, section 4, has the details.

## Rules

- **Never send a test POST to the live Apps Script address.** There is no dry run: every valid POST writes real rows to TPW's Sheet. Test the back end with `node team-form/test/receiver.cjs` and the form with the browser tests, which fake Google. A local copy of the site also posts to the live address, so set `window.TPW_BACKEND_URL = ''` in `team-form/backend.js` while testing by hand, and don't commit that.
- **The `.gs` files in `team-form/receiver/` are the master copy.** Change them here, run the tests, then the human copies them into the Apps Script editor and deploys a new version on the same address.
- **Don't rename the Sheet's tab or its column headings**, and don't write to column S (Additional data) by hand. The script finds columns by heading name.
- **No personal information, ever.** The tool collects counts only. Never put participant names, CDCR numbers, dates of birth or anything else that identifies a person into code, tests, sample data or commits.
- **Combined figures in anything public.** Members may fear retaliation from CDCR, so anything shown outside TPW adds organizations together and never shows one organization's numbers, unless TPW decides otherwise.
- **Label made-up data.** Sample and test data is always badged on screen and never presented as real results.
- **Keep it buildless and dependency-free.** No npm packages, no frameworks, no bundler, Python standard library only. TPW has to be able to keep it running without a developer.
- **When something breaks, say so in plain words.** Error messages are for small organizations' staff, not developers: say what happened, that their answers are still there, and who to contact.
- **Bump the version token** (`?v=...`) on a script's address wherever it's loaded when you change that script, so browsers don't keep the old copy.

## Wording

Write the way TPW writes, in the app, the docs and commit messages:

- "incarcerated people" or "people in California prisons", never "inmates", "prisoners" or "offenders"
- "formerly incarcerated people", "people with lived experience"
- "participants" for people in a program; "members" or "member organizations" for TPW's members
- "programs", "facilities", "yards"; American spelling throughout
- "submit" and "submission"

## Commands

```bash
python3 -m http.server 8080                    # serve the site at http://localhost:8080/
node team-form/test/receiver.cjs               # Apps Script back end, Google faked
node team-form/test/dashboard.cjs              # dashboard feed (Dashboard.gs), Google faked
node team-form/test/reporting.mjs              # quarters and last quarter's prefill
node --test team-form/test/dashboard-source.mjs   # dashboards' data loader
node team-form/test/dashboard-mutants.mjs      # dashboard tests catch planted bugs
python3 scripts/test_build_site.py             # the publishing build
python3 scripts/build_site.py --output /tmp/tpw-site   # build the published folder (must be empty, outside the repo)
```

Browser tests need Chrome and a local server first: `python3 -m http.server 8826 --bind 127.0.0.1`, then `node team-form/test/browser.mjs` in another terminal. `.github/workflows/tests.yml` lists everything GitHub runs. Node 22 or newer.
