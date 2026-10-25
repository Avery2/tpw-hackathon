# Parallel versions

This branch retains both implementations for comparison.

| Route | Version | Data |
|---|---|---|
| `/dashboard/` | Original organization dashboard. **Retired 25 Oct 2026:** forwards to `/team-dashboard/` | — |
| `/form-demo/` | Original guided form. **Retired 25 Oct 2026:** forwards to `/team-form/` | — |
| `/team-dashboard/` | Team dashboard and Data view from main | Google Sheet receiver + sample data; embedded Sheet Data page |
| `/team-form/` | Team guided form from main | Google Apps Script / Google Sheet |
| `/intake/simple.html` | Team intake and embedded quarterly form | Google Apps Script / Google Sheet |

The shared website header links to the pages members use: **Log data** (`/intake/simple.html`) and **Dashboard** (`/team-dashboard/`), both on TPW's Google Sheet, plus Avery's **Annual report (PDF)**. Firebase was retired on 25 Oct 2026, so Yuki's originals (`/form-demo/`, `/dashboard/`) now only forward to these Google Sheet versions; their code is in git history.

The original local `form-demo` branch is preserved at `a8ec343`. This integration is on `combined-versions`; no push is automatic.
