# admin/ — Google-side tools

**Start with [`additional-forms/`](additional-forms/README.md)** for the separate
Session/follow-up/future-form receiver. Its new endpoint is configured in
`intake/backend.js`; it shares the master workbook, not the quarterly Apps Script
project or deployment. Generate its schema configuration with
`python3 scripts/build_additional_forms.py`. Its separate Google deployment is now
configured for the Session frontend and has confirmed a synthetic Session
save/retry.

The two **older optional** web apps below (`sheetforms/` and `steward/`) remain
additive and inert. The historical notes below apply to those two only, not the
additional-forms receiver.

| Path | What |
|---|---|
| `additional-forms/` | Current standalone receiver for Sessions, follow-ups and other approved forms; one separate endpoint, same private master workbook. |
| `sheetforms/` | An older intake receiver: a member organization files a cycle from the browser with **no GitHub account and no Google account**, and the row lands in a spreadsheet the organization owns. |
| `steward/` | A steward console: a per-organization view of the published JSON, gated on Google identity — `steward` sees org rows, `viewer` sees combined figures only. |

Each has its own `README.md` with deploy steps, and a `test/` harness that runs
the real `Code.gs` against this repo's real contract and data files with Apps
Script's globals stubbed. Standard-library Node only — no `package.json`, no
npm, no bundler:

```bash
node admin/sheetforms/test/run.mjs
node admin/steward/test/run.mjs
```

## Why they exist

The site's answer to storage is "git is the database": a submission becomes a
file plus a commit. That is honest and auditable, and it costs a GitHub account.
Some member organizations will not have one, or will not want the CDCR-visible
step of creating one. The receiver is the escape hatch: a public write endpoint
that appends to a sheet the organization owns, which a steward then exports into
the ledger after stripping anything person-shaped. The console is the reading
half of the same idea — a working view for whoever chases missing rows.

Neither is a second database and neither is on the demo path. The ledger is
still git; the sheet is a mailbox, never a source of record.

## Neither is wired into `intake/` yet

- **The receiver is ready; nothing posts to it.** `intake/js/transport.js` files
  to GitHub only (issue, access token, commit) and knows nothing about a Google
  endpoint. Wiring it means adding a `google` mode there — POST the payload as
  `text/plain` to the `/exec` URL, then treat the sheet row as the receipt,
  because Apps Script sends no CORS headers and the browser cannot read the
  reply. That is a change to a shared, committed file and a product decision:
  it creates a second route into the same numbers, so somebody has to own the
  export step.
- **The console needs no wiring at all.** It reads files the site already
  publishes, so deploying it is the whole job.

`data/intake/documents.json` and the packet upload are unrelated; a packet is
read in the browser and never uploaded, while both tools here talk to Google.

## Before adopting either

- Read the tool's own `README.md`, especially the security posture sections.
  The receiver is a public write endpoint by design and its share key is a speed
  bump, not authentication; the console's gate decides who may act, not who may
  see.
- The spreadsheet is a working store. Never export it into this repo, never
  publish it, and never hand it to a funder as-is.
- Nothing here obeys the repo's "no personal data, ever" rule on your behalf.
  It refuses person-shaped *fields*; a name typed into `notes` is still stored.
