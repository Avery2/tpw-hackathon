# Google Sheets access: decision brief

**Recommended decision:** For the proposed Neon migration, keep one authoritative store and preserve spreadsheet access through authorized CSV/JSON downloads first. Add a private, one-way Sheet snapshot only if staff testing shows recurring imports are burdensome and TPW has an agreed support owner. Do not assume write-back or rewrite the product platform.

**Important qualification:** Neon is a proposed target, not the current submission store. Today’s documented prototype stores submissions in a Google Sheet. This brief does not authorize a cutover. If staff depend on editing that Sheet to correct figures, a usable replacement correction process is a prerequisite—not a later enhancement.

## What the evidence establishes

- **Technical facts:** Google’s [Connected Sheets documentation](https://developers.google.com/workspace/sheets/api/guides/connected-sheets) describes BigQuery/Looker, not a native Postgres connection. [Sheets API limits](https://developers.google.com/workspace/sheets/api/limits) require quota/error handling; standard API use currently has no additional charge, with future excess-quota charges announced. “Free API” does not mean free operation. [OWASP](https://owasp.org/www-community/attacks/CSV_Injection) warns that CSV text can execute as formulas and that no sanitization strategy is universal.
- **Practitioner evidence:** [TechSoup’s survey](https://blog.techsoup.org/hubfs/Downloads/data-handling-survey-2021.pdf) documents widespread spreadsheet use and training/resource constraints; it is a 2020 digital survey, not TPW-specific research. [DataKind](https://datakind.github.io/project-stages/share/technical_project_hand-off.html) requires partner-tested handover and a maintenance strategy. [USDR’s St. Louis case](https://www.usdigitalresponse.org/resources/how-relieving-administrative-burden-for-one-city-helped-house-more-people-facing-homelessness) shows workflow discovery, cleanup and coaching accompanying a move beyond spreadsheets; it is not evidence to adopt Airtable here. [DemocracyLab’s FareStart report](https://blog.democracylab.org/farestart-pilots-new-approach-to-engage-tech-volunteers/amp/) illustrates bounded, prepared volunteer delivery, not permanent free support.
- **Our conclusion:** The best connection is the smallest one staff can actually operate and TPW can sustain. Export-first is a testable starting point, not proof that manual importing meets their needs.

## Options and tradeoffs

| Option | What staff get | Burden and limits | Decision |
|---|---|---|---|
| Authorized CSV plus lossless JSON | Portable, dated files; staff can analyze a copy in Sheets | Manual import; copies become stale and cannot be remotely revoked. Spreadsheet edits do not correct the source. Export mapping, authorization and formula-safety tests still need maintenance. | Start here; test a real reporting task. |
| Private one-way Sheet snapshot | Familiar shared analysis surface with automatic refresh | Worker/connector, credentials, monitoring and recovery; generated rows must not overwrite staff notes. Snapshot staleness must be visible. | Add only with demonstrated need, budget and named maintainer. |
| Commercial connector | Potentially less custom integration code | Subscription, access/security review, schema changes and vendor dependency. [Coefficient](https://coefficient.io/integrations-google-sheets/postgresql) advertises PostgreSQL imports/write-back; Neon compatibility, TPW validation compliance and actual price remain unverified. | Consider a bounded read-only evaluation if it reduces total support burden. |
| Two-way editing | Potential corrections inside Sheets | Conflicts, deletions, validation, permissions and audit become application responsibilities; direct SQL write-back may bypass them. | Defer unless discovery establishes an essential need and funded support. |

Do not add BigQuery/Looker merely to obtain Sheets access. The community sync tool reviewed in the [technical brief](sheets-research-technical.md) runs in the opposite direction and its maintainer discourages use; it is not a ready-made solution.

## Conditions before committing

1. **Validate staff work:** Observe staff importing, reconciling, annotating and correcting synthetic data. Ask members about reporting constraints. Agree freshness and missing-value definitions. CSV may be too labor-intensive; a generated tab may be too restrictive.
2. **Preserve control:** TPW controls accounts, billing, administration and data exports, with a backup administrator. [Google](https://developers.google.com/workspace/drive/api/guides/about-shareddrives) distinguishes organization-owned shared-drive files from individual ownership; confirm Workspace eligibility. Keep the all-organization workbook staff-only; filtered tabs are not separate access boundaries.
3. **Make corrections ordinary:** Provide a supported request/edit route, preserve original accepted submissions, record revisions and regenerate outputs consistently. Until that exists, do not describe loss of authoritative Sheet editing as feature parity.
4. **Budget the handover:** Name the staff steward and technical operator, support end date, renewal owner and incident contact. Staff demonstrate reporting/corrections; a successor demonstrates recovery. Downloads remain the fallback if snapshot delivery fails; Google failure must not create a second submission store.

**Not determined:** TPW’s preferred workflow, acceptable refresh delay, Workspace policy, connector contract/pricing or ongoing support funding. No live integration was tested. The migration itself still requires real authorization and go-live safeguards; Sheets sharing does not secure an application feed.

**Supporting research:** [Technical brief](sheets-research-technical.md) · [Nonprofit delivery brief](sheets-research-nonprofit.md) · [Proposed migration plan](neon-migration-plan.md) · [Current architecture](technical-guide.md).
