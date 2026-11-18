# Report and CSV generation data

Historical source datasets and manual generators for the static hackathon reports and public CSV datasets.

- `data/` holds the source spreadsheets, CSVs, fixtures, report assets, and intake reference data.
- `generators/build_organization_reports.py` generates organization report previews.
- `generators/build_public_data.py` assembles public reference CSV datasets.
- `data/report/build.py` generates the combined report.

These utilities are outside the running application. Their output stays within this archive. The dashboard serves the existing PDFs from `public/report/` at the repository root. Regenerating and publishing reports requires a deliberate review and copy of the output. Historical generator instructions and relative asset paths may need adjustment before reuse.
