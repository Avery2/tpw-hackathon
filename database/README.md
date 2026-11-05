# Authenticated Neon Data API sandbox

`001_data_api.sql` is applied and live-tested on **`avery-neon-connection` only**. `production` and `demo-neon` were not modified. The opt-in `/neon/` page signs in through Neon Auth, then the existing form, prefill, dashboard and downloads use the built-in Data API directly. No hosted custom API or Neon Function is involved. The default Sheets demo remains unchanged; it does not become authenticated simply because this sandbox exists.

## Open and assign access

1. Open <https://www.averychan.site/tpw-hackathon/neon/> and create a sandbox account or sign in.
2. New accounts start with **no organization access**. Copy the displayed Auth user ID; a trusted administrator independently verifies the account and TPW-approved access before granting it.
3. The following operator commands use the signed-in Neon CLI, pin the sandbox branch/project and verify the exact database host. Database credentials stay in the child process environment, never command arguments or browser code:

   ```bash
   # Ordinary member, restricted to the existing organization ID:
   node database/admin.mjs --grant-user VERIFIED_AUTH_USER_ID --org ORG_ID
   # Deliberate all-organization TPW staff grant:
   node database/admin.mjs --grant-user VERIFIED_AUTH_USER_ID --staff
   ```

4. On the account page, select **Refresh access**, then **Log sandbox data** or **Open sandbox dashboard**. Demo selectors and forged URLs cannot grant access. CSV/JSON downloads contain the authorized dataset; Google Sheets imports are copies, not synchronization.

The sandbox Auth trusted origin includes `https://www.averychan.site`; localhost is allowed. Email verification is not required in this test branch. App access must therefore be assigned only after independent administrator verification. OAuth, password reset UI, invitations, draft autosave and production handoff are not implemented. Auth uses HttpOnly, Secure, SameSite=None partitioned cookies; verified in Chrome, not promised across all browser privacy settings. Already-issued JWTs can remain valid until their expiry after sign-out; membership removal is checked on every database request. Only completed save attempts are retained in browser storage for recovery, scoped by Auth user ID and account, not unfinished drafts.

This remains a **made-up-data sandbox**: every new submission has `synthetic: true` and `testData: true`. Do not use it for real member data without TPW's separate go-live review.

## Apply (administrator, not browser)

1. In the Neon console, explicitly select the existing **`avery-neon-connection`** branch and its existing database. Verify the branch's endpoint against the privately supplied connection settings. Branch names are control-plane metadata: SQL cannot reliably prove which branch a connection targets.
2. Confirm the existing tables are `public.organizations(id text, name text, profile jsonb)` and `public.submissions(id text PRIMARY KEY, org_id text REFERENCES public.organizations(id), document jsonb, received_at timestamptz)`. Existing organization IDs used for filing must satisfy `^[a-z0-9][a-z0-9-]{0,63}$`. This migration does not import, rename, create or update organizations or existing submissions.
3. Use PostgreSQL **17+ with ICU** (`pg_catalog.unicode` root collation) and built-in `sha256(bytea)`; no extension is installed. The root ICU collation avoids database-locale-dependent case checks. Check that `auth.user_id()` returns **text**, specifically the **verified JWT `sub`**, and that Data API uses `authenticated` for valid sessions and `anonymous` otherwise. Browser labels, demo accounts, account query parameters and emails are not authorization.
4. Apply as the existing tables' trusted owner (or a trusted administrative role inheriting that owner). This role owns the new schema, private tables and SECURITY DEFINER RPCs; API roles must not inherit it, own these objects, be superusers or have BYPASSRLS. FORCE RLS on these existing tables is deliberately rejected. Do not later transfer RPC ownership to an API role.
5. Audit existing exposed views and functions, inherited roles and grants. This migration secures these two tables and the TPW RPCs, not unrelated definer functions or owner-rights views. Remove unrelated bypass paths through a separately reviewed change before exposing the API. Keep `tpw_private` out of Data API's exposed schemas; do not grant API users SQL/admin credentials. Database `TEMP` access is not needed by the app; all functions explicitly place `pg_temp` last to prevent temporary-type shadowing.
6. After Neon's broad/default Data API grants have been installed, apply **only `001_data_api.sql`** using the SQL editor, or a privately configured **direct/unpooled** administrative connection:

   ```bash
   # ADMIN ONLY. Requires Neon CLI access; hard-pinned to this sandbox.
   node database/admin.mjs --apply
   ```

   `BEGIN`/`COMMIT` make application atomic; errors require rollback before retrying in a persistent SQL-editor session. The migration is rerunnable. It uses additive tables/functions/policies and revocations, not destructive row operations. Existing answer JSON, including historical `_retry` data, stays untouched. The private retry ledger starts empty; old local-demo/Google receipts are not silently migrated.
