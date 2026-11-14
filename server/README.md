# LOCAL-ONLY synthetic Neon demo bridge

This is **not authentication, not a hosted architecture, and not a production backend**. It serves the existing static site and a same-origin API at **http://127.0.0.1:8830**. It uses Node built-ins and the installed `psql` executable, one bounded child process per database operation. No npm install, framework, Google integration, schema migration, automatic organization creation, or dual write.

Only synthetic sandbox counts belong here. Never enter participant names, CDCR numbers, dates of birth, personal contact information, or real member submissions. Anyone on this computer can impersonate any demo account. Do not expose this port through tunnels, proxies, containers, or LAN forwarding. Host/Origin checks are defense in depth, not a login system.

## Requirements and run

- Node **22+** and PostgreSQL's `psql` CLI on `PATH` (a modern libpq with TLS).
- The **existing demo branch**, already containing:
  - `public.organizations(id text, name text, profile jsonb)`
  - `public.submissions(id text PRIMARY KEY, org_id text REFERENCES public.organizations(id), document jsonb, received_at timestamptz)`
- A private `DATABASE_URL` for that branch, with credentials and database name. Use `sslmode=require` or stronger. URL options accepted: `sslmode` and optional `channel_binding`; other options fail closed. Database names must use only letters, digits, underscores or hyphens (to prevent libpq connection-string expansion). Ambient `PG*` settings are not inherited.
- Mandatory exact hostname confirmation through `NEON_EXPECTED_HOST`. This must be the URL's actual hostname, not a suffix or alias. The requested sandbox branch hostname is `ep-restless-surf-arinnqli.c-4.us-west-2.aws.neon.tech`. A pooler hostname is different and will not pass that confirmation.

Quick start for the configured isolated branch (requires the signed-in Neon CLI):

```sh
node server/start-demo.mjs
```

Open <http://127.0.0.1:8830/intake/simple.html?account=org-1> to file, or <http://127.0.0.1:8830/team-dashboard/#tpw> to view all demo organizations and download exports. The launcher captures the connection string privately in memory and verifies the sandbox hostname. Stop with Ctrl-C. It never creates or selects a production branch. The branch remains in Neon after the local process stops.

For manual configuration instead, from the repository root, load `DATABASE_URL` into your shell **privately** (your secret manager or an untracked, access-restricted environment file outside the public tree). Do not paste it in commands, screenshots, logs, commits, or chat. Then run:

```sh
export NEON_EXPECTED_HOST=ep-restless-surf-arinnqli.c-4.us-west-2.aws.neon.tech
TPW_DEMO_SERVER=1 node server/index.mjs
```

The server binds only `127.0.0.1:8830`. Startup validates settings but does **not** connect to the database. An explicit data/health request initiates the connection. The fake-database suites run without credentials. A separate opt-in live browser check has also passed against `avery-neon-connection`: one synthetic submission, lost-response recovery, same-ID retry, dashboard read and CSV/JSON exports. Neither `production`, `demo-neon` nor Google Sheets was written during that check.

