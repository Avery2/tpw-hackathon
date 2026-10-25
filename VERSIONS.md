# Parallel versions

This branch retains both implementations for comparison.

| Route | Version | Data |
|---|---|---|
| `/dashboard/` | Original organization dashboard, Programs, Submissions (check-in removed; prefill is in `/team-form/`) | Google Sheet (through the receiver) + sample data file |
| `/form-demo/` | Forwards to `/team-form/` (the original form saved to Firebase, retired 25 Oct 2026) | — |
| `/team-dashboard/` | Team dashboard and Data view from main | Google Sheet (through the receiver) + sample data file; embedded Sheet Data page |
| `/team-form/` | Team guided form from main | Google Apps Script / Google Sheet |
| `/intake/simple.html` | Team intake and embedded quarterly form | Google Apps Script / Google Sheet |

The shared website header links to the current pages: **Log data** (`/intake/simple.html`) and **Dashboard** (`/team-dashboard/`). It no longer has a Form Demo link: `/form-demo/` only forwards to `/team-form/`. Members Login opens the sign-in box; signed out, nothing opens as Org 1. Team member navigation points to its alternate dashboard. No database records or rules were changed during this integration.

The original local `form-demo` branch is preserved at `a8ec343`. This integration is on `combined-versions`; no push is automatic.

**Firebase is retired (25 Oct 2026, agreed with Yuki).** Every submission lives only in TPW's Google Sheet. Both dashboards and the form's last-quarter prefill read it through the receiver (`team-form/receiver/Dashboard.gs`, `?view=dashboard`) via one loader, `assets/dashboard-source.js`. The made-up Org 1 and Org 2 come from `data/demo/dashboard-sample.json` and are always badged as sample data.
