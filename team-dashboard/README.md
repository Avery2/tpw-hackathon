# Dashboard, data and demo account entry

**Dashboard** (`team-dashboard/index.html`) preserves the original participant chart,
program/prison/submission totals, RAC estimates and savings calculations. It
loads the existing Firebase data modules, not the new Sheet filings; the page
keeps a visible demo-preview notice. Demo organization keys (`#org-1`, `#org-2`,
`#tpw`) select the original views. Without a hash, it uses the remembered demo
account or Org 1. Nothing is removed or replaced by the embedded Sheet.

**Data** (`team-dashboard/raw-data.html`) separately embeds the actual [TPW reporting Google Sheet](https://docs.google.com/spreadsheets/d/1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0/edit?gid=0#gid=0)
using its `/preview` URL. **Open in Google Sheets** is always available as a
fallback for sign-in, blocked third-party cookies, or a preview that fails to load.
Google's existing sharing permissions apply. This does not publish the workbook,
change its permissions, or bypass Google sign-in. Data does not load the
Firebase dashboard or seeded charts. Its Sheet is not filtered by the
`#org-1`, `#org-2` or `#tpw` demo keys; Google controls access to the whole workbook.
Because the workbook holds every organization's numbers, only the TPW staff view (`#tpw`)
shows the **Data** tab. A member account that opens `raw-data.html` directly is sent to its
Dashboard. This only hides the tab; Google's sharing is still what decides who can open the Sheet.

## Account drawer

**Members Login**, when signed out, opens a copy of TPW's own sign-in box: the
"Welcome to TPW" panel from thetpw.org/account/login, measured on 25 Oct 2026 (480px
white box, Email, Password, dark **Sign in** button, Forgot Password? and Create account).
The password box is switched off and nothing is checked. Typing one of the demo emails, or
pressing **Org 1**, **Org 2** or **TPW staff**, picks that demo account and goes straight to
**Log data**; any other email gets "This demo only has three accounts". Forgot Password? and
Create account just say they aren't part of the demo.

Signed in, **Account** opens a visual mock of TPW's existing plain white
account drawer, greeting the demo account by name ("Hi, Org 1"). Orders, Payment Methods, Address and Profile are static preview
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
quiet horizontal links: **Log data** and **Dashboard**, plus **Data** for the TPW staff view only. Forms use the site's
normal gutters instead of a second narrow centered column. There is no outer
workspace card, sidebar, avatar or account picker. The only logging tab is
**Quarterly totals** (the Session tab was removed on 25 Oct 2026). After submission, a compact
receipt shows the organization, quarter and actual entered counts; mock savings
estimates are removed. Existing transport, retry IDs and backend validation are
unchanged.

`assets/site-shell.js` and `assets/site-shell.css` own the shared page layout.
`assets/account-drawer.js` and its stylesheet own the account mock.
`assets/member-session.js` stores only a demo account key in sessionStorage, not
credentials or form answers. Demo access is **not authentication** and does not
protect private data. Direct intake links work without a demo session. Old
Programs routes and `/members/` bookmarks return to logging. The separate check-in
page is gone: the guided form itself now starts from the organization's last report. Embedded
guided forms omit duplicate website chrome and resize inside the parent;
printable rosters retain their letter-sized geometry without website chrome.

## Data sources

The original dashboard imports its existing Firebase data modules; sample
fixtures and seed scripts remain available. These records are not a summary of
new Google Sheet filings. No seed script runs on a visit, no Firebase security
rules are changed, and no new Sheet-to-Firebase sync is introduced. Data
shows the separate Google Sheet directly, under its existing permissions.
The legacy Programs helper remains in the directory, with its old page route
redirecting to logging as before.
