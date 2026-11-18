# Annual report PDF links

Minimal prototype: direct PDF links open in a new tab, using the browser's preview
and download controls. No report viewer application, new dependencies or live writes.

## Where to find them

- Main site header: **Annual report (PDF)** opens the combined TPW report.
- `/dashboard/#org-1` and `#org-2`: a report callout immediately below the
  organization heading opens that fictional organization's one-page PDF.
- `/dashboard/#tpw`: the same callout opens the combined TPW report.
- The newer `/team-dashboard/` has the same callout, including its default account.

## Sources and limitations

`TPW-Collective-Impact-Report-2026.pdf` is the existing 16-page combined prototype,
recovered unchanged from previously saved local report work. It describes the
June 2026 source snapshot, not live dashboard totals or a complete calendar year.
Its measured activity, bounds, published claims and models are explicitly separated.
This change does not restore the unrelated stashed report-builder changes.

The organization PDFs are **synthetic demo previews**, built offline from
`data/demo/dashboard-sample.json` (base `sample-org-1-1/2` and
`sample-org-2-1/2` fixtures dated October 24, 2026). Historical and later RAC demo
examples are not included in this fixed snapshot. No live submissions are read. Current dashboard counts may
differ; both the callout and PDF state this. These are not real nonprofit annual
reports and must not be used as evidence of impact. Course hours × completions
produces participant-hours; enrollments are not unique people. Planned and
in-progress programs remain in the snapshot and are labeled.

The public repo contains only fictional organization reports. Real organization
reports require authenticated/private delivery and TPW approval; the demo account
chooser is not access control. Do not replace these files with private member data.

## Rebuild the organization previews

```sh
python3 scripts/build_organization_reports.py
# Non-default Chrome location:
CHROME_BIN=/path/to/chrome python3 scripts/build_organization_reports.py
```

Python standard library + headless Chrome; no install/build step for the website.
The script emits the HTML sources and one-page Letter PDFs in `organizations/`.
It does not rebuild the combined TPW PDF. Generated HTML uses the site's fonts,
logo and green/sage/yellow palette; PDFs embed what they need for offline viewing.

## Preview locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/dashboard/#org-1`, or the site home for the Annual
report link. Browser checks covered both dashboard variants, all three account
views, hash/account changes, PDF HTTP/content types, and no horizontal overflow
at 1280px and 390px. Both organization PDFs were checked as one page and visually
inspected; the combined report remains the original 16-page artifact.