7. Verify the RPCs appear in Data API's schema cache; use the service's normal schema-cache refresh mechanism if required. **Do not reapply broad grants afterwards**: table-wide SELECT would make raw JSON readable regardless of RLS. Rerun this migration after any Data API permission provisioning that resets these ACLs. The migration checks for unsafe inherited table/column privileges and aborts instead of claiming it secured them. It also aborts if an existing named TPW restrictive guard has an unexpected definition.
8. Assign users explicitly as below, then verify signed-out, unassigned, member and staff behavior using made-up sandbox answers only. Applying this migration intentionally blocks the old browser/local demo bridge's direct-DML path when that bridge uses an API role. Trusted database-admin access remains admin access.

**Never apply `test-bootstrap.sql` or `contract.sql` to Neon.** They are disposable-local-database fixtures only. Never use the test-only mock `auth.user_id()` in the real database.

## Assign membership by verified Auth user ID

A trusted administrator must obtain the user's exact Auth user ID (JWT subject) from the Auth admin interface / independently verified account record, confirm who they are and which organization TPW approved, and select the existing organization ID. Do not grant access from an arbitrary email string, email domain, user-supplied organization name or browser demo account. Memberships are app-owned, not Auth's organization tables.

Execute these statements as the database administrator, **substituting verified values** for the clearly marked placeholders (these are not real user IDs):

```sql
BEGIN;
-- Inspect existing organization IDs before choosing one.
SELECT id, name FROM public.organizations ORDER BY id;

-- Normal member: access to exactly the organization assigned here.
INSERT INTO tpw_private.memberships(user_id, org_id)
VALUES ('REPLACE_WITH_VERIFIED_AUTH_USER_ID', 'REPLACE_WITH_EXISTING_ORG_ID')
ON CONFLICT (user_id, org_id) DO NOTHING;
COMMIT;
```

Staff is a separate, deliberate grant; **staff can read and file for every organization**:

```sql
BEGIN;
INSERT INTO tpw_private.staff_users(user_id)
VALUES ('REPLACE_WITH_VERIFIED_STAFF_AUTH_USER_ID')
ON CONFLICT (user_id) DO NOTHING;
COMMIT;
```

There is no self-assignment or membership-management public function. Neither authenticated users nor staff can write membership tables through Data API. Multiple memberships are supported; the browser must ask which organization when more than one is assigned. Changes/revocations are administrator work outside this additive migration; do not invent an update/delete RPC. As `neon_auth`'s exact local schema was not confirmed, this migration does not query it or assume user/banned column names. Auth must reject expired/revoked sessions; app membership is checked on every RPC. An administrative account-removal process must also revoke app memberships/staff access.

## RPC contract

Use the existing branch's Data API base URL, `Content-Type: application/json` and a valid verified-session `Authorization: Bearer …` header. Tokens are headers, not payload fields. No service/admin database credential belongs in the browser.

### `POST /rpc/tpw_context` — body `{}`

Returns:

```json
{"ok":true,"userId":"verified-subject","isStaff":false,"orgs":[{"id":"existing-org-id","name":"Existing organization"}],"accountKey":"existing-org-id"}
```

Safe profile fields are flattened alongside authoritative `id`/`name`: `description` (string) and `programCatalog` (array of `{id,name}` strings only). Other profile fields are not returned. Staff sees all organizations and `accountKey: "tpw"`. A sole membership gives its organization ID; multiple memberships give `null`. A signed-in but unassigned user receives `orgs: []`, `accountKey: null`, `isStaff: false`; they cannot read submissions or file answers.

### `POST /rpc/tpw_dashboard` — body `{"p_org_id":null}` or `{"p_org_id":"existing-org-id"}`

