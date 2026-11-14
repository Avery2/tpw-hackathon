# Standalone TPW dashboard with Neon

The existing `/dashboard/`, `/form-demo/`, and dashboard check-in now use a small Node API backed by Neon Postgres. HTML, styles, chart calculations, and the demo account chooser are retained. `/team-dashboard/` and `/team-form/` retain their Sheet receiver.

This remains an **unauthenticated, synthetic-data demo**. `DEMO_MODE=true` explicitly enables the API. Account hashes choose a view, not an access permission. Implement real authentication and organization authorization before using real records.

## Local setup

1. `npm ci`
2. `neon login`, then `neon checkout demo-neon` (or select your development branch).
3. `neon deploy` pulls server credentials into the ignored `.env.local`.
4. Add `DEMO_MODE=true` to that file.
5. `npm run db:migrate -- --dry-run`, then `npm run db:migrate` (direct URL; migrations tracked by checksum).
6. `npm run db:import-demo` optionally copies existing synthetic Firebase demo records, preserving IDs. It does not alter Firebase. Its cached export is ignored under `work/`.
7. `npm run build`, then `npm run dev`.
8. Open `http://localhost:8788/dashboard/` or `/form-demo/`.

The existing Python static server does not serve the database API. Use the Node server above for the Neon version. Source edits require rebuilding the static output, then refreshing the page.

## Data contract

The database now has relational tables for facilities, yards, programs, locations, quarterly snapshots and metric groups. See [db/README.md](db/README.md) for the table map and counting rules.

The current UI keeps one shared set of program figures. One metric group owns those figures and all selected yards reference it, avoiding multiplied counts. Future per-location groups are supported by the database, but require a future location-specific UI before they can be edited through this app.

Submission JSON is retained as an original snapshot/compatibility write format. A transaction-safe trigger normalizes each saved snapshot; dashboards read reconstructed documents from relational tables. Reusing a submission ID replaces its relational snapshot instead of duplicating it. The team's Sheets records are unchanged.

## Standalone application

`npm run build` publishes only the dashboard, submission form and their required assets. The root opens the dashboard account chooser. The original website, mirrored pages and alternate team apps remain in source but are not part of this application's build. Dashboard navigation includes New submission, and the form links back to the dashboard.

## Deployment

The included Vercel configuration serves `dist/` with `/api/*` routed to the server handler. Configure the **pooled** `DATABASE_URL` and `DEMO_MODE=true` as server environment variables. The direct `DATABASE_URL_UNPOOLED` is only needed for migrations/import utilities. Never publish these values in frontend code.

GitHub Pages cannot execute this API. The existing backup deployment continues using its original backend until deliberately redeployed elsewhere. Do not push this backend conversion into a Pages-only deployment without arranging an API host.

## Checks

- `npm run test:neon`: input validation and server-calculated totals.
- `node --test team-form/test/dashboard-source.mjs`: the team's Sheet loader remains separate.
- `npm run build`: static mirror build and API syntax.
- `node --env-file=.env.local scripts/neon-smoke.mjs`: real Neon API read/write/retry validation with synthetic records, cleaned up afterwards; local server must be running.

The `demo-neon` branch has no automatic expiration. Production is a separate branch and has not been migrated.
