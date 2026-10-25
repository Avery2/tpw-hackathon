# Dashboard, raw data and demo account entry

**Dashboard** (`dashboard/index.html`) preserves the original participant chart,
program/prison/submission totals, RAC estimates and savings calculations. It
loads the existing Firebase data modules, not the new Sheet filings; the page
keeps a visible demo-preview notice. Demo organization keys (`#org-1`, `#org-2`,
`#tpw`) select the original views. Without a hash, it uses the remembered demo
account or Org 1. Nothing is removed or replaced by the embedded Sheet.

**Raw data** (`dashboard/raw-data.html`) separately embeds the actual [TPW reporting Google Sheet](https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/edit?gid=0#gid=0)
using its `/preview` URL. **Open in Google Sheets** is always available as a
fallback for sign-in, blocked third-party cookies, or a preview that fails to load.
Google's existing sharing permissions apply. This does not publish the workbook,
change its permissions, or bypass Google sign-in. Raw data does not load the
Firebase dashboard or seeded charts. Its Sheet is not filtered by the
`#org-1`, `#org-2` or `#tpw` demo keys; Google controls access to the whole workbook.

## Account drawer

**Members Login / Account** opens a visual mock of TPW's existing plain white
account drawer. Orders, Payment Methods, Address and Profile are static preview
sections, not working account tools. The only new entry is **Intake**, marked
with a small **New** badge, linking to **Log data**. The demo skips real sign-in:
it never collects a password, email or payment details. Close, Escape, backdrop
click and focus return work; the native modal keeps keyboard focus in the drawer.

The mirror's captured `site/` source remains unchanged. `scripts/build_site.py`
injects `assets/mirror-nav.js` into publication output; that bridge captures the
original Squarespace account controls and loads the same drawer used by authored
pages. Modified clicks still use the link's direct logging destination.

## Logging layout

The member pages keep the original TPW header/footer, a white background, and
three quiet horizontal links: **Log data**, **Dashboard**, then **Raw data**. Forms use the site's
normal gutters instead of a second narrow centered column. There is no outer
workspace card, sidebar, avatar or account picker. The logging choices are
**Quarterly totals** (first/default) and **Session**. After submission, a compact
receipt shows the organization, quarter and actual entered counts; mock savings
estimates are removed. Existing transport, retry IDs and backend validation are
unchanged.

`assets/site-shell.js` and `assets/site-shell.css` own the shared page layout.
`assets/account-drawer.js` and its stylesheet own the account mock.
`assets/member-session.js` stores only a demo account key in sessionStorage, not
credentials or form answers. Demo access is **not authentication** and does not
protect private data. Direct intake links work without a demo session. Old
Programs/check-in routes and `/members/` bookmarks return to logging. Embedded
guided forms omit duplicate website chrome and resize inside the parent;
printable rosters retain their letter-sized geometry without website chrome.

## Data sources

The original dashboard imports its existing Firebase data modules; sample
fixtures and seed scripts remain available. These records are not a summary of
new Google Sheet filings. No seed script runs on a visit, no Firebase security
rules are changed, and no new Sheet-to-Firebase sync is introduced. Raw data
shows the separate Google Sheet directly, under its existing permissions.
Legacy Programs/check-in helpers remain in the directory, with their old page
routes redirecting to logging as before.
