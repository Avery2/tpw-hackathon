# Neon migration and Google Sheets access

Status: proposed full migration plan. A first **local-only** Neon connection and CSV/JSON export milestone is implemented in [`../server/README.md`](../server/README.md), tested on an isolated child of `demo-neon`. This is not a production cutover: the published site, existing Apps Script and Google Sheet remain unchanged. Export/sync and nonprofit delivery research is summarized in [`google-sheets-options.md`](google-sheets-options.md).

## Goal

Keep the mirrored-site prototype usable for testing with TPW and member organizations. Move submission storage to Postgres on Neon without requiring a frontend rewrite. Preserve TPW's ability to access, export and control its data without developer help.

Target access rules:

- A member organization can read, submit and export its own data only.
- TPW staff can read and export all organizations' data. Any filing on behalf of a member is explicit and audited.
- Nothing outside TPW exposes an individual organization's figures without TPW's approval.
- Demo accounts and synthetic data remain usable in an isolated demo environment; they never grant access to production.

Google Sheets remains a useful interface, not a second independent source of truth. Spreadsheet editing back into the application is out of scope for the first migration.

## What exists today

### Website and Sheet

- `team-form/index.html`: `toPayload()` creates structured JSON; `sendToBackend()` POSTs it to Apps Script.
- `team-form/backend.js`: the deployed Apps Script address.
- `team-form/receiver/Code.gs`: HTTP entry points, validation orchestration, retry handling and heading mapping.
- `team-form/receiver/Rows.gs`: `HEADER`, field rules and `buildRows()`. This is the code-defined Sheet schema, not a SQL schema.
- `team-form/receiver/Sheet.gs`: `appendRows_()` writes to Google Sheets.
- `team-form/receiver/Dashboard.gs`: reads flat Sheet rows and reconstructs submission JSON.
- `assets/dashboard-source.js`: loads the feed and merges static sample organizations. The last-quarter prefill uses this data path too.

One Sheet row means one program at one facility and yard within a submission. The 18 core columns include organization, program, dates, hours, participant counts, calculated totals, submission metadata and reporting quarter. Two additional columns store a per-row JSON snapshot and a test-data marker.

The current feed is open; organization parameters are filters, not authorization. Demo sign-in is a browser label. The Sheet's Google sharing permissions do not protect the JSON feed.

### Existing Neon project (read-only inspection)

Organization: Nicolas. Project: `tpw-dev` (`twilight-bread-18135398`).

- `production` (`br-long-shadow-arqu83qg`): Neon Auth tables; no application tables were listed in the default database.
- `demo-neon` (`br-purple-dew-aryj527n`): Neon Auth tables plus:

```text
public.organizations
  id       text primary key
  name     text not null
  profile  jsonb not null default '{}'
  unique index on lower(name)

public.submissions
  id           text primary key
  org_id       text not null references organizations(id)
  document     jsonb not null
  received_at  timestamptz not null default now()
  indexes on org_id and reporting-period fields inside document
```

Both application tables currently have row-level security disabled and no RLS policies. This does not establish whether some separate application already enforces access. No submission contents or auth-user records were inspected for this plan.

Coordinate with Nicolas before changing these tables. Locate the migrations/importer/API that created them and reuse that work rather than starting a competing schema. Auth tables existing does not prove the current website uses Neon Auth.

## Recommended design

```text
Existing form and dashboards
          |
          v
Application API (server-side credentials, authorization, validation)
          |
          v
Neon transaction: submission + durable Sheet-sync job
          |
          +----> dashboard / prefill / CSV and JSON exports
          |
          v
Retrying worker ----> TPW-controlled Google Sheet
```

The browser submits once. A successful API response means Neon committed the submission, not necessarily that Google has updated yet. The Sheet is an eventually consistent projection, with a visible last-successful-sync time and actionable failures for staff.

Do not put database credentials, Google service credentials or an all-organizations API token in browser JS. GitHub Pages cannot host this API; deploy it separately while leaving the frontend static. No Next.js rewrite is required. Choose the backend host with Nicolas before implementation; do not assume the Neon project's region supports every Neon service.

The repository currently requires dependency-free code. An API using a Postgres driver and Google API integration will need an explicitly agreed backend dependency/tooling exception; do not silently introduce a frontend framework or bundler.

## Why not two browser writes?

A Sheet write can succeed while a Neon write fails, or vice versa. A timeout can also mean the write succeeded but its response was lost. Retrying both blindly produces duplicates or divergent datasets.

Instead, commit the submission and an outbox job in the same Postgres transaction. Retry Google delivery independently. Google downtime must not turn an accepted submission into a failed filing. Never fail over automatically to a second submission store.

