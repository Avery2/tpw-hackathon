# TPW data collection tool

Member organizations use this app to report quarterly program activity by facility and yard. TPW staff can review submissions and see collective totals.

## Run locally

Install dependencies with `npm ci`, configure the environment variables documented in [.env.example](.env.example), and run `npm run dev`. Open [Sign in](http://localhost:3000/sign-in/) to get started.

## Application

- `docs/html site archive/legacy/` retains retired static application code and tools for reference.
- `lib/` contains shared reporting logic, number animations, backend code, and scripts.
- `lib/report-generation/` holds source datasets and manual generators for static reports and CSV files.
- `app/` contains the Next.js workspace and API routes.
- `lib/server/` contains reporting access, validation, and database queries.
- `public/` holds the directly served stylesheets, fonts, images, and report PDFs. Edit these files directly.
- The app runs on Vercel and uses Postgres for reporting data and Better Auth for sign-in.

Run `npm run build` to check the production build and `npm run test:neon` to check submission validation. The browser smoke test runs with `npm run test:browser` against a running app and uses mocked reporting requests.

See the [go-live checklist](docs/go-live-checklist.md) before accepting real member data.
