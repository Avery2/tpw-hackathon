# Organization program dashboard

Open `/dashboard/`, then choose Org 1, Org 2, or TPW View.
The account chooser selects a view; it is not authentication.

- Org 1 and Org 2 are made-up sample organizations: names, descriptions and a program catalog, in `data/demo/dashboard-sample.json`.
- Submission documents link to organizations with `orgId`. Older entries with only a matching `organization` name are also included, unless linked to a different ID.
- Program cards derive from submissions. Latest submission wins for each organization + program ID (or normalized name for older forms), avoiding double-counting updates.
- Org views query their own records. TPW View reads all submissions and labels each program's organization.
- The page shows loading, empty, and retry states. Refresh to fetch new submissions.

Sample data: two fictional organizations and their made-up history. Program cards from them
always show a Sample data badge.

## Quarterly check-in (removed)

The separate check-in page (`checkin.html`) and its sidebar link are gone (25 Oct 2026).
Cutting form burden is a core goal, so prefilling from last quarter now happens inside the
form members already use: Log data's **Quarterly totals** form (`team-form/`) opens on
this quarter's numbers with the organization's prisons, yards and programs carried forward.
See `team-form/README.md`. `js/checkin-data.js` and the guided form's `?checkin=` mode in
`form-demo/` are left in place but nothing links to them.

## Where the data comes from

Since 25 Oct 2026 the dashboard reads TPW's Google Sheet through the receiver (`team-form/receiver/Dashboard.gs`), via `assets/dashboard-source.js`; Firebase is retired. The made-up Org 1 and Org 2 come from `data/demo/dashboard-sample.json` and always show a Sample data badge. No build step.
