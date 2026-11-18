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
  disclosure, the annual report tab and embedding, and no overflow at 390px.
- A browser pass at 320px measured `document.documentElement.scrollWidth <= innerWidth` on Overview,
  Programs, Your submissions and Annual report.
- Contrast ratios were computed from the CSS colour values; recheck them if a colour changes.
