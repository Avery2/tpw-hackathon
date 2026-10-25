# Organization program dashboard

Open `/members/` (**Members Login**), then choose a demo account: Org 1,
Org 2, or TPW View. This is demo access, **not authentication**; no credentials
are collected and it does not protect private data. `/dashboard/` opens the
last demo workspace in this tab, or returns to the member entry screen.

The website header and black TPW footer stay consistent across the home page,
login, dashboard, programs, check-in, guided form and intake tools. Inside a
workspace, the shared sidebar includes **Overview**, **Programs**, **Intake**,
and organization-specific **Quarterly check-in**. On mobile, **Menu** expands
these links. **Leave demo** clears the selected demo view, not form drafts.

`assets/site-shell.js` and `assets/site-shell.css` own this shared layout;
`assets/member-session.js` stores only the demo account key in sessionStorage.
Direct intake links still work without a demo session. Embedded guided forms
omit their own website chrome and resize inside the parent; printable rosters
omit website chrome without changing the letter-sized sheet geometry.

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

## Quarterly check-in

`checkin.html#org-1` (or `#org-2`) embeds the existing guided form with an
organization-specific prefill. It combines the latest known version of each program
because submissions may contain only part of the catalog. The most recent submission
sets the default next reporting quarter, including Q4-to-Q1 year rollover. Without a
prior record, the current quarter is used.

Program names, stable IDs, prisons and yards carry forward. Period-specific counts,
hours and dates reset; every program must be edited and completed before submission.
Users can also add/remove programs or change prisons/yards. Saving creates a new
submission with `orgId`, `reportingPeriod` and `previousSubmissionId`; old records are
never updated. TPW View remains an overview; check-ins are organization-specific.