Returns `{"ok":true,"orgs":[safe profiles],"submissions":[legacy dashboard documents]}`. Members see only their assigned organizations; requesting another ID fails with SQLSTATE `42501`, not a silent empty result. Staff may omit the ID for all organizations or supply one to narrow the result. Unassigned or signed-out callers are denied.

`orgId`, `organization` and `submittedAt` are always derived from the row's organization FK, current organization name and `received_at`. The stored legacy dashboard ID is retained, falling back to the database record ID only when missing. Recursive typed allowlists retain:

- Root: `id`, `orgId`, `organization`, `submittedAt`, `previousSubmissionId`, numeric `schemaVersion`, boolean `synthetic`/`testData`, `reportingPeriod`, `prisons`, `programs`, `totals`.
- Reporting period: numeric `year` and `quarter`.
- Programs: string `id`, `name`, `status`, `startDate`, `endDate`, `notes`; numeric `courseHours`, `participants`, `participantsCompleted`; `sites` and `assignments` below.
- Sites: string `code`, `yard`; numeric `participants`, `completed`.
- Assignments: string `code`, string-array `yards`. Prisons: string `code`, `name`, string-array `yards`.
- Optional root totals: numeric `participants`, `participantsCompleted`, `courseHours`, `programs`, `facilities`, `hours`, `completed`.

No arbitrary subtree is copied. Internal/underscore fields, retry records, emails, tokens, attachments and actor identity fields have no place in these allowlists, at any depth. Free-text names/notes remain free text: this is not a content-level personal-information detector. Only counts and non-identifying program context belong in the form. Historical aggregate-only programs retain their supplied counts; absent/null per-yard detail is **not fabricated or apportioned**. No duplicate totals are generated for old imports.

### `POST /rpc/tpw_submit` — body `{"p_payload": existingFormToPayload}`

This is a volatile, transactional PostgreSQL function, not a hosted function or Node endpoint. It accepts the form's direct `toPayload()` object (not a `{token,payload}` envelope). Required `submissionId` is the form's UUID retry ID. Other accepted answer fields are `orgId`, `organization`, optional `previousSubmissionId`, and `programs` containing `id`, `name`, `notes`, `status`, `startDate`, `endDate`, `courseHours`, `sites[{facilityCode,yard,participants,completed}]`. All other fields are ignored for storage and hashing, but still count toward the body cap. The caller's `reportingPeriod` is ignored, just as in `Code.gs`.

Validation is entirely inside SQL, even when bypassing the UI:

- Payload object, UUID retry ID, optional organization/previous/program ID patterns from `Rows.gs`; previous ID at most 64 characters, program ID at most 80.
- 1–60 programs; 1–130 sites per program; only the exact 31 `Rows.gs` facility codes.
- Normalized nonempty program names at most 120 UTF-16 units; yards at most 40. JavaScript whitespace normalization and Unicode case-insensitive duplicate prison/yard rejection within each program. Notes must be text, at most 2,000 UTF-16 units before end trimming.
- Only **In Progress** / **Completed** (the narrower `Code.gs` rule); real dates from 2000–2099; start required; Completed needs end; end cannot precede start.
- Numeric—not string/boolean/null—course hours in 0–5,000; whole numeric participant/completed counts in 0–100,000; completed cannot exceed participants.
- Complete parsed payload's canonical JSON representation is capped at **250,000 UTF-8 bytes**, including ignored fields. This is deliberately stricter than Apps Script's 250,000 JavaScript-character check. SQL cannot count discarded HTTP whitespace after Data API parses JSON; configure a matching transport/request-size cap separately if needed. The old per-Sheet-row 20,000-character snapshot cap is not applicable: no Google snapshot is generated, and no arbitrary extensions are stored.

An omitted member organization ID defaults only when exactly one membership exists. Supplied other IDs and mismatching organization names are rejected. Staff must choose an existing organization by ID or normalized case-insensitive name; names must match exactly one existing organization. No auto-create behavior.

SQL derives the received timestamp, current filing quarter in **America/Los_Angeles**, organization identity, totals, assignments and prison summary. New public documents contain no actor or retry metadata. The storage PK is `neon-api:` plus a 64-character SHA-256 hash of `[orgId, requestUUID]`; `document.id` is just the 64-character hash and can be used as `previousSubmissionId`. Receipt IDs are separate short references, not the request UUID or prefixed storage PK:

