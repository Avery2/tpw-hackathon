---
name: tpw-missing-submissions
description: Lists the TPW member organizations that haven't submitted their quarterly numbers for this quarter or last quarter, by reading TPW's submissions Google Sheet and comparing it with TPW's member list. Use when TPW staff ask who hasn't submitted, who's missing, who to chase or follow up with, which members haven't reported, or who sent their numbers this quarter.
---

# Who hasn't submitted

Read `reference/rules.md` first and follow it. It covers how to answer, TPW's words, privacy, and how to get the Sheet.

## Steps

1. Get the submissions Sheet as a downloaded file (see "Getting the Sheet" in the rules).
2. Run:

   ```
   python3 scripts/tpw_data.py missing <downloaded file>
   ```

   For a different pair of quarters, add `--quarter 2026-Q3` (that quarter and the one before it).

   The member list comes with this skill (`reference/tpw-members.csv`, the same list the form suggests when a member types its name). If the person says TPW's member list has changed, ask for the up-to-date list as a Google Sheet or file and add `--members <that file>`. It needs a column called "member", "Organization name" or "Organization".

3. Tell the person:
   - how many members haven't submitted for this quarter, and for last quarter;
   - the list of those members, as a numbered list or a table (members missing both quarters first);
   - any organizations that submitted under a name that isn't on the member list. These may be a member typing its name differently, so they may not really be missing. Say which member each one looks like, if the script suggests one.

4. If the person wants a file to work from, offer the list as a spreadsheet they can download.

## Things to say when they apply

- This quarter is still open, so "Not yet" for this quarter is normal early in the quarter.
- The form labels a submission with the quarter it was sent in. A member that sent last quarter's numbers after the quarter ended shows as submitted for this quarter, not last quarter.
- If the script says it left out test submissions and every member is missing, say that everything in the Sheet is still test data, so the list isn't meaningful yet.
- Don't add contact details or draft messages unless asked. If asked to draft reminders, keep them short and warm, say why the numbers matter (TPW speaks for all its members in Sacramento, and combined numbers make that case), and never mention another member's numbers.
