# Guided form → master Google Sheet

Serve the repository with `python3 -m http.server 8787` and open
`http://localhost:8787/team-form/`. The same form is embedded in the intake's
**Form Demo** tab. No build or package install is needed.

**Finish and submit** posts to the existing Apps Script web app configured in
`backend.js`. Its `SPREADSHEET_ID` points at the chosen master workbook:
<https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/edit>.
The spreadsheet stays private. The `/exec` URL is public browser configuration,
not a credential. This frontend deployment does not modify the Google project,
its properties, permissions, or deployed script version.

One row is filed per program × prison × yard. The current California quarter/year
is inferred, not asked; check-in prefill also stays in the current quarter. Status
is **In Progress** or **Completed**, not Planned. Optional program context is
limited to 2,000 characters, with a reminder not to include personal information.
Participants and completions are entered separately for each yard, avoiding
duplicated program totals. Submission
success is shown only after the real receiver returns `ok: true`; its row count
and reference are displayed. Errors leave the entries available for retry. The
client reuses its submission ID on retry, but deduplication requires the deployed
receiver to support it; the older deployed receiver has not been verified to do so.

## Receiver compatibility

The working quarterly Apps Script project, source files, properties, endpoint and
deployment stay unchanged for the additional-forms migration. The existing
[receiver documentation](receiver/README.md) describes the quarterly baseline,
not an instruction to add Session handling to it. That receiver saves context to the existing
**Notes** column and automatically adds **Additional data (JSON)** to preserve
future payload fields. It works with both historical row-builder contracts and
maps columns by header, allowing insertion/reordering without shifting data. No
existing tab or column is renamed. Current quarter and allowed statuses are also
enforced on the server after that update.

Until deployed, an older receiver can accept submissions without context. If
context is nonempty, the form checks capabilities and refuses to silently lose it.
The comments remain available for retry after the receiver is upgraded.

## Deliberate demo scope

- **No emailed-code auth is merged or enabled by this frontend change.** The
  existing receiver's `ALLOW_UNSIGNED=true` test mode permits submissions and marks
  them unverified. This is not a production access-control setup. Use clearly
  labeled synthetic data only; never enter participant names or other personal data.
- Typed Sessions, both scanner paths, the older quick Quarter and follow-up forms
  target a **separate standalone receiver and endpoint**, with approved tabs in this
  **same workbook**. They require the new setup below, not a quarterly receiver update.
  They do not open GitHub issues or accept GitHub tokens. Packet-profile upload
  remains a legacy git-backed path; historical records are not deleted/migrated.
- New quick records do not automatically feed the historical git-derived report
  rollup. The receipt confirms a Sheet append, not report/dashboard inclusion.
- No browser-side Firebase second write is made. The dashboard still reads Firebase;
  it needs the receiver's optional server-side copy to display new submissions.
  The live receiver confirmed a Sheet append but did not report a dashboard-copy
  status, so new dashboard data is **not** claimed as verified.
- The local end-to-end test returned a real one-row write receipt, reference
  `E5B8D98C`, for an explicitly synthetic test. The private sheet was not independently
  read from the coding session. No new backend or authentication deployment was made.

## Separate receiver for additional forms

Deploy `admin/additional-forms/Code.gs` and generated `Config.gs` in a **new standalone
Apps Script project**. Give it its own `SPREADSHEET_ID` Script Property pointing to
the master workbook linked above, plus `ALLOW_UNSIGNED=true` for **synthetic demo
submissions only**. This flag is not production authentication.

Configure that project's new `/exec` URL in `intake/backend.js` as
`window.TPW_RECORDS_BACKEND_URL`, now configured to the separate deployment. Leave this guided form's
`backend.js`, existing URL and quarterly Google project untouched. Until configured,
the additional forms cannot file; they must not use the quarterly URL as a fallback.

`data/intake/additional_forms.json` configures the schema and approved destination
tabs. Compile it and the source contracts (`simple_forms.json`, `facilities.json`,
`sheets.json` under `data/intake/`) with:

```bash
python3 scripts/build_additional_forms.py
```

The output is `admin/additional-forms/Config.gs`; do not edit it by hand. See
[the standalone receiver setup](../admin/additional-forms/README.md) for deployment.
Neither project is deployed by changing these repository files.

Future authentication work must be planned separately for each project. Do not
change the working quarterly deployment as part of this migration, or disable
unsigned mode before the corresponding sign-in path exists.