If a longer Sheet-first validation period is needed, keep the old submission path unchanged and import from the Sheet into demo Neon on a repeatable schedule. During that period Sheets is authoritative and Neon is a comparison copy. This is an alternative transition stage, not a bidirectional sync design.

## Design for learning, not a fixed product

The current form and dashboard are hypotheses to test with TPW and members, not a finished specification. Expect new questions, changed definitions, incomplete reporting, corrected numbers and different reporting needs. The migration should make those changes cheaper without building a generic data platform in advance.

### Separate the things that change for different reasons

Use small, explicit modules with testable boundaries:

```text
Form UI -> input adapter -> validation/domain service -> submission repository
                                     |
                              authorized read service
                                     |
                    dashboard / prefill / CSV / Sheet adapters
```

- The form's step layout and labels are not the storage schema.
- The canonical submission is not the dashboard response or a Google Sheet row.
- Metrics are domain calculations with named definitions, not duplicated formulas in each screen/export.
- Google and Neon SDK calls live in adapters, not in UI handlers or metric calculations. Keep business logic ordinary JavaScript, with SQL/migrations in version control. Replacing a host or database provider should not require changing what a participant count means.
- Start with the actual boundaries needed here. Do not build an ORM abstraction framework, plugin system, drag-and-drop form builder or configurable metric language.

### Make changing a question an ordinary change

- Version the canonical document and meaningful metric definitions. Retain which version a historical filing used; distinguish an absent field in an old version from a member skipping a current question.
- Introduce fields additively where possible. Readers must tolerate known older versions, and a newly introduced field must not make older documents unreadable.
- Convert old versions through explicit, tested adapters for reads. Do not rewrite historical evidence just to make today's UI simpler.
- Keep stable internal field identifiers independent of labels and Sheet headings. Renaming a question must not silently create a new metric.
- Start with a small field-definition module for identifiers, types, units and missing-value rules shared where useful by form validation, server validation and export mapping. Keep cross-field/domain rules in code; do not attempt to generate the whole UI from metadata.
- For a new field, test its path through input, validation, storage, historical reads, dashboard calculations and exports. A display change should not require a storage migration; a meaning change may require a new field/version even if the label stays similar.

### Treat sparse and questionable data as information

- Never coerce a missing answer to `0`. Zero means reported none; missing means not reported. Add explicit not-applicable/unknown reasons only where member research establishes a need, rather than inventing distinctions they cannot answer.
- Keep units and denominators explicit. Enrollment, attendance, unique people and completions are different measures. Counts from different programs cannot automatically be added into a count of unique people.
- Do not add person-level attendance or identifiers just because the model is extensible. TPW currently collects aggregate counts only; changing that boundary needs a separate privacy and product decision.
- Reject structurally invalid input. Separate legitimate but unusual answers into review warnings where appropriate; never silently repair them. Historical imports can be quarantined with provenance and a reason, rather than guessed into validity.
- Metrics and exports should expose coverage when it matters: which organizations/periods reported a field, which values are missing, and what the total actually includes. Avoid presenting partial data as a complete coalition total.
- Record source, reporting period, receipt time, schema version and synthetic status. Audit actor information is private metadata, not an automatic part of member/public exports.

### Leave a small correction path, not a workflow engine

Preserve original accepted submissions and attach explicit revisions/correction links. Separate request retries from changed answers. Define one effective-record selection rule used by dashboards and exports, including how removed programs/yards are represented. A revision must not accidentally keep a deleted yard or erase an unrelated program.

The initial UI can be a simple edit-and-resubmit flow with a reason and receipt. Approval queues, custom workflows and per-field histories can wait until observed needs justify them. Spreadsheet round-trip editing remains a separate feature, not an implicit side effect of export.

### Refactor only enough to support the next experiment

First extract the current transport, validation/normalization and Sheet mapping from the large form/receiver files, preserving behavior with characterization tests. Then implement the new storage path behind those boundaries. Avoid a simultaneous frontend rewrite, metric redesign and database cutover.

A useful success test: adding one optional aggregate question should involve a field definition/domain rule, its UI and its relevant output mappings—not rewriting the submission pipeline. Changing a dashboard card or Sheet layout should not change persisted records. Fixing a historical answer should not require hand-editing JSON or database rows.

## Data model and compatibility

Start with the existing JSON document model; relationalizing every program and yard is not necessary for this migration. JSON is not a substitute for a contract: validate supported fields/types and document versions, and promote frequently queried or integrity-critical attributes into typed columns when actual use justifies it.

Before changing it:

