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
