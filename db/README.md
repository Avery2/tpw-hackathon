# Relational quarterly reporting

The current form still accepts ONE set of program figures shared by its selected facilities/yards. The schema can also represent different figures at each yard without duplicating the program definition.

## Tables

| Table | Meaning |
|---|---|
| `organizations` | Organization identity and profile |
| `facilities` | Shared facility directory, keyed by code |
| `yards` | Stable UUID, facility foreign key, unique name within a facility |
| `organization_facilities` | Facilities associated with an organization across its reporting history |
| `programs` | Organization-owned program identity and latest reported name |
| `program_locations` | Latest reported yard assignments for each program |
| `submissions` | Quarterly report identity, organization, period, original JSON snapshot, receipt timestamp |
| `submission_facilities` | Facility names as reported in a particular submission |
| `submission_yards` | Yard names/selections as reported in a particular submission |
| `submission_programs` | Program name/identity as reported in a particular submission |
| `program_metric_groups` | Status, dates, hours and participant/completion counts |
| `submission_program_locations` | Each report/program/yard linked to exactly one metric group |
| `schema_migrations` | Applied migrations and checksums |

## Shared figures are facts, not copies

For one program at three yards with 20 participants:

- One `submission_programs` row.
- One `program_metric_groups` row: scope `shared`, participants `20`.
- Three `submission_program_locations` rows pointing to that SAME metric group.
- Aggregate participants: **20**, not 60.

`submission_report_totals` sums metric groups before joining any locations, including delivered hours (`course_hours * participants_completed`). It never sums a location join.

Later, location-specific reporting can use one metric group per yard (`scope = 'location'`). Deferred constraints require each group to have a location and each location-scoped group to apply to exactly one yard. Several yards may share a group; each yard may belong to only one group within a given submission/program. These rules also allow batches of locations with shared figures.

## Compatibility boundary

The demo still sends the existing submission document shape. An atomic database trigger normalizes it into relational tables, creating one `shared` metric group per program. This keeps existing document-style writers working, including clients using the Data API to write the `submissions` table. All original JSON snapshots remain available for comparison/audit.

The server reads `submission_read_models`, which reconstructs the existing browser contract from the normalized snapshot tables and metrics. Program/facility name changes in the current directories cannot rewrite snapshot labels. Metadata not yet normalized remains in JSONB.

The existing UI cannot edit multiple metric groups yet. `submission_requires_location_ui` identifies those reports; the API rejects viewing or overwriting them through the shared-only interface instead of silently combining or discarding their figures. Location-specific UI/API serialization is a later step after TPW confirms its requirements. Do not write a shared snapshot over a location-specific report through the compatibility endpoint.

## History and migration

- Existing submission IDs are retained, including old demo revisions within a quarter; no destructive quarter deduplication is performed.
- Older reports without a period derive year/quarter from their UTC submission date and are marked `reporting_period_inferred`.
- New submissions must specify quarter/year.
- Program IDs are unique within their organization, not globally; foreign keys keep organization ownership consistent.
- Latest program configuration reflects each program's latest report, not a sum of historical configurations. Organization/facility links retain historical associations.
- `program_metric_groups` enforces nonnegative hours/counts, integer participants, completions <= participants, valid status, and ordered dates.

`npm run db:migrate -- --dry-run` applies pending SQL in a transaction, runs live shared/per-location constraint tests, checks all historical program/facility snapshots, and rolls back. `npm run db:migrate` applies pending migrations once with a checksum ledger and the same historical reconciliation. Test/migrate the demo branch before production.

`node --env-file=.env.local test/neon/relational-live.mjs` checks live grouping, constraints, history isolation and compatibility roundtrips with fixtures rolled back afterwards.