`DATABASE_URL` is parsed into narrowly selected `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and TLS environment values for `psql`; the DSN never appears in arguments. SQL goes through stdin without a shell; `psql -X -w -v ON_ERROR_STOP=1` disables rc files and password prompts. SQL literals explicitly escape quotes and backslashes. Each operation runs in a transaction with `standard_conforming_strings=on`, an 8-second statement timeout, a 4-second lock timeout, a 5-second connection timeout and a 12-second process deadline. Output is capped at 16 MiB. Errors never forward `psql` stderr or connection settings. A lost acknowledgement may follow a committed write: retry the **same** UUID and answers to obtain the original receipt.

No fallback to sample data exists in this API. Database failures return JSON with HTTP 503. The frontend must not hide that failure with sample data.

## Tests (no database or external network)

```sh
node --test server/test.mjs team-form/test/neon-client.mjs
node server/browser.mjs  # Chrome required; self-starts server with fake database
```

To explicitly repeat a **live synthetic write** against the isolated sandbox server already running on port 8830:

```sh
TPW_LIVE_BROWSER_TEST=1 node server/browser.mjs
```

Each live run leaves one synthetic integration-test submission in that branch; it does not delete or clean up records. The default browser run uses a fake database, not Neon. Set `CHROME_BIN` if Chrome is not at the default macOS path.

Tests use Node's test runner, fake DB and fake child-process dependencies, and real HTTP bound to loopback on ephemeral ports. They cover identity/scope forgery, validator and snapshot mapping, atomic idempotency SQL, stable hashes, read/write/export contracts, formula-safe CSV, historical missing counts, TLS/host checks, unsafe origin/path/Host, symlinks, byte limits, and explicit database failure. Nothing calls Google or Neon. The fake unit and browser tests are included in `.github/workflows/tests.yml`; CI has no database credentials and never runs the opt-in live write.

## Frontend integration and exact API contract

The only static override is `/team-form/backend.js` (including cache-token variants). It returns:

```js
window.TPW_BACKEND_URL = new URL('/api/', location.origin).href;
window.TPW_NEON_DEMO = true;
```

It contains no credentials and does not modify the repository's production file. The frontend must use these flags, pass demo account information explicitly, and stay on this same origin. In particular, **capability requests also require `account`**. These files do not change production hosting or Apps Script behavior.

### Request identity and scope

- GET requests: `account=org-1`, `account=org-2`, or `account=tpw` is mandatory. Missing/unknown accounts return 403, never an all-organizations default.
- POST: body envelope `{ "token": "demo:org-1", "payload": { ... } }`, or `demo:org-2` / `demo:tpw`. These are labels, **not secrets or authentication**. If a query account is also supplied it must match the token.
- A member's POST must contain both their exact `orgId` and their organization name (case-insensitive comparison after whitespace normalization). Both must match the existing database organization. Members can only read their own organization.
- TPW can read every existing organization and submit to an existing organization by ID (optionally with its matching name) or by exact case-insensitive name. Unknown or ambiguous names fail; nothing is auto-created.
- Optional `org` and `name` GET filters are intersections with the allowed scope. `org` uses the authoritative database ID. A name can only narrow; it never grants access or overrides an ID. Database `org_id`, not a document's claimed ID/name, governs record ownership.

### GET `/api/?account=org-1`

Capability response: `{ok:true, service, formVersion:2, localDemo:true, features:{programNotes:true,currentQuarter:true,dashboard:true,testData:true,export:true}}`.

### GET `/api/?view=dashboard&account=org-1`

Optional `&org=org-1&name=Org%201`. Returns `{ok:true,localDemo:true,orgs:[...],submissions:[...]}` in the legacy dashboard shape. Profiles have authoritative `id`/`name`. New submission dashboard `id` is the 64-character hash portion of the namespaced database primary key, so it fits the legacy `previousSubmissionId` validator; the short receipt reference is separate. Submissions include `orgId`, `organization`, `prisons`, `programs`, `reportingPeriod`, `submittedAt`, and always `synthetic:true,testData:true` in this local sandbox. Each newly saved program preserves ID/name/status/dates/courseHours/notes, per-yard `sites:[{code,yard,participants,completed}]`, `assignments:[{code,yards}]`, aggregate `participants`, and `participantsCompleted`. Prisons have `code`, `name`, `yards`. Database receipt time is authoritative. Internal retry metadata, email fields and tokens are excluded recursively.

This is **history**, not a latest-only/current-quarter projection; dashboard consumers retain their existing quarter/latest selection logic.

### POST `/api/`

JSON envelope accepted with either `application/json` or the form's existing `text/plain` content type. Limit: **250,000 bytes**.

```json
{
  "token": "demo:org-1",
  "payload": {
    "submissionId": "12345678-1234-4123-8123-123456789abc",
    "orgId": "org-1",
    "organization": "Org 1",
    "reportingPeriod": {"year": 2026, "quarter": 4},
    "programs": [{
      "id": "practice",
      "name": "Practice program",
      "status": "In Progress",
      "startDate": "2026-10-01",
      "endDate": "",
      "courseHours": 12,
      "notes": "Synthetic demo context only",
      "sites": [{"facilityCode":"ASP","yard":"A","participants":8,"completed":4}]
    }]
  }
}
```

`submissionId` is a mandatory UUID retry key, not a server receipt. Generate once per intended submission; keep it unchanged across retries. Optional `previousSubmissionId` follows the legacy validator. All canonical fields above are allowlisted; arbitrary extra fields and sensitive envelope fields are not stored. Stored `schemaVersion:1`, `synthetic:true`, `testData:true`, `source:'neon-local-demo'` are server-controlled. Client copies cannot disable the sample badge.

The pure `team-form/receiver/Rows.gs` validator is loaded through `node:vm`; **no Google runtime is executed**. The `Code.gs` notes/status rules are applied: only In Progress/Completed, optional notes text at most 2,000 characters, existing counts/date/facility limits. Reporting period is set by the server clock in **America/Los_Angeles**, matching `Code.gs`; a client cannot backdate a new filing by changing its quarter.

Returns HTTP 200 and legacy-compatible:

```json
{"ok":true,"submissionId":"ABCDEF123456","reference":"ABCDEF123456","rows":1,"organization":"Org 1","signedIn":false}
```

Durable idempotency uses `neon-demo:` + SHA256(org ID + NUL + lowercase browser UUID) as the existing text primary key. An internal document hash covers canonical request content **before** server quarter/time/receipt assignment. An atomic `INSERT ... ON CONFLICT(id) DO UPDATE SET id=existing.id RETURNING ...` obtains the saved record even after a process restart or concurrent retry. It does not replace its contents or time. Same hash returns the stored receipt; different content with that UUID returns 409. Unknown/unallowlisted fields do not affect the canonical hash. Browser reporting-period values do affect it; the server receipt time does not. No memory/cache-only deduplication.

### GET `/api/export?account=org-1&format=json|csv`

Optional narrowing `org` and `name` filters behave exactly as the dashboard. Downloads are named `tpw-demo-history.json` / `.csv`. They include **all scoped historical submissions**, not just current records, so do not sum the whole history as if it were one quarter.

- JSON: `{ok:true,localDemo:true,coverage:'history (...)',orgs,submissions}`. Full canonical owned documents retain historical/extra structured content except private fields, including all per-yard detail where available. This is the full-fidelity format and the recommended backup. Internal retry metadata and emails are removed. Ownership and sample flags are canonicalized by the server.
- CSV: UTF-8 with BOM and RFC-style quotes/CRLF, one program/yard row. Its first 18 columns exactly match `Rows.gs` `HEADER`, followed by `Organization ID`, `Program ID`, `Facility code`, `Coverage / warning`, `Test data`. Submitted By is blank and Sign-in Checked is No. Unsafe formula-like text (including whitespace prefixes and tabs/controls) gets a leading apostrophe; finite numeric values remain numeric, including negatives. Quotes/newlines are escaped. Text may therefore differ from JSON intentionally for spreadsheet safety.
- **Historical records with only aggregate program counts and assignments have blank per-yard counts/calculated participant-hours and an explicit warning column.** Aggregates are not divided or duplicated across yards. JSON retains those aggregate counts. Rows without site/program detail get a warning placeholder. Program course hours remain the recorded program-level course hours, not an invented per-yard delivered-hours measure. CSV is an analysis view, not a lossless archive.

### GET `/api/health?account=tpw`

Read-only aggregate `{ok:true,localDemo:true,counts:{organizations,submissions}}`. TPW demo account only. No hostnames, database names, credentials or organization-level counts are returned. This is the simplest operator-initiated connection check.

Errors use real HTTP status codes and `{ok:false,errors:[plain-language message]}`: 400 validation/JSON, 403 identity/origin/Host, 404 unknown/publicly unavailable file, 405 method, 409 changed retry, 413 byte limit, 503 database/unexpected failure. No wildcard CORS or credential routes. Host must be `127.0.0.1:<actual-port>` or `localhost:<actual-port>`; if present Origin must exactly match `http://<Host>`. `Sec-Fetch-Site` must be same-origin or none if present. Open browser pages consistently under the 127.0.0.1 address.

