# Postgres/Neon → Google Sheets: technical brief

**Recommendation:** Keep Neon authoritative; deliver authorized CSV/JSON downloads first, optionally add a maintained one-way Sheet snapshot, and defer spreadsheet write-back. Sheets access need not mean Sheets editing is authoritative.

This is research, not an implementation or security review. Context: `neon-migration-plan.md` and `technical-guide.md`. No credentials, projects, submissions, or live destinations were accessed. **Facts** below are source statements; **recommendations** are engineering conclusions, not vendor guarantees.

## 1. Export first: lowest ongoing burden

**Pattern:** Staff download a dated CSV and import it through Sheets’ File → Import workflow. They can analyze or annotate that independent copy; edits do not update Neon. Provide lossless JSON alongside the spreadsheet-oriented export.

**Practitioner evidence:** Jerry Ng describes exporting Postgres queries daily using `psql`, GitHub Actions, committed CSV files, and Sheets’ `IMPORTDATA` [1]. This is a concrete first-person implementation, not evidence of nonprofit deployment or current reliability. **Conclusion:** Scheduled snapshots are practical. Do **not** copy its public-repository distribution pattern for TPW’s organization-level figures; use authenticated downloads or private destinations instead.

**Security fact:** OWASP warns that spreadsheet programs interpret formula-leading cells, lists `=`, `+`, `-`, `@` and control-character risks, and states: “There is no universal CSV sanitization strategy” [2]. Quoting commas and quotes alone is insufficient.

**Recommendation:** Neutralize untrusted text for spreadsheet consumption, test actual Google Sheets import and Excel reopening, and document any added prefix. Preserve original strings in JSON. Test multiline notes, Unicode, identifiers, dates, missing values versus zero, and formula-like program names. Restrict each export server-side to authorized organizations. CSV is portability, not automatic backup/restore or revocation of downloaded copies.

**Who maintains/cost:** Developer maintains export mapping and tests; staff choose periods and import files. No Google integration subscription or OAuth workflow is required. Existing backend hosting, database usage, and support still cost money/time.

## 2. One-way maintained master Sheet: familiar, but generated

**Pattern:** A server-side worker periodically replaces a dedicated generated tab from a versioned Neon query. The staff “master Sheet” is a reporting surface, not another write authority. Keep staff analysis/notes on separate tabs, joined by stable IDs rather than row positions.

**Authentication facts:** gspread’s own documentation distinguishes user OAuth consent from a standalone service-account bot. A private spreadsheet must be shared with the bot’s email; otherwise access can fail as `SpreadsheetNotFound` [3]. Google recommends narrow OAuth scopes, including per-file `drive.file` where appropriate; Sheets scopes apply to the workbook, not individual tabs [4].

**Recommendation:** For one approved staff destination, prefer a dedicated server identity shared onto that file, rather than collecting every member’s Google consent. For user-selected personal destinations, use user OAuth with secure persistent token handling and a reconnect procedure. Neither credentials nor tokens belong in frontend JavaScript. gspread is evidence of the pattern, not a proposal to add Python dependencies here [3].

**Ownership facts:** Google says service accounts cannot own files. Shared-drive files belong to the organization; shared drives require a supported Workspace edition [5].

**Recommendation:** TPW should create/control the destination and Google Cloud administration, with named backup administrators. Prefer a TPW shared drive if available; otherwise explicitly document the TPW-managed owner and handover process. Sharing an existing workbook with a bot is different from asking the bot to create and own it [3,5]. Keep the all-organization workbook staff-only; distribute separate organization-scoped workbooks, not filtered tabs of the master [4,5].

**Operational facts:** Google documents 300 read and 300 write requests/minute/project, 60 of each/minute/user/project, a 180-second processing timeout, atomic updates, and exponential backoff for quota errors. Service-account calls count as one account [6]. Atomicity does not make a sequence of separate requests one transaction.

**Recommendation:** Serialize refreshes per destination; stage and validate before publishing. Remove stale rows when a correction deletes a yard. Use deterministic replacement/reconciliation, not blind append retries: a lost response must not duplicate submissions. Prevent delayed jobs overwriting newer snapshots. Display last-successful-refresh and errors; retain the previous good snapshot on failure. Alert an operator for revoked sharing, invalid credentials, renamed tabs, or schema changes. Rebuild from Neon after repair; never switch submission storage to Google during an outage. These are design requirements inferred from asynchronous delivery and documented limits, not built-in Sheets guarantees [3,6].

**Cost/maintenance:** Google currently says standard Sheets API use has no additional charge, but announces future excess-quota charging; recheck before launch [6]. Hosting, scheduling, secret management, monitoring, and developer incident response remain TPW’s responsibility. Staff need a retry/contact workflow, not log-reading duties.

## 3. Connectors and two-way editing

**Connected Sheets fact:** Google documents BigQuery and Looker sources—not native Postgres/Neon [7]. **Conclusion:** Do not assume a direct Neon connector; adding a warehouse or Looker would introduce another maintained layer.

**Commercial option:** Coefficient advertises PostgreSQL table/custom-SQL imports and exporting edits back to PostgreSQL [8]. Those are vendor claims, not independently tested Neon compatibility, conflict handling, or preservation of TPW’s validation/audit rules. Its pricing page offers a trial, but the retrieved page did not expose a verifiable plan/price table [9]. Obtain a written quote covering refresh frequency, row limits, write-back, seats, and nonprofit eligibility before budgeting. Vendor maintenance replaces some connector work, not TPW’s access administration or schema ownership.

**Community caution:** `googlesheets-sql-sync` runs **Sheets → SQL**, not the requested reverse direction. Its README describes truncating destination tables, manual schema-mismatch repair, and says: “I don’t recommend using this tool anymore” [10]. This is primary maintainer evidence of operational tradeoffs—not a suitable dependency or proof that bidirectional sync is solved.

**Recommendation:** Treat two-way editing as a separate application: stable record/revision IDs, server validation, permission checks, deletion semantics, conflict review, and audited corrections are required. A database connector writing rows directly may bypass that contract. Correct accepted submissions through the app, preserve revision history, and regenerate exports/snapshots.

**Unknowns:** TPW’s Workspace edition/sharing policy, refresh needs, support owner, connector contract/security terms, actual Neon compatibility, and current subscription price remain unverified. No connector was installed or tested.

## Sources

1. Practitioner’s original post: https://jerrynsh.com/i-export-postgresql-queries-to-gsheets-for-free-heres-how/
2. OWASP security guidance: https://owasp.org/www-community/attacks/CSV_Injection
3. Community library’s own authentication docs: https://docs.gspread.org/en/master/oauth2.html
4. Google official OAuth scope docs: https://developers.google.com/workspace/sheets/api/scopes
5. Google official ownership/sharing docs: https://developers.google.com/workspace/drive/api/guides/about-shareddrives
6. Google official quotas/pricing: https://developers.google.com/workspace/sheets/api/limits
7. Google official Connected Sheets docs: https://developers.google.com/workspace/sheets/api/guides/connected-sheets
8. Vendor’s PostgreSQL integration claims: https://coefficient.io/integrations-google-sheets/postgresql
9. Vendor pricing page; amounts unverified: https://coefficient.io/pricing
10. Community project’s original repository/README: https://github.com/jorinvo/googlesheets-sql-sync

**Narrow repo decision:** Follow `neon-migration-plan.md`: Neon authoritative; authorized CSV/JSON now; optional private, one-way Sheet snapshot only with a named maintainer and tested recovery; two-way editing deferred.
