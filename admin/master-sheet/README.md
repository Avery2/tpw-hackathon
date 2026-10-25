# Master-sheet handoff — parallel work, not a deployed integration

Prepared independently of `email-code-signin`, `sheet-backend`, and
`sheet-backend-tests`. It does **not** change their code, merge their branches,
change the live forms, or write anything to Google automatically.

## Agreed destination

- Owner/deployer/contact: **tpwhackathondemodemo@gmail.com**.
- Private workbook: <https://docs.google.com/spreadsheets/d/1EvmybTK2U5blq3brPBO4akV7yZ8odaL6fP_B4n-Unb8/edit>.
- Script property: `SPREADSHEET_ID=1EvmybTK2U5blq3brPBO4akV7yZ8odaL6fP_B4n-Unb8`.
- One spreadsheet file, with separate tabs for different record types. A session's
  attendance count is not a program's completion count: do not force both into the
  same numeric columns or add them together.
- Keep the workbook private. Do not publish it as CSV, use anonymous exports for
  dashboard access, or commit its contents to this public repository.

The email address is the account that owns/deploys the service, not a password or
an automatic organization-admin bypass. That account needs edit permission on the
workbook and must authorize the Apps Script deployment.

## What currently exists

Checked against `email-code-signin` at `2f65ce3`, `sheet-backend-tests` at `47c6b8c`,
and live-code `main` at `dc3a269`:

| Area | Current behaviour | What still needs doing |
|---|---|---|
| Guided form on main | Saves to Firebase; dashboard reads Firebase | Connect the Sheets transport deliberately, preserving reporting period and program IDs. Decide how dashboard data will be kept current. |
| Guided form on auth branch | Emailed code → server session → program/yard rows | Deploy Apps Script and set the `/exec` URL; that branch's `backend.js` is blank. |
| Session and scanner | GitHub ledger routes | Add an authenticated record handler and frontend transport to this same workbook. The scanner produces a Session record, not a second report type. |
| Older Quarter and Follow-up routes | GitHub ledger routes | Handle each type without inventing program starts/completions from attendance or outcomes. |
| Packet reader | Files an allowlisted organization profile | A profile handler must enforce `documents.json`, excluding tax IDs, signatures, local contact details and other packet-only values. Never send the PDF. |
| Dashboard | Firebase reads, with a demo view chooser | Emailed-code form auth does **not** secure Firebase reads. A chooser is still not authentication. |

Nothing in this handoff claims all those write paths are connected yet. The live
site stays on Firebase/GitHub until an explicitly tested integration replaces it.

## Auth contract to preserve

Richie's emailed-code backend expects:

```js
{ action: 'requestCode', email }
{ action: 'verifyCode', email, code }
{ token, payload } // submit after verification
```

The Members tab maps an exact email or approved organizational domain to an
organization. The server derives the organization from that mapping and its
session token; it must not trust the submitted `org` / `organization` field.
Tokens are server-issued, expire after two hours, and must never be written into
sheet rows, logs, URLs or the public repository. Codes expire after ten minutes.

Use `ALLOW_UNSIGNED=false`. It must remain false for **every** form path, not just
the guided one. Handle `signInNeeded` by retaining the form's answers and asking
for a new code before retrying. The existing sign-in UI holds the session in
`window.tpwSession` in the guided form; the parent Session tab and other pages do
not automatically share it. A reusable sign-in client/bridge is still needed.

If testing sign-in with the owner email, add its **exact address** to Members
with the intended organization. Setup does not guess that organization or insert
a membership row. Never allow `@gmail.com`: that would authorize unrelated Gmail
users, and the auth backend intentionally refuses free-email domain entries.

## Safe setup helper

`Setup.gs` is an optional companion to the **emailed-code Apps Script project**,
not a replacement for it. It reuses that project's `HEADER` and `MEMBERS_HEADER`
constants instead of making a second copy of the column contract.

