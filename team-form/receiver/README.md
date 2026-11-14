# team-form/receiver/: the Google Apps Script back end

These six files are the master copy of the Google Apps Script project that receives form submissions, writes them to the Google Sheet, and reads them back for the dashboards.

| File | What it does |
|---|---|
| `appsscript.json` | Project settings: time zone, the Google Sheets API, permissions, and how the web app runs |
| `Code.gs` | Entry points (`doGet`, `doPost`) and the save, step by step |
| `Rows.gs` | The rules: checks a submission and turns it into Sheet rows. Holds the column headings, the prison list and the limits. |
| `Sheet.gs` | Which Sheet and tab, creating the tab if missing, appending rows |
| `Dashboard.gs` | The dashboard feed (`?view=dashboard`) |
| `Session.gs` | Sign-in passes, ready for when real sign-in is built |

**How to change it:** edit the files here, run the tests below, copy the changed files into the Apps Script editor, then deploy a new version on the same address (**Deploy** → **Manage deployments** → **Edit** → **Version: New version** → **Deploy**). Saving in the editor alone doesn't change what the live address runs.

**Never test by sending a POST to the live address.** Every valid POST writes real rows.

```bash
node team-form/test/receiver.cjs      # the save path, Google faked
node team-form/test/dashboard.cjs     # the dashboard feed, Google faked
```

Everything else (the settings it needs, the Sheet's columns, the requests and replies, setting up a fresh copy in TPW's account, and the limits) is in [`../../docs/technical-guide.md`](../../docs/technical-guide.md), sections 5 and 6.
