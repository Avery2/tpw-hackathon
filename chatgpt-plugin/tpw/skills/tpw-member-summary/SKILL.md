---
name: tpw-member-summary
description: Writes a short summary of one TPW member organization's own reported numbers (participants, programs, hours of programming delivered and facilities reached) for that member to use with its own funders, from TPW's submissions Google Sheet. Use when TPW staff ask for a member's numbers, a member's summary or one-pager, what a particular organization reported, or something to send a member so it can show its impact.
---

# A member's own numbers for its funders

Read `reference/rules.md` first and follow it. It covers how to answer, TPW's words, privacy, and how to get the Sheet.

This is the "something back" TPW gives members for submitting: a clear account of what they actually delivered, which they can use when they ask for funding. It goes only to that member.

## Steps

1. Get the submissions Sheet as a downloaded file (see "Getting the Sheet" in the rules).
2. Run:

   ```
   python3 scripts/tpw_data.py member <downloaded file> --org "<organization name>"
   ```

   That covers this year. For one quarter add `--quarter 2026-Q3`, for another year `--year 2025`, and for everything the member has submitted `--all`. Part of the name is enough if only one organization matches. If the script suggests names, ask the person which one they mean.

3. Write the summary for the member, about half a page:
   - A title with the organization's name and the period.
   - One or two sentences in plain words: how many participants took part in its programs, how many completed, and how many hours of programming it delivered, at how many facilities.
   - A short table of its programs (name, facilities, participants, completed, hours delivered).
   - One line on where the numbers come from: "From the numbers [organization] submitted to TPW for [period]."
   - Plain caveats only where they apply: participants are enrollments, so someone in two programs counts twice. A program still In Progress may not have its completions yet.
   - Use the script's "Added up" figures as they are. It already counts each run of a program once, with its latest numbers, even when the member reported it in more than one quarter. Don't add up the quarter tables yourself.

4. Offer it as a document they can download, and a short covering note from TPW to the member, if the person wants one.

## Rules for this skill

- Only this member's numbers. Never compare it with other members, never rank it, and never show TPW's totals next to it unless TPW staff ask.
- Don't add credit days or facility costs avoided. They are upper limits that a funder could mistake for results.
- Write it so the member could hand it to a funder as it is: warm, plain and confident, without claiming more than the numbers show. Don't claim effects on reoffending.
- If the member's submissions are all test data, say so and don't write a summary unless the person asks to see a sample, and then mark it clearly as a sample with made-up numbers.