Static files are restricted to frontend paths and recognized public asset types. `server/`, `work/`, `.git`, dotfiles/env, tests, receiver sources, scripts, and general docs are unavailable. Only the two specifically named public source PDFs under docs are permitted. Directory listings, traversal, and symlinks at any path component are denied. In local mode `/team-dashboard/raw-data.html` is replaced by a Neon download page; it never embeds or links to the old Google Sheet. The backend source and private environment paths are also excluded from the GitHub Pages build.

## Form recovery limits

In local mode a completed submission attempt is saved in browser storage **before** sending. An uncertain result retains the original UUID/payload across refresh; retrying it returns the original database receipt. Definitive pre-write rejections release the pending attempt without clearing editor answers. Confirmed submissions remain recoverable until the explicit **Log more data** action. A different payload after an uncertain save is blocked rather than silently filing twice.

This is not full draft autosave: unsubmitted edits and active unfinished program fields are not persisted. Browser storage can be removed by the user/browser, and the current program-editing UI still has destructive transitions documented in the migration review. Do not promise complete form-loss protection yet. Neither a correction UI nor production authentication nor Google synchronization is implemented in this milestone.

The `psql` subprocess adapter is deliberately a local development bridge that preserves this repository's dependency-free constraint. It is not a proposed hosted service or scalability pattern. A deployed API should use a normal Postgres driver and verified server-side identity after agreeing backend tooling/hosting.

