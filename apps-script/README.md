# Sheet back end for the guided form

The guided form (`form-demo/`) sends each submission here. This Google Apps Script checks
who is signed in, turns the submission into rows, and adds them to a Google Sheet. It runs
as whichever Google account deployed it, so once TPW deploys it from their own account,
every row is written by TPW's account. Nothing else needs hosting.

## What ends up in the sheet

A tab called **Submissions**, made automatically the first time. One row per program, per
yard, per prison, which is the same unit as TPW's own Collective Impact sheet. Columns A–N
are that sheet's columns in the same order, so rows can be copied across:

| | Column | Where it comes from |
|---|---|---|
| A | CDCR Facility | the prison picked in the form, written with TPW's own facility name |
| B | Yard | the yard picked |
| C | Organization Name | the signed-in organization, never what the page typed |
| D–J | Program, status, dates, course hours, participants, completed | the form; participants and completed are per yard |
| K | Funded by RIGHT 2.0 | left blank: the form doesn't ask |
| L | CALC: Total Participant Hours Delivered | course hours × completed |
| M | CALC: Program Year | the start date's year |
| N | Notes | blank |
| O–R | Submission ID, Submitted At, Submitted By, Sign-in Checked | added here, for checking who filed what |

A second submission adds new rows rather than changing old ones. Leave this tab alone and
build summaries in other tabs, so hand edits can't quietly break the totals.

## What it refuses

Nothing is written unless the whole submission is sound. The rules match the form's own
checks: a schedule status is needed; a start date unless Planned; an end date once Completed;
the end can't be before the start; participants and completed must be whole numbers, with
completed no more than participants at each yard; prisons must be on TPW's list. Typed text
starting with `=`, `+`, `-` or `@` is stored as text, so it can't run as a spreadsheet formula.

## Sign-in

The emailed-code sign-in is built separately. When someone's code checks out, it calls
`createSession(email, organization)` (in `Session.gs`) and hands the returned token to the
page as `window.tpwSession = { token, organization, email }`. The form sends that token with
the submission, and this script files the rows under that session's organization. A pass
lasts 2 hours.

For the hackathon demo, before sign-in is connected, set `ALLOW_UNSIGNED` to `true` (below).
Submissions then go through under the organization the page typed, and column R says "No".
Turn it off for real use.

## Setting it up

1. Make a Google Sheet in the account that should own the data (TPW's). Copy its ID: the long
   code in its address between `/d/` and `/edit`.
2. In that account, go to script.google.com → New project. Make files with the same names
   as `Code.gs`, `Rows.gs`, `Session.gs` and `Sheet.gs` here and paste each one in.
3. Project Settings → tick "Show appsscript.json manifest file in editor", then paste
   `appsscript.json` over the one there. This switches on the Sheets API for the script.
4. Project Settings → Script Properties → add `SPREADSHEET_ID` with the sheet's ID. Add
   `ALLOW_UNSIGNED` = `true` only for the demo.
5. Deploy → New deployment → type "Web app". Execute as: **Me**. Who has access: **Anyone**.
   Google asks the account to allow access to its sheets the first time.
6. Copy the web app address (it ends in `/exec`) into `form-demo/backend.js`.

To change the script later, use Deploy → Manage deployments → edit the existing deployment
and pick "New version". Making a new deployment instead gives a new address, and the form
would keep sending to the old one.

## Checking it

`node apps-script/tests.js` from the repo root runs the row rules without Google. No packages
needed.