1. Locate and version the existing schema and document contract. Check whether `document` contains the original per-yard numbers, not just dashboard totals. Aggregated totals cannot reconstruct a faithful Sheet export. Add characterization fixtures for current valid/invalid submissions, sparse historical documents and dashboard/export calculations before refactoring.
2. Define a canonical, versioned submission document containing program IDs, facilities/yards, their counts, dates, hours, notes, reporting period and test-data status. Allowlist fields; never persist auth tokens or arbitrary request bodies.
3. Keep organization ID and server receipt time authoritative outside the JSON. Reject or normalize conflicting JSON identity fields. Server-derived identity must win on reads and exports too.
4. Preserve existing validation limits and Sheet-compatible text/date handling during the behavior-preserving migration. Explicit missing answers must remain distinct from zero; any change to which questions are required is a separately tested form/domain change. Do not change quarter semantics during storage migration: the current server assigns the filing quarter in California time. A different reporting-quarter policy is a separate product decision.
5. Add durable idempotency: an organization-scoped client request ID, canonical payload hash and stored receipt. Same ID plus same payload returns the original receipt; same ID plus different payload is a conflict. Enforce uniqueness in Postgres, not a short-lived cache.
6. Preserve legacy references separately from new IDs. Do not assume the old eight-character receipt or a program's name is globally unique.
7. Add durable sync-job state, attempts, next retry, last error and completion metadata. Use a unique job key per submission/projection version.
8. Define corrections explicitly: new immutable revision linked to the corrected submission, with the effective revision selected consistently by dashboards and exports. Do not silently merge unrelated programs by name or treat retries as corrections.

Keep the dashboard response compatible with current `loadDashboard()` consumers. Replace the sample-file organization lookup with the server-authorized organization profile for the real path. Demo fixtures remain separate and visibly synthetic.

## Authorization contract

A verified session identifies the user. Server-managed membership records identify their allowed organization(s); a separately administered TPW staff role grants cross-organization access. Users must not be able to grant themselves membership or staff status. Inspect Nicolas's existing Auth setup before choosing or building identity integration.

- Own data: resolve allowed organization scope from the verified identity, never from `#org-1`, `?account=`, a typed name or a request's `orgId`.
- A requested organization filter may narrow access; it cannot broaden it.
- Every read, submission lookup, correction, prefill and export uses the same authorization layer.
- TPW staff can deliberately select an organization; record actor and target separately.
- Org membership changes and revoked/expired sessions take effect server-side.
- Use least-privilege database roles. If RLS is added as defense in depth, test with the actual runtime role; a database owner or BYPASSRLS role can bypass ordinary policies.
- Private responses must not leak through shared caches, logs, export links or static files.

A fake-data demo can precede real sign-in integration. However, a public demo selector must only reach the demo backend/branch. Server-side permission enforcement is an acceptance condition for real member data, not an unrelated UI redesign milestone.

## Google Sheets and data ownership

### First: downloadable exports

Provide CSV in the same one-program-per-yard shape as today's Sheet, plus a lossless JSON export. An organization gets its own records; TPW can export all organizations or a selected subset. Include reporting-period and current-vs-history options with documented defaults.

Generate exports server-side after authorization. Escape CSV correctly and prevent spreadsheet formula injection in untrusted text. Omit identity-provider/session data; include submitter emails only under an explicit staff-only policy. Use real zeroes, distinguish missing answers, and preserve dates and stable identifiers.

CSV can be imported into Google Sheets immediately, with no Google OAuth integration. This is the smallest useful portability feature.

### Next: maintained Sheets copies

Keep the existing hackathon Sheet unchanged during validation. Initially publish a Neon-generated comparison into a separate approved spreadsheet or tab; avoid mixing Sheet-origin and Neon-origin rows and double-counting them.

For ongoing sync:

- TPW's master Sheet is restricted to named TPW staff.
- A member export is a distinct spreadsheet containing only that member's data. Hidden tabs, filters and protected ranges in a shared master workbook are not tenant isolation.
- A staff-controlled destination is sufficient for the first master sync. Creating a Sheet in each member's Drive requires a separate Google authorization/consent flow or an explicitly shared destination; keep that out of the initial CSV milestone.
- The worker may write only to approved destinations whose organization binding is stored server-side. Never trust an arbitrary workbook ID from an export request.
- Use a dedicated generated tab with deterministic replacement/reconciliation, not unguarded append retries. Serialize workers per destination and check projection versions so an older job cannot overwrite newer data. Retry/rebuild must converge even if Google accepted a write but its response was lost.
- Do not overwrite staff-owned tabs or manually maintained columns. Explain that generated data is refreshed from the app and edits there do not update Neon.
- Show last successful refresh, pending/error state and a retry option. Scheduled retry and operator notification must not require someone watching logs all day.

