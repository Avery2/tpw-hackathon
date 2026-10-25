# Organization program dashboard

Open `/dashboard/`, then choose Org 1, Org 2, or TPW View.
The account chooser selects a view; it is not authentication.

- `orgs/org-1` and `orgs/org-2` contain organization names, descriptions, and a program catalog.
- Submission documents link to organizations with `orgId`. Older entries with only a matching `organization` name are also included, unless linked to a different ID.
- Program cards derive from submissions. Latest submission wins for each organization + program ID (or normalized name for older forms), avoiding double-counting updates.
- Org views query their own records. TPW View reads all submissions and labels each program's organization.
- The page shows loading, empty, and retry states. Refresh to fetch new submissions.

Sample data: two fictional organizations, four submissions, six programs. All fixtures
have `synthetic: true`, and program cards show a Sample data badge. The seed script
is explicit and create-only: `python3 dashboard/seed_sample_data.py`. Existing documents
are preserved. It is never run automatically by visitors. No security rules are changed.

The browser reuses the Firebase client from `form-demo/js/submissions.js`. No build step.

## Quarterly check-in (removed)

The separate check-in page (`checkin.html`) and its sidebar link are gone (25 Oct 2026).
Cutting form burden is a core goal, so prefilling from last quarter now happens inside the
form members already use: Log data's **Quarterly totals** form (`team-form/`) opens on
this quarter's numbers with the organization's prisons, yards and programs carried forward.
See `team-form/README.md`. `js/checkin-data.js` and the guided form's `?checkin=` mode in
`form-demo/` are left in place but nothing links to them.
