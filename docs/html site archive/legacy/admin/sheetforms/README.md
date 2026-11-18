# Intake receiver (Apps Script)

The forms need somewhere to post. This is that somewhere: a Google Apps Script
web app that appends a submission to a spreadsheet you own.

**Status: the receiver is ready, nothing posts to it yet.** No transport in
`intake/js/` has a Google mode — `intake/js/transport.js` files to GitHub only
(issue, token, commit) and knows nothing about this endpoint. Deploying this
changes nothing about the live site. Wiring it up means adding a `google` mode
to that module (POST the payload as `text/plain` to the `/exec` URL, then follow
the sheet row as the receipt), which is a change to a shared file and a
decision for the team, not something this directory can do alone.

Why not the Sheets API in the browser: a member organization should need no
Google account, no consent screen and no GitHub account to file a cycle. With
this deployment the submitter is anonymous and the script writes with the
owner's authority. Doing the same from the browser would need the sensitive
`spreadsheets` scope — Google verification past 100 users, and 120 organizations
asked to grant a website write access to their own Drive.

## Deploy (about 5 minutes, one time)

1. <https://script.google.com> → **New project**. Name it `TPW intake receiver`.
2. Replace the contents of `Code.gs` with this directory's `Code.gs`.
3. **Project Settings → Script properties**, add:
   - `SHARE_KEY` — a long random string. The form sends it with each submission. Rotate it by changing the **value** in Script properties; the property *name* is not a secret and does not change. Anything holding the old value stops working, so rotate it and the client together.
   - `SHEET_ID` — optional. The spreadsheet to write to. If omitted, the bound spreadsheet is used, which is easier: create a Sheet first, then **Extensions → Apps Script** so the project is bound to it.
4. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** **Anyone** ← the point. Not "Anyone with a Google account": that would force every member org to have and use a Google account, and it is exactly the friction this exists to remove.
5. **Authorize** when prompted (this is the owner authorizing their own script; submitters never see it).
6. Copy the `/exec` URL. That is the endpoint.

Sanity check from a terminal:

```bash
curl -L "https://script.google.com/macros/s/…/exec"
# → {"ok":true,"service":"tpw intake receiver","accepts":"POST text/plain JSON","sheet":"submissions","note":""}
```

Before the Sheet is bound the same URL still answers with JSON, `"sheet":null`
and a `note` saying which property to set — so a fresh project can be checked
before anything else is configured.

## What gets stored

One row per submission in a `submissions` tab:

| received_at | id | kind | org | program | facility | start_date | end_date | participants_started | participants_completed | submitter_email | payload |
|---|---|---|---|---|---|---|---|---|---|---|---|

The last column is the whole submission as JSON. That is deliberate: the field
contract lives in `data/intake/schema.json`, `data/intake/simple_forms.json` and
`data/intake/facilities.json`, and this script reads all three from the deployed
site, so there is no second schema to drift. A wide table would need resyncing
every time a field is added.

## Checking a deployment from a browser

`admin/sheetforms/probe.html` is a single self-contained page: paste the `/exec`
URL and the share key and it sends one synthetic cycle cross-origin with the
same body shape the form will send. Open it through the site
(`/admin/sheetforms/probe.html`) or straight off disk.

It writes a **real row** to a **real sheet** — org `Probe Organization` — so
delete those rows afterwards. It also proves the CORS behaviour below inside a
real browser, which a `curl` cannot.

## What it refuses

Refusal is the feature, and the rules are not copies: `schema.json`,
`simple_forms.json` and `facilities.json` are fetched and read at runtime, so
the required flags, the select enums (`status`, `funded_by`, and `facility`
against the facility list) and the value bounds are the same ones
`scripts/intake_validate.py` applies. The arithmetic the CI validator already
enforces — `completions > starts`, `end_date < start_date`, non-numeric or
out-of-range numbers, a completed cycle with no end date — is enforced here too.

So a row this endpoint accepts should also pass `python3 scripts/intake_validate.py`.
It is not a substitute for CI: CI additionally checks the participant join
spine, derives the quality flags, and spots a duplicate across rows. Those are
review steps on the ledger, not things a single POST can decide.

## What it does not do

This is **exact-key** refusal. It refuses a *field* named `cdcr_number`, `ssn`,
`participant` and so on; it cannot stop somebody typing a participant's name
into the `notes` textarea or the demographics blob, which are declared fields
and are stored verbatim in the `payload` column.

The boundary is therefore a working-store boundary, not a publication one:

- The spreadsheet is a working store. **Never export it into this repo.** The
  repo is public; a name pasted into `notes` arrives with the export.
- Never publish the sheet, and never hand it to a funder as-is. Facts that reach
  the ledger go through the normal path: a steward exports, strips anything
  person-shaped, and files a cycle.
- The refusal only removes the accident where a field named `participant_name`
  quietly starts collecting people. That is a real reduction in risk, not a
  guarantee.

## The CORS caveat, stated plainly

Apps Script does not answer `OPTIONS` preflight and does not send
`Access-Control-Allow-Origin`. Consequences:

- The form must POST with `Content-Type: text/plain` (a "simple request", no
  preflight). A JSON content type triggers a preflight and fails.
- The browser cannot read this function's reply. The form therefore reports
  "sent", keeps its own copy of the payload, and the confirmation of record is
  the row in the sheet.

If a real receipt becomes necessary, the fix is an `HtmlService` page that uses
`postMessage` back to the form's origin — more moving parts, exact confirmation.

## Tests

```bash
node admin/sheetforms/test/run.mjs
```

Runs this `Code.gs` against the repo's real contract files with Apps Script's
globals stubbed. No account, no deployment, no network. Standard-library Node
only; it is a development aid, not a runtime dependency.

## Security posture

- **Anyone** can POST to the `/exec` URL if they learn it. It is a public write
  endpoint by design; `SHARE_KEY` is a speed bump, not authentication.
- Throttled per client bucket and across everyone: 20 submissions per minute
  named by the form's `?c=` value, and 240 per minute in total. The bucket name
  is client-supplied, so it is a cost, not a control — a caller can pick any
  bucket. The shared ceiling is there so that one caller exhausting "their"
  bucket cannot stop every other organization from filing.
- Bodies over 100 KB refused, measured in UTF-8 bytes.
- Writes are serialized with `LockService` so two first submissions cannot both
  append a header row.
- The sheet is the only durable store; the endpoint holds no state.
- Do not make the target sheet public. If CI needs to read it, share it
  view-only with the specific account that runs CI, or publish only a derived
  view.