Ownership also means TPW-controlled Neon, hosting and Google accounts, named administrators, documented backup/restore and a tested full export/restore path. A developer-owned database plus a CSV button alone does not finish the handover. Nicolas's organization is the current development location, not yet evidence of TPW ownership.

## Implementation sequence

### 1. Inventory and agree the boundary

- Get Nicolas's existing migration/import/API code and inspect it before changing shared schema.
- Confirm that the current demo contains only synthetic data, and whether Google edits need to flow back. Default: one-way exports, no Sheet-to-app editing.
- Pick the API host and approved backend tooling; preserve the existing mirrored frontend.
- Work on a separate development branch derived from `demo-neon`, with synthetic fixtures only. Do not run migrations against `production` for this milestone.

Deliverable: versioned schema/document contract, characterization fixtures, backend deployment approach and a small module-boundary refactor. Record current product assumptions (what each count means, required vs optional answers, correction scope and reporting period) as decisions to validate, not permanent truths.

### 2. Neon-backed demo, with download exports

- Build validation, authenticated-scope service boundaries, submission storage, durable idempotency and compatible dashboard/prefill reads.
- Exercise those boundaries with test identities; any public demo path remains hard-bound to synthetic demo storage.
- Add org-scoped CSV/JSON export and staff all-org export.
- Make backend selection explicit so the deployed Sheet demo remains unchanged until a deliberate switch. Selection is not permission enforcement. No automatic cross-backend fallback.

Deliverable: submit -> Neon -> dashboard/prefill -> authorized export on demo, with no dependency on Google availability.

### 3. Sheets projection and comparison

- Add transactional outbox and retry worker, writing only to a test destination.
- Reuse the existing Sheet column names and calculated-value definitions where compatible.
- Compare normalized records, per-yard counts, hours, reporting periods, notes and latest-revision behavior against the old pipeline.
- Test Google failure, quota/backoff, ambiguous success and worker restart.

Deliverable: the same accepted Neon submission appears exactly once in the generated Sheet projection after retries.

### 4. Cutover and eventual Sheet deprecation

- For a real-data pilot, verify server identity/authorization, TPW account ownership and private Google sharing before collecting data.
- Export and reconcile the old Sheet, map organizations explicitly, quarantine ambiguous rows and import with provenance and repeatable import keys. Decide explicitly which synthetic fixtures should remain in demo only.
- Pause old writes for the final reconciliation, route the form, dashboards and prefill together to the new API, then disable the old unsigned writer/open feed before real data reaches either system.
- Keep a dated legacy snapshot. The old Sheet may stay available as a read-only legacy copy while the new generated Sheet stays current.
- Rollback must account for submissions accepted after cutover; flipping a URL back would hide them. Preserve/replay accepted records and reconcile stores before reopening any old path. Prefer keeping Neon as the write authority while repairing presentation or sync.
- Deprecate the maintained Sheet only when TPW agrees that exports and app workflows are enough. Portability remains supported afterwards.

## Acceptance tests

- Org A cannot read/export/correct Org B's records through direct URLs, changed request IDs, query parameters or forged JSON identity fields.
- TPW staff can access all organizations; an ordinary member cannot promote themselves to staff.
- Invalid/revoked sessions fail closed. Public demo selectors cannot reach production or production exports.
- Identical concurrent/retried submissions create one record, one receipt and one logical projection; changed payload under the same key is rejected.
- Submission plus outbox commit together, or neither commits. Worker failures do not erase a confirmed submission.
- Google timeout after successful delivery, duplicate jobs, delayed old jobs and worker restart converge without duplicates or stale replacement.
- CSV opens correctly with commas, quotes, newlines, Unicode, formula-like text, blank values and zeroes. Export scope matches dashboard scope.
- Corrections and historical exports have defined, matching behavior in the dashboard and Sheet.
- A repeated legacy import creates no duplicate records; mismatched or incomplete rows are reported, not silently guessed.
- A Postgres/Google outage never triggers a browser fallback that splits authoritative data across systems.
- Adding an optional field keeps old submissions readable; missing values are not converted to zero. Renaming a label or changing the Sheet layout does not mutate canonical records.
- A metric has consistent units, denominator and effective-revision selection across dashboard and exports. Partial reporting is not silently presented as complete coverage.
- Removing a program/yard through a correction has defined behavior; original records remain available in history.
- UI/transport refactoring preserves existing behavior before separately approved product changes are applied.

## Deferred work

Annual-report PDF embedding and removal of the dashboard's technical flavor text were requested earlier but not implemented before Neon setup interrupted that work. Keep them as a separate small UI change, not part of the database migration. No broad deletion of demo materials, checklist documents or mirrored pages is included here.
