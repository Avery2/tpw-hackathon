# Separate additional-forms receiver → same master workbook

**Create a new standalone Apps Script project. Do not edit, redeploy or add files to
the working quarterly project.** Its `form-demo/backend.js` URL, sources under
`form-demo/receiver/`, Script Properties and Google deployment stay unchanged.
This receiver has one new endpoint for follow-ups, the older quick quarter form and
future approved forms. (It accepted Sessions until 25 Oct 2026; see below.) It writes to the same private master workbook, not a second spreadsheet.

## One-time Google setup

1. Sign in as an account with **edit access** to the master workbook. Create a **new
   project** at <https://script.google.com/home/start>, named `TPW additional forms`.
2. Replace the new project's `Code.gs` with all of [`Code.gs`](Code.gs).
3. Add a Script file named **Config** and paste [`Config.gs`](Config.gs) into it.
   These are the only two script files required; do not copy quarterly helpers.
4. Enable the advanced **Google Sheets API**, identifier **Sheets**, version **v4**:
   Services → **+** → Google Sheets API → Add. If the project uses a standard Cloud
   project, also enable the Sheets API there. Alternatively, show the manifest in
   Project Settings and use [`appsscript.json`](appsscript.json) for its service and
   spreadsheet-only OAuth scope.
5. In **Project Settings → Script Properties**, add these properties to the **new
   project only**:

   | Property | Value |
   |---|---|
   | `SPREADSHEET_ID` | `1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0` |
   | `ALLOW_UNSIGNED` | `true` — **synthetic demo data only** |

   This project does **not** share the quarterly project's properties or session
   tokens. Without the explicit unsigned flag, writes are disabled. Production
   authentication is not implemented; a private workbook does not make a public
   unsigned receiver authenticated. Do not use real participant/member data.
6. **Deploy → New deployment → Web app**. Execute as **Me** (the workbook editor),
   access **Anyone**. Authorize the new project. Copy this **new** `/exec` URL.
   Do not edit or replace the quarterly deployment.
7. Paste the new URL into [`intake/backend.js`](../../intake/backend.js):

   ```js
   window.TPW_RECORDS_BACKEND_URL = 'https://script.google.com/macros/s/NEW_DEPLOYMENT_ID/exec';
   ```

   The team's new deployment is now configured there. For a replacement deployment,
   use its new URL. Do **not** put this URL in `form-demo/backend.js`, and do not reuse
   that file's quarterly URL here.
   Publish the website configuration change using the normal site deployment.
8. Open the new `/exec` URL. It should report `service: "tpw.additional-forms"`,
   `version: 1`, `recordKinds` and `recordTabs`; it never returns records or the
   workbook ID. File a clearly labeled **synthetic** quick quarter record and compare its
   displayed receipt with the new tab's **Submission reference** column.

**No manual tab setup.** The first valid record creates its approved tab, with
readable summary columns, **Record (JSON)** and **Receipt (JSON)**. Existing tabs
with different headings are not adopted or overwritten. The receiver never reads
or writes the quarterly submission tab; its independently scoped script lock only
serializes writes from this new project to its own approved destinations.

The automated tests below never change Google projects or workbook data.

## Live verification

The separate deployment's GET identified `tpw.additional-forms` v1 with the three
approved mappings. One clearly labeled **synthetic, zero-attendance Session**
returned receipt `BA7532FA-383E-4F7C-9ADE-AFAAE1290C9A` for **Session records**.
Repeating the exact same payload/record ID returned that original receipt, rather
than a new filing. This is receiver confirmation; the private workbook was not
independently read. Exclude the test row from all reporting. The website endpoint
is configured in `intake/backend.js`.

## Configuration, schemas and approved destinations

The policy is [`data/intake/additional_forms.json`](../../data/intake/additional_forms.json).
It explicitly approves each form kind, its source contract, record schema, sources,
extra fields, validation rules and destination tab:

| Kind | Destination | Callers |
|---|---|---|
| `followup` | **Follow-ups** | Follow-up form |
| `aggregate` | **Quarter records** | Older quick totals form; **not** the working guided quarterly form |

**`session` was removed on 25 Oct 2026.** Its form, printed roster and scanner recorded a
coded ID per person, which TPW asked us not to collect, so the receiver now refuses Session
records. Its definition is in git history if TPW ever wants a later phase. Any test rows already
in the **Session records** tab stay there; nothing new is written to it.

Compile the policy and its referenced field/facility/photo contracts with:

```bash
python3 scripts/build_additional_forms.py
python3 scripts/build_additional_forms.py --check
```

The generated `Config.gs` is a deployment artifact. Do not hand-edit it. No schema
is copied into the receiver engine. The generator rejects unknown configuration,
unsupported field types, duplicate destinations and reserved quarterly/workbook
tabs. The receiver also guards reserved destinations at runtime. Request data
cannot choose a tab, workbook or schema override. Unknown record fields are
rejected, not saved as opaque extra data.

To approve a **future form**, add its field contract and a new policy entry with
`tab`, `contract: {path, kind}`, `sources`, and optional `schema`, field overrides
and rules. Regenerate `Config.gs`, test, and deploy a **new version of this additional
receiver** using Manage deployments → Edit. Keep this endpoint stable. A new form
calls the same `submitRecord(record)` transport from `intake/js/sheets.js`; it does
not need another endpoint or a new routing branch in the receiver. The browser
uses advertised approved kinds/tab mappings rather than a hardcoded tab list.

## Save contract and limits

- POST `text/plain` JSON: `{ "action": "submitRecord", "payload": record }`.
  Quarterly authentication tokens and caller-supplied destinations in the envelope
  are rejected. No mail, Firebase or GitHub dependencies exist.
- Inputs are allowlisted against each configured schema, including real calendar
  dates, numeric bounds, facility names, participant-ID formats and cross-field
  rules. Photos/PDFs, names, CDCR numbers, DOBs, tax data and credentials are not
  declared and cannot be uploaded as fields. Free text must contain no personal data.
- Text uses **RAW** appends so formula-like strings remain literal. All approved
  fields, including future fields, are retained in the JSON cell.
- Data and its receipt append together under a script lock. Same-ID/content retries
  return the durable saved receipt; changed content under a saved ID conflicts.
  The browser keeps the ID/timestamp through retries and edits while the page is
  open. After an ambiguous response, retry unchanged; don't reload/start a new
  entry before checking the Sheet. Do not run multiple deployments/projects writing
  the same approved tabs: their script locks would not be shared.
- Requests are bounded to 250,000 characters; individual records to 20,000. Retry
  lookup scans the approved private tabs, suitable for a demo, not a large ledger.
- No public record read API is exposed. JSON downloads are local backups, not filings.
- The historical report rollup and Firebase dashboard are **not** automatically
  updated by these Sheet writes. Packet-profile upload remains a separate legacy path.

## Checks (all Google requests mocked)

```bash
python3 scripts/build_additional_forms.py --check
python3 scripts/test_additional_forms.py
node admin/additional-forms/test.cjs
node admin/additional-forms/client.test.mjs
node form-demo/test/receiver.cjs          # working quarterly receiver regression
python3 -m http.server 8826 --bind 127.0.0.1  # separate terminal, from repo root
node admin/additional-forms/browser.test.mjs
node form-demo/test/browser.mjs           # unchanged quarterly browser checks
```

Browser checks need Chrome and Node 22+; set `CHROME_BIN` if needed. They inject a
fake additional endpoint and intercept **all** Google calls. No live rows or emails.
