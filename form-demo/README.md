# Guided form → master Google Sheet

Serve the repository with `python3 -m http.server 8787` and open
`http://localhost:8787/form-demo/`. The same form is embedded in the intake's
**Form Demo** tab. No build or package install is needed.

**Finish and submit** posts to the existing Apps Script web app configured in
`backend.js`. Its `SPREADSHEET_ID` points at the chosen master workbook:
<https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/edit>.
The spreadsheet stays private. The `/exec` URL is public browser configuration,
not a credential. This frontend deployment does not modify the Google project,
its properties, permissions, or deployed script version.

One row is filed per program × prison × yard. The current California quarter/year
is inferred, not asked; check-in prefill also stays in the current quarter. Status
is **In Progress** or **Completed**, not Planned. Optional programme context is
limited to 2,000 characters, with a reminder not to include personal information.
Participants and completions are entered separately for each yard, avoiding
duplicated program totals. Submission
success is shown only after the real receiver returns `ok: true`; its row count
and reference are displayed. Errors leave the entries available for retry. The
client reuses its submission ID on retry, but deduplication requires the deployed
receiver to support it; the older deployed receiver has not been verified to do so.

## Receiver compatibility

The one-time [receiver update](receiver/README.md) saves context to the existing
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
- Only the guided form changes destination. Session/scanner, older Quarter,
  follow-up and packet-profile routes retain their existing git-ledger paths.
- No browser-side Firebase second write is made. The dashboard still reads Firebase;
  it needs the receiver's optional server-side copy to display new submissions.
  The live receiver confirmed a Sheet append but did not report a dashboard-copy
  status, so new dashboard data is **not** claimed as verified.
- The local end-to-end test returned a real one-row write receipt, reference
  `E5B8D98C`, for an explicitly synthetic test. The private sheet was not independently
  read from the coding session. No new backend or authentication deployment was made.

Tomorrow's auth integration must update the existing Google deployment and connect
its sign-in client before turning `ALLOW_UNSIGNED` off. Do not turn the flag off
while this unsigned frontend is the only submission path.