1. Sign in to Apps Script as the demo owner. Install the auth project's files and
   its manifest, including the advanced Google Sheets service.
2. Add this `Setup.gs` file to that project.
3. Run **`configureMasterSheet_`** in the editor and authorize it. The trailing
   underscore keeps it unavailable through `google.script.run`.
4. It checks the executing account and workbook access, refuses to silently
   retarget an existing deployment, and checks existing tab headers before making
   changes. It creates **Members** and **Submissions** only when missing, without
   replacing other tabs or existing rows. A blank/unexpected existing header
   requires manual inspection rather than being overwritten.
5. It sets `SPREADSHEET_ID`, `TPW_CONTACT_EMAIL`, and `ALLOW_UNSIGNED=false` in
   Script Properties. It does not create users, send mail, or seed submissions.
6. Fill Members with permitted emails and organizations. Deploy **Execute as: Me**,
   **Who has access: Anyone**, using the auth backend's server-side session checks.
   Copy the resulting **`/exec` URL** for the frontend integration. The spreadsheet
   URL cannot be used in its place.

If an API write fails mid-setup, newly created tabs may remain without headers;
inspect them before running again. Setup is not a cross-service transaction.
Do not paste it into the different `admin/sheetforms` receiver: that has a separate
shared-key contract, not the emailed-code auth contract.

## Mapping for the remaining forms

These tab names are proposed, not created by the setup helper:

| Tab | Record unit | Important boundary |
|---|---|---|
| `Submissions` | Program × facility × yard | Existing auth backend's A–N match TPW's sheet; O–R are audit fields. Keep per-yard counts supplied by the filer. Never copy one program total to every yard. |
| `Session records` | One room/session, typed or scanned | Preserve date, roster/present tokens and record ID; attendance does not imply completion. Validate against `simple_forms.json`. |
| `Quarter records` | One program/organization/quarter | Keep separate from session-derived counts; select the winning source, never sum both. |
| `Follow-ups` | One reported outcome | Not a program completion or measured CDCR outcome. Preserve its own contract. |
| `Organization profiles` | Allowlisted profile facts | Validate against `documents.json`; exclude original packets and local-only facts. |
| `Members` | Allowed email/domain → organization | Access-control data, not public program data. Staff edit it; members cannot grant access to themselves. |

For each new handler: validate the schema and ranges on the server, take the
organization from the authenticated session, refuse unknown fields, prevent
spreadsheet-formula injection, and serialize writes. Use a stable client record ID
and deduplicate retries under the same lock: the current guided backend generates
a new submission ID on each request, so repeating a request can otherwise append
new rows after a lost response. Return a confirmed receipt; a browser's unreadable
`no-cors` response is not proof that a row was saved.

Also preserve the new guided form's `reportingPeriod` and stable program IDs. Those
are needed for dashboard/check-in continuity but are not columns in the auth
branch's current A–R row mapper. Append metadata deliberately rather than dropping
it or guessing a quarter from the program start date.

The auth and tested-backend branches share the original backend, but only the
latter includes subsequent fixes/tests. In particular, its internal writer/helper
names are private (`handleSubmission_`, `appendRows_`). Carry those fixes forward
when combining the code; don't replace tested helpers with an older auth copy.

## Checks

```bash
node admin/master-sheet/test/run.mjs
```

Ten setup-only tests with stubbed Google services: owner/service checks, workbook
access, no silent retarget, inherited headers, repeat-run preservation, refusal of
unknown headers, no implicit membership and no public setup function. No Google
requests, emails, live writes or changes to Script Properties are made by tests.

Integration acceptance still needs: two member organizations, an expired session,
a spoofed organization, a retry after a lost response, two simultaneous writes,
all record types, and a real cross-origin browser receipt against the deployed
`/exec` endpoint. Use synthetic data and keep participant identifiers out of the
public repository. No live authentication, sender identity, spreadsheet ownership
or deployment was verified from this coding session.
