# TPW data collection tool

> ## ⚠️ **BEFORE ANY REAL MEMBER DATA GOES IN, FINISH THE [GO-LIVE CHECKLIST](docs/go-live-checklist.md).**
>
> **This is a working prototype, not a finished product. It is not safe for real member numbers until every item on that list is done.**

A form and dashboard for **Transformative Programming Works (TPW)**. Member organizations use the form each quarter to send TPW four numbers for every program they run in California state prisons: the program's name, how many people took part, the course hours, and how many people completed it. TPW staff see the combined totals on a dashboard.

It was built at Hack for Social Impact 2026 (24–25 October 2026) and handed over to TPW as a working prototype.

- **Live demo:** <https://www.averychan.site/tpw-hackathon/> (use made-up numbers only)
- **Authenticated Neon sandbox:** <https://www.averychan.site/tpw-hackathon/neon/> — real email/password sign-in, database-enforced organization access, direct Data API saves and scoped downloads. Access requires administrator assignment; synthetic data only. See [`database/README.md`](database/README.md).
- **Status:** the default Sheets demo still uses labels, not authentication. The opt-in Neon sandbox has real sign-in, but is not a production cutover. Read [`docs/go-live-checklist.md`](docs/go-live-checklist.md) before any member submits real numbers.

## How it works, in short

- **The website** is plain HTML, CSS and JavaScript, with no framework, no build step and no packages to install. It's published as static files (GitHub Pages today).
- **Submissions** go from the browser to a small **Google Apps Script** web app, which checks them and appends one row per program per yard to a **Google Sheet**. Today the Sheet and script belong to a demo Google account the hackathon team made (`tpwhackathondemodemo@gmail.com`), not to TPW. Moving them into TPW's own account is the first item on the go-live checklist.
- **The dashboard** reads the same Sheet back through the same Apps Script.

There's no server to run, no database besides the Sheet, and no API keys or passwords in the code.

The full explanation, including how to set up TPW's own copy of the Sheet and script, is in **[`docs/technical-guide.md`](docs/technical-guide.md)**.

## Where things are

| Path | What it is |
|---|---|
| `team-form/` | The form, and in `team-form/receiver/` the Google Apps Script back end |
| `intake/simple.html` | "Log data", the page members open, which shows the form |
| `team-dashboard/` | The dashboard pages |
| `assets/` | Code every page shares: header, member menu, demo sign-in, data loading |
| `data/demo/` | Made-up sample organizations for the demo |
| `docs/` | The technical guide, the go-live checklist and TPW's own documents |
| `site/` | An offline copy of thetpw.org, used only so the demo looks like TPW's site |

Older experiments (an earlier form and dashboard, and a filing system based on this repository) are still in the repository but not used. The technical guide, section 4, lists them.

## Run it on your computer

From this folder:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/>. Submitting from a local copy still writes to the live Google Sheet; the technical guide, section 9, says how to avoid that, and how to run the tests.

## Spreadsheet downloads

The dashboard offers a **program-history CSV** and a JSON download of the displayed view, plus a **New Google Sheet** shortcut (`sheets.new`). Import the CSV using **File → Import → Upload**, with formula conversion disabled. These are dated copies, not synchronized Sheets. The CSV contains program totals across yards and includes historical filings; don't add repeated filings together as if they were distinct programs. The local Neon path also offers its detailed per-yard export where that detail is available.

These controls do not add authentication to the existing demo. Real organization data still requires server-side access controls before launch.

## Local Neon prototype

An opt-in local version can read and write the isolated `avery-neon-connection` database branch, with CSV/JSON downloads for Google Sheets. It does **not** change the published Sheet-backed demo or write to the existing Google Sheet.

With Node 22+, `psql` and the signed-in Neon CLI installed:

```bash
node server/start-demo.mjs
```

Open <http://127.0.0.1:8830/intake/simple.html?account=org-1> or <http://127.0.0.1:8830/team-dashboard/#tpw>. Use made-up data only: demo accounts are not authentication, and the server must stay on loopback without a public tunnel. See [`server/README.md`](server/README.md) for behavior, tests and limitations, and [`docs/google-sheets-options.md`](docs/google-sheets-options.md) for the export/sync research.

## Working on it with an AI coding agent

Start the agent in this folder. It will read [`AGENTS.md`](AGENTS.md), which has the rules and a map of the code, and points it at the technical guide.
