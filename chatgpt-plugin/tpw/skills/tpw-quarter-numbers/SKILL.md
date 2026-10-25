---
name: tpw-quarter-numbers
description: Works out TPW members' combined numbers for a quarter or a year from TPW's submissions Google Sheet, with the same rules as the Dashboard on TPW's website. Gives programs, facilities, participants, completions, participant hours, and upper limits for credit days and facility costs avoided. Use when TPW staff ask for this quarter's numbers, totals, how many participants or completions members reported, figures for a report, funder update or legislator, or what the Dashboard would show.
---

# This quarter's numbers

Read `reference/rules.md` first and follow it. It covers how to answer, TPW's words, privacy, and how to get the Sheet.

## Steps

1. Get the submissions Sheet as a downloaded file (see "Getting the Sheet" in the rules).
2. Run one of these, depending on what was asked:

   | Asked for | Run |
   | --- | --- |
   | This quarter (the default) | `python3 scripts/tpw_data.py totals <file>` |
   | A particular quarter | `python3 scripts/tpw_data.py totals <file> --quarter 2026-Q3` |
   | A whole year, quarter by quarter and added up | `python3 scripts/tpw_data.py totals <file> --year 2026` |
   | What the website's Dashboard shows | `python3 scripts/tpw_data.py totals <file> --dashboard` |

3. Give the person the numbers in a short list, then one or two plain sentences on what they mean. Keep the script's caveats where they matter:
   - Participants are enrollments. Someone in two programs counts twice, and a program reported in two quarters counts its participants twice in a yearly total. Completions are the safer number for a year.
   - Credit days and facility costs avoided are upper limits, never results.
   - The facility table is for TPW's own use. A facility with only one member shows that member's numbers.

4. If the person wants to use the numbers outside TPW (a funder, a legislator, a newsletter), give only the combined figures, call the estimates upper limits, and don't name any member. If they ask for wording, write it in TPW's voice: warm, plain and confident, without claiming more than the numbers show.

## How the numbers are worked out

So you can answer "where does this come from?":

- Each submission can include many programs, at many facilities and yards. A program's participants and completions are its yards added up.
- When a member updates a program, the latest submission for that program counts and earlier ones don't, so nothing is counted twice within a quarter.
- Participant hours are course hours per participant times completions, the same as the Sheet's own "CALC" column.
- Credit days: 10 days for every 52 course hours, at most 40, for each completion. Facility costs avoided: credit days times $59 a day, the Legislative Analyst's Office marginal cost of $21,534 a year divided by 365. CDCR's rules for these credits: https://www.cdcr.ca.gov/proposition57/
- Rows marked Yes in the Test data column are left out.
