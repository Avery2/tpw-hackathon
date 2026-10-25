# Parallel versions

This branch retains both implementations for comparison.

| Route | Version | Data |
|---|---|---|
| `/dashboard/` | Original organization dashboard, Programs, Check in | Firebase |
| `/form-demo/` | Original guided form | Firebase |
| `/team-dashboard/` | Team dashboard and Data view from main | Google Sheet receiver + sample data; embedded Sheet Data page |
| `/team-form/` | Team guided form from main | Google Apps Script / Google Sheet |
| `/intake/simple.html` | Team intake and embedded quarterly form | Google Apps Script / Google Sheet |

The shared website header links to the pages members use: **Log data** (`/intake/simple.html`) and **Dashboard** (`/team-dashboard/`), both on TPW's Google Sheet, plus Avery's **Annual report (PDF)**. Yuki's originals (`/form-demo/`, `/dashboard/`) still work at their addresses but aren't in the header. Members Login opens the sign-in box; signed out, nothing opens as Org 1. Team member navigation points to its alternate dashboard. No database records or rules were changed during this integration.

The original local `form-demo` branch is preserved at `a8ec343`. This integration is on `combined-versions`; no push is automatic.