```json
{"ok":true,"submissionId":"12_HEX_CHARS","reference":"12_HEX_CHARS","rows":2,"organization":"Existing organization","signedIn":true}
```

`rows` is the count of program/yard sites, not the number of JSON submissions. Member-supplied aggregate totals and browser identity fields are never trusted. There are **no UPDATE/DELETE/correction APIs**; corrections are explicitly deferred to a separately reviewed design.

## Durable, atomic retries

`tpw_private.submission_requests` has PK `(org_id, request_id)` and stores the canonical answer hash, storage submission ID, exact JSON receipt, private actor subject and timestamp. The RPC takes a transaction-scoped advisory lock for organization + request UUID **before** looking up a prior request. The row insert and request insert commit together; failures roll back both.

A retry with the same canonical answers returns the saved receipt exactly, even across filing-quarter boundaries. The canonical hash excludes time, derived quarter, browser metadata and server identity; whitespace-normalized answer fields and canonical numeric values are hashed. Same UUID + changed canonical answers raises SQLSTATE `22023` containing **`TPW_RETRY_CONFLICT`** and never overwrites the saved document. Generate a new UUID only for a deliberate new answer set, not after a network failure. Permission checks run again before returning a saved receipt. An authorized member of the same organization can retry its request; UUIDs are scoped to the organization, not to the actor.

Data API surfaces SQL errors rather than the old `{ok:false}` envelope: `42501` is an access/sign-in issue, `22023` is an answer-validation/retry-conflict issue. UI integration should keep answers on the page, explain the problem in plain words and direct unresolved cases to TPW. Do not display raw internal SQL diagnostics as a substitute for those messages.

## Privileges and tests

Only authenticated users can execute the three RPCs and the two RLS boolean helpers. Every new function loses default PUBLIC execution. API roles cannot use the private schema, tables or helpers. Public table and column DML grants are revoked, including independent column ACLs. Authenticated direct SELECT is limited to organization `id/name` and submission `id/org_id/received_at`, under helper-based RLS; **neither `document` nor `profile` can be directly selected**. Restrictive SELECT guards constrain pre-existing broad permissive policies. No INSERT/UPDATE/DELETE privilege is granted on either table.

Offline static checks (Node only, no database):

```bash
node database/test.mjs --static
```

Full offline checks (Node plus local PostgreSQL 17+ binaries on PATH):

```bash
node database/test.mjs
```

The runner creates a disposable cluster, disables TCP listening, uses only its own temporary Unix socket, strips inherited database connection variables, applies the migration twice and removes the cluster afterwards. Fixtures are explicitly made up. Tests cover broad Neon-style ACLs, restrictive RLS against legacy permissive policies, unassigned/member/multi-member/staff scopes, nested redaction, untouched historical imports, strict validation, Unicode whitespace/case, temporary-type shadowing, server quarter and canonical site summaries, UUID conflicts, and atomic rollback. Separate committed sessions test concurrent identical and conflicting retries; restarting the disposable database verifies durable receipt recovery. The offline suite makes no remote service call, package install, live Data API request or Google POST.

Explicit live verification (retains synthetic Auth users and submissions only on this sandbox):

```bash
TPW_LIVE_DATA_API_TEST=1 node database/live-test.mjs --prepare
node database/admin.mjs --test-fixtures
TPW_LIVE_DATA_API_TEST=1 node database/live-test.mjs
TPW_LIVE_DATA_API_TEST=1 node database/browser.mjs
```

The first command creates four synthetic `@example.invalid` accounts and stores fixture passwords only in gitignored `work/neon-data-api/identities.json` with mode 0600. JWTs/session tokens are not persisted. The grant command verifies the synthetic email pattern against Auth before granting the two member fixtures and staff fixture. The unassigned fixture stays unassigned. The API suite checks real sessions/JWTs, RLS, anonymous/tampered credentials, cross-org read/write denial, raw/private data denial, invalid inputs, concurrent same-ID retries, changed-answer conflict, durable receipts and scoped CSV/JSON. The browser suite signs in through the actual UI, reloads the session, submits the actual form, deliberately discards a committed save response, reloads/retries without duplicates, verifies dashboard/export scope despite a forged staff hash, and signs out. Its static test server has no database credentials and blocks all browser hosts except itself and the two sandbox endpoints, including Google. Tests passed against the live branch. CI runs only the offline suites; live writes always require the explicit environment opt-in.
