# Steward console (Apps Script)

A permission-aware view over the JSON this repo already publishes. Two files:
`Code.gs` (identity gate, view model) and `Index.html` (the page). Every number
on the page is read from `data/intake/orgs/index.json`, `cycles/index.json`,
`seed.json` and `schema.json` at request time, so the console cannot disagree
with the site — if it does, the cache is stale, not a second source of truth.

**Status: nothing in the live site links here.** It is an operator tool, outside
the demo path, in the same public repo. Deleting `admin/` changes nothing about
the site.

## Roles

| Role | Who | Sees |
|---|---|---|
| `steward` | email listed in `LEADER_EMAILS` | per-organization rows, and which organization owns each flagged cycle |
| `viewer` | any other signed-in Google account | combined figures and rule counts only — no organization names |

A viewer never receives per-organization rows: the filtering happens in
`getConsole()` on the server, not in the page. That mirrors
`min_cohort_for_release` in `schema.json` — the collective is shared, one
organization's numbers are not. The test suite checks this by searching the
serialized response for every organization name, not by trusting a flag.

The sign-in decides who may **act** (approve, chase, correct), not who may
*see*: everything this reads is public in git. It is not a secret channel.

## Deploy (about 5 minutes, one time)

1. <https://script.google.com> → **New project**. Name it `TPW steward console`.
2. Add two files to the project: `Code.gs` and `Index.html` (from this
   directory, verbatim — the page is an `HtmlService` template, so the file name
   matters: `Index.html`).
3. **Project Settings → Script properties**, add:
   - `LEADER_EMAILS` — comma or newline separated steward emails. **Required.**
     With it unset the console fails closed and tells you to add your own
     address, which is the intended first-run experience.
   - `DATA_BASE_URL` — optional. Defaults to
     `https://www.averychan.site/tpw-hackathon/`. Point it at a preview or a
     fork if you need to compare.
4. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** **Anyone with a Google account**
5. **Authorize** when prompted, then open the `/exec` URL while signed in.

Step 4 is not interchangeable. Under plain **Anyone** the caller is anonymous,
`Session.getActiveUser().getEmail()` comes back empty, and the page reports
`no-identity` with that hint rather than guessing who you are. Under **Anyone
with a Google account** the email is real and the gate means something.

To add a steward, edit `LEADER_EMAILS` and reload. No redeploy is needed for a
property change, but the view is cached for 15 minutes, so a figure that should
have moved may take that long to appear.

## Tests

```bash
node admin/steward/test/run.mjs
```

Runs the real `Code.gs` against the real published JSON with Apps Script's
globals stubbed: no account, no deployment, no network, standard-library Node
only. It is a development aid, not a runtime dependency.

## Honest limits

- **The KPIs include the sample rows.** `participant slots started/completed`
  are sums over every cycle on record, and the labels say so; `real (excl.
  sample)` is the figure to quote. `seed.json` contains rows flagged
  `sample-data` and the console counts them, deliberately, so a steward can see
  them.
- **The cache is 15 minutes.** Fine for a working view, wrong for a decision
  that must reflect a commit made a minute ago.
- **No actions yet.** It reads and flags; it cannot approve, chase or correct
  anything. When it can, every action needs a server-side role check in the same
  place as `getConsole()`, not a button the page hides.
- **The page is not framable** (`XFrameOptionsMode.DENY`). Keep it that way: the
  steward view names organizations.
