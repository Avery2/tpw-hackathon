# Parallel versions

This branch retains both implementations for comparison.

| Route | Version | Data |
|---|---|---|
| `/dashboard/` | Original organization dashboard, Programs, Check in | Firebase |
| `/form-demo/` | Original guided form | Firebase |
| `/team-dashboard/` | Team dashboard and Data view from main | Google Sheet receiver + sample data; embedded Sheet Data page |
| `/team-form/` | Team guided form from main | Google Apps Script / Google Sheet |
| `/intake/simple.html` | Team intake and embedded quarterly form | Google Apps Script / Google Sheet |

The shared website header links to Form Demo and Dashboard. Members Login retains the team intake entry. Team member navigation points to its alternate dashboard. No database records or rules were changed during this integration.

The original local `form-demo` branch is preserved at `a8ec343`. This integration is on `combined-versions`; no push is automatic.