## Actual Google Sheets CSV import (manual, no API)

This bridge does **not** write to the production Google Sheet. To review/export the demo:

1. Sign in as the TPW demo account in the local website, then download `/api/export?account=tpw&format=json` as your structured backup and `/api/export?account=tpw&format=csv` for Sheets. For a member-only download use their account instead. Check the history and warning columns before analysis.
2. Open Google Drive in the Google account that should own the **separate synthetic scratch spreadsheet**. Choose **New → Google Sheets → Blank spreadsheet**; name it **TPW SYNTHETIC local demo history — NOT production**.
3. In that new spreadsheet choose **File → Import → Upload → Browse**, and select `tpw-demo-history.csv`.
4. Choose **Insert new sheet(s)** (not append/replace a live tab), separator **Comma**, and **turn off “Convert text to numbers, dates, and formulas”**. Click **Import data**. This preserves identifiers and literal context. Numeric/date columns may consequently be text; convert only the intended metric/date columns in a separate analysis copy after inspection. Do not enable formula interpretation for the imported context/name fields.
5. Verify the first 18 headings against `Rows.gs`, the `Test data` column says Yes, the reporting-quarter/history coverage, and the downloaded row count. Filter `Coverage / warning` for missing per-yard detail; blank counts mean unknown, **not zero**. Use JSON for aggregate-only historic records. Do not fill missing counts by repeating program aggregates.
6. Keep the JSON beside the CSV as the full-fidelity artifact. These CSV rows are history and can contain repeated organizations/programs across filings; select a reporting period and latest filing deliberately before totaling.

Do not import into TPW's live tab, rename its headings, paste into Additional data (JSON), or treat this CSV as a production migration. A future migration needs human-approved deduplication, reconstruction of row snapshots, testing, and a separate security/authentication design. No source is silently dual-written.
