# team-dashboard/: the dashboard

The dashboard pages. Every page gets its data from `loadDashboard` in `../assets/dashboard-source.js`, which reads the Google Sheet through the Apps Script's `?view=dashboard` feed and adds the made-up sample organizations from `../data/demo/dashboard-sample.json`. Sample organizations, and Sheet submissions marked as test data, carry a **Sample data** badge.

| Page | What it shows | Who sees the link |
|---|---|---|
| `index.html` (Overview) | Totals, the participants chart, credit-day and cost estimates | Members (their own organization) and TPW staff (everyone) |
| `programs.html` | Every program | Members and staff |
| `organizations.html` | One card per organization, each opening that organization's overview | TPW staff |
| `submissions.html`, `submission-data.html` | Who has submitted this quarter, and each submission's details | Members and staff |
| `raw-data.html` (Data) | The Google Sheet itself, through Google's preview, with an **Open in Google Sheets** link | TPW staff, and only if the Sheet is shared with their Google account |

Which organization's view to show comes from the address (`#org-1`, `#org-2`, `#tpw`) or the demo sign-in. That's a demo, not security: the pages themselves aren't protected. See the go-live checklist.

The page logic is in `js/`: `main.js` (Overview), `data.js` (the latest submission for each program wins; the chart's history), `chart.js`, `cards.js`, `rac.js` (credit-day and cost estimates), `programs.js`, `organizations.js`, `submissions-page.js`, `submission-tracker.js`, `submission-data.js`, `layout.js` and `loading.js`.

More detail: [`../docs/technical-guide.md`](../docs/technical-guide.md), sections 5.7 and 7.5.
