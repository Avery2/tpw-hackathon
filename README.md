# TPW data collection tool

A form and dashboard for **Transformative Programming Works (TPW)**. Member organizations use the form each quarter to send TPW four numbers for every program they run in California state prisons: the program's name, how many people took part, the course hours, and how many people completed it. TPW staff see the combined totals on a dashboard.

It was built at Hack for Social Impact 2026 (24–25 October 2026) and handed over to TPW as a working prototype.

- **Live demo:** <https://www.averychan.site/tpw-hackathon/> (use made-up numbers only)
- **Status:** works end to end, but has no real sign-in yet. Read [`docs/go-live-checklist.md`](docs/go-live-checklist.md) before any member submits real numbers.

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

## Working on it with an AI coding agent

Start the agent in this folder. It will read [`AGENTS.md`](AGENTS.md), which has the rules and a map of the code, and points it at the technical guide.
