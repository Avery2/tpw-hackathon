---
name: tpw-check-submissions
description: Checks TPW's submissions Google Sheet for problems the Log data form can't catch, and says in plain words what to look at and what to ask the member. Finds the same program submitted twice, Completed programs whose end date hasn't come yet, numbers that may belong to an earlier quarter, organization names not on TPW's member list, big jumps from last quarter, notes that may hold a CDCR number or birth date, and rows typed into the Sheet by hand. Use when TPW staff ask to check, review or clean up submissions, ask whether the data looks right, or ask about this week's or this quarter's submissions.
---

# Check the submissions

Read `reference/rules.md` first and follow it. It covers how to answer, TPW's words, privacy, and how to get the Sheet.

## Steps

1. Get the submissions Sheet as a downloaded file (see "Getting the Sheet" in the rules).
2. Run:

   ```
   python3 scripts/tpw_data.py check <downloaded file>
   ```

   To check only recent submissions, add `--since 2026-10-01` (the date the person means: "this week" is the last 7 days, "this quarter" is the first day of the quarter). The checks that compare with last quarter still read last quarter's submissions.

3. Tell the person what needs a look, most important first, as a numbered list. For each problem give:
   - what's wrong, naming the organization, the program and the reference code;
   - what to do about it, in one line;
   - if a member needs asking, a short, friendly message they could send. Draft it only for the problems that need the member, and never mention any other member.

4. If nothing needs a look, say so in one line.

## Fixing things

Never change the Sheet yourself. TPW's way to handle a wrong submission:

1. Ask the member to submit again with the right numbers.
2. In a separate tab (never the main one), list the wrong submission's reference code as "ignore".
3. When adding things up, skip every reference code on that list.

The main tab is TPW's record of what members sent, so rows there are never edited or deleted, except to remove personal information (a name, CDCR number or birth date) from a note. If the person asks how to do any of this in Google Sheets, explain it step by step.

## Things to say when they apply

- While sign-in is off, anyone can submit under any organization's name. The script mentions this. Say it once, briefly.
- If everything checked is test data, say that the Sheet holds only test data so far.
