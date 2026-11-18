# Accessibility pass on the member workspace

Branch `a11y/ux-audit`. This records what was measured, what changed, and what is still an
untested preference. It deliberately separates **WCAG requirements** from **judgement calls** so
later changes can be argued against a standard instead of a taste.

Members are a wide group: some are comfortable with software, many are not, and some have spent
years inside with little access to changing technology. Nothing here was validated with members,
so treat "untested" items as hypotheses to test in the next round of member interviews.

## Fixed: hard WCAG 2.2 failures

| Criterion | Was | Now |
|---|---|---|
| 1.4.3 Contrast (minimum) | Secondary text `#777` on white = 4.48:1 (needs 4.5:1) in 7 declarations. `.account-label` and `.program-owner` in `#5d8d67` = 3.84:1. Row numbers in `#77816f` on `#f3f6ef` = 3.73:1. | Secondary text `#5f5f5f` (6.4:1) and card captions `#4c4c4c` (7.5:1); labels `#3d6b48` (6.0:1); row numbers `#5b6353` (5.5:1). |
| 1.4.11 Non-text contrast | Input and toggle borders `#b7c5b4`, `#d2d8ce`, `#d7d7d7`, `#ddd` = 1.25–1.8:1 (needs 3:1). Export focus ring `#7aa98e` = 2.66:1. | Control borders `#7e8a7a` (3.2:1); focus ring `#5d8d67` (3.8:1). |
| 1.4.10 Reflow | `.chart-pills` was a non-wrapping inline-flex group ~320px wide inside 238px at 320px viewport. | Pills wrap; all workspace routes reflow at 320px with no horizontal scrolling (checked in a browser). |
| 2.5.8 Target size (minimum) | Sort buttons and `<summary>` rows were 21.7px tall and passed only through the spacing exception. | Sort buttons, view toggles, filter controls and disclosure rows have a 44px minimum height. |

## Fixed: defects found while measuring

- **Chart axis labels were unreadable at phone width.** Labels were SVG `<text>` inside a
  960-unit viewBox; at a 238px column they rendered at roughly 4 CSS pixels. Axis labels are now
  real text on the page, so they hold 13–14px at every width. The chart is marked decorative and
  the numbers live in the existing "View chart data" table, so screen readers get a table rather
  than focusable circles without accessible names.
- **Captions carrying the meaning were the smallest type on the page.** Card metric captions were
  12px, filter labels 13px, table body 14px. Now 14–15px, with table body and filter labels at 15px.
- **The export controls were the first thing after every page heading**, above the numbers they
  export, on the two pages that show no submission history. They are now inside a "Download your
  data" disclosure at the end of the page, and the Google Sheets instructions sit inside it.
- **`/team-dashboard/submission-data/` had one object under three headings** ("Your data", "Your
  submissions", "Submission history") plus a permanently open four-field filter row. It is now one
  heading ("Your submissions"), a single status line, a view toggle, and a collapsed
  "Filter submissions" row that says "(filters applied)" when it is hiding something.
- **The annual report opened a new tab to a PDF.** It is now a normal tab that embeds the PDF with a
  visible download link, matching the rest of the navigation. The previously dead "Generate a
  report" button now points at the same tab.

## Log data: one page instead of a wizard

Log data used to be a wizard: a start chooser, then organisation, quarter, facilities, programs and a
separate submit view, each hidden until the previous one was finished. This change flattens it into a
single scrolling report. The click counts below are the shortest path from opening Log data to a
submitted report, counting only navigation clicks (not typing or ticking boxes).

| | Before | After |
|---|---|---|
| Screens | 5 (start choice → reporting period → facilities → programs → submitted) | 1 report page, plus the confirmation that replaces it |
| Navigation clicks | 5 (`Use previous entries` → `Continue` → `Continue to programs` → `Done with program` → `Finish and submit`) | 2 (`Done with program` → `Finish and submit`) |
| Clicks before the whole form is visible | 0 for the choice screen, but every later step was hidden | 0 — all four sections are on the page from load |

What moved onto the one page:

- The `Use previous entries` / `Start blank` choice is gone. The last report is applied automatically,
  and a compact banner says `Filled in from your last report (Qx yyyy).` with a `Start blank` link that
  keeps the existing `?blank=1` behaviour. If the fetch fails, the old retry/blank message appears in the
  same banner.
- The organisation question is gone for signed-in members: the server already resolves and checks the
  organisation, so the name is read-only text in the sticky summary. Only the TPW staff view keeps an
  editable organisation name.
- Quarter and year, facilities and yards, the program editor, the program list and the submit action are
  now four sections (`Reporting period`, `Facilities and yards`, `Programs`, `Submit`) on one page.
- The per-step `Back` buttons are replaced by one anchor nav at the top, and a sticky summary keeps the
  organisation and reporting period visible while scrolling.

The submission-recovery path is unchanged: the same `tpw.react.submission:<account>` localStorage entry
still restores an unsent attempt and still shows the confirmation screen when a receipt exists.

The Submissions tab also stopped showing members a two-card `What would you like to do?` chooser; the
submission history is now rendered inline there. `/team-dashboard/submission-data/` redirects to
`/team-dashboard/submissions/`, and the old link is no longer in the member navigation. The staff
tracker is unchanged.

**This is a hypothesis, not a proven improvement.** Cutting steps and making one dense page is an
assumption about what members want; it has not been tested with members. A tall single page can be
harder to scan than short steps for people with low literacy or attention difficulties, and automatic
prefill can hide what was filled in. The next round of member interviews should A/B test the dense
single page against the step-by-step version before this is treated as settled.

## Judgement calls, not requirements

These follow the design system or common practice but have **no study behind them here**. Do not
cite this file as evidence that they help:

- Uppercase, letter-spaced micro-labels above headings (`.account-label`, `.program-owner`). Kept for
  continuity with TPW's site; they are decoration, and the heading underneath carries the meaning.
- Tabular figures and right-aligned numeric columns. Kept for scanning long tables; the ergonomics
  literature is split on the benefit.
- Card view vs table view for submissions. Members have not been observed using either.
- Collapsed disclosures for filters and exports. Progressive disclosure reduces visible text, but no
  reviewed study shows its effect on older or low-literacy users; it can also hide controls people
  expect to see. Revisit after member testing.

## Not changed

- Body text is 18px/1.55 black on white (21:1) and is left alone.
- Form controls in the reporting flow already met target size and contrast; only labels were small.
- The programs table keeps its horizontal scroll: it is a wide data table, and the scroll region is
  labelled and keyboard reachable.

## How this was checked

- `npm run test:browser` asserts the header structure, the portal drawer, the collapsed export
  disclosure, the annual report tab and embedding, and no overflow at 390px. It also walks the new Log
  data flow: no `Use previous entries` button, all four sections on one page, explicit yard numbers,
  submit, reload, receipt, inline submission history on the Submissions tab, and the embedded PDF.
- A browser pass at 320px measured `document.documentElement.scrollWidth <= innerWidth` on Overview,
  Programs, Your submissions and Annual report.
- Contrast ratios were computed from the CSS colour values; recheck them if a colour changes.
