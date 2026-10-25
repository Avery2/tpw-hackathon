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

Members sign in with a 6-digit code emailed to them (`SignIn.gs`, and `form-demo/signin.js` on
the page):

1. They type their email. If it's on the **Members** tab, they're emailed a code that works for
   10 minutes. The page says the same thing either way ("If that email is registered, we've
   sent a code… Have you spelled your email correctly?"), so nobody can use the form to find
   out who TPW works with.
2. They type the code. The script starts a 2-hour pass (`Session.gs`) for the organization the
   Members tab gives that email, and the form shows that organization in step 1, locked.
3. They submit. Rows are filed under the pass's organization, never what the page typed, so
   editing the page can't file numbers as someone else. If the pass ran out, the form asks for
   a new code in place and keeps everything typed.

Limits: 5 wrong tries per code, one code per minute and 5 an hour per email. They apply to
every email alike, so they don't give away who is a member.

### The Members tab

Made automatically, in the same spreadsheet as Submissions. TPW staff fill it in by hand:

| | Column | What goes in it |
|---|---|---|
| A | Email or @domain | one person (`staff@grip.org`), or everyone at a domain (`@grip.org`) |
| B | Organization | the name their rows are filed under |
| C | Active | `no` switches the row off; anything else, including blank, is on |
| D | Notes | anything; ignored |

A row for an exact email wins over a domain row. Domain rows never work for free email
providers (gmail.com, yahoo.com, outlook.com and so on), or one mistaken row would let anyone
with a Gmail address in. Anyone who can edit this tab can let anyone in, so keep editing to
TPW staff.

For the hackathon demo, `ALLOW_UNSIGNED` = `true` (below) still lets submissions through
without signing in, under the organization the page typed, with column R saying "No". Leave it
off for real use.

## Setting it up

1. Make a Google Sheet in the account that should own the data (TPW's). Copy its ID: the long
   code in its address between `/d/` and `/edit`.
2. In that account, go to script.google.com → New project. Make files with the same names
   as `Code.gs`, `Rows.gs`, `Session.gs`, `Sheet.gs` and `SignIn.gs` here and paste each one in.
3. Project Settings → tick "Show appsscript.json manifest file in editor", then paste
   `appsscript.json` over the one there. This switches on the Sheets API for the script.
4. Project Settings → Script Properties → add `SPREADSHEET_ID` with the sheet's ID. Add
   `TPW_CONTACT_EMAIL` with the address members should write to if no code arrives, and
   optionally `SENDER_NAME` for the "from" name on code emails (default "TPW data form").
   Add `ALLOW_UNSIGNED` = `true` only for the demo.
5. Deploy → New deployment → type "Web app". Execute as: **Me**. Who has access: **Anyone**.
   Google asks the account to allow access to its sheets and to send email as it, the first
   time. Code emails come from this account's address.
6. Fill in the Members tab (it appears after the first sign-in attempt, or add it yourself with
   the four headings above).
7. Copy the web app address (it ends in `/exec`) into `form-demo/backend.js`.

To change the script later, use Deploy → Manage deployments → edit the existing deployment
and pick "New version". Making a new deployment instead gives a new address, and the form
would keep sending to the old one.

## Checking it

From the repo root, with no packages needed:

- `node apps-script/tests.js` checks the row rules.
- `node apps-script/signin-tests.js` checks sign-in: same reply for members and strangers,
  codes working once, the try and request limits, domain rows, switched-off rows, and filing
  under the signed-in organization.
- `node apps-script/local-server.js` runs the whole back end on your computer with pretend
  Google services, on http://localhost:8813/. Put that address in `form-demo/backend.js`
  (don't commit it), serve the repo (`python3 -m http.server`), and open `/form-demo/`. Code
  emails are printed in the terminal; `GET /outbox` lists them and `GET /sheet` shows the
  pretend spreadsheet. The demo members are in the file.
