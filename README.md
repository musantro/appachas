# Appachas

Shared group expenses without accounts. Create a group, share its member link,
record expenses, refunds and contributions, and settle the remaining balances.
The interface is in Spanish, works from 320 px upward, and follows
[Mesa Clara](DESIGN.md).

Production domain: **[appachas.es](https://appachas.es)**.
The [previous domain](https://appachas.vercel.app) transfers existing sessions
and forwards old links to the new domain. See [custom-domain setup](docs/custom-domain.md) for DNS,
activation and verification.

React + TypeScript + Vite, FastAPI + Python 3.13, and PostgreSQL. Production runs
on Vercel's native Python runtime with static assets on its CDN and Supabase
PostgreSQL. See [the architecture](docs/code-architecture.md),
[product requirements](MVP.md), [money algorithms](docs/algoritmo.md),
[session contract](docs/security-and-sessions.md), and
[implementation decisions](docs/decisions.md).
The [delivery verification](docs/verification.md) records local checks, the
successful release pipeline and public production acceptance results.

## Local development

Install Node.js 24 and [uv](https://docs.astral.sh/uv/getting-started/installation/).
From the repository root:

```sh
npm ci
npm --prefix frontend ci
uv sync --project backend --frozen
```

Start a local PostgreSQL server in a separate terminal:

```sh
npm run db:start
```

This runs PostgreSQL on `127.0.0.1:54322`, using database, user and password
`appachas`. Data persists in the ignored `.local/postgres` directory. Ctrl+C
stops the server without deleting data. Alternatively, use
`docker compose up -d --wait`; do not run both on the same port.

Then apply the schema and start both applications:

```sh
export DATABASE_URL=postgresql://appachas:appachas@127.0.0.1:54322/appachas
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to FastAPI on port 8000.
The same backend package is used locally and on Vercel. The sample configuration
is in [.env.example](.env.example); never commit `.env` or real credentials.

## Verification

```sh
npm run check
npm run test:unit
npm run generate:api
npm run test:integration
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Integration and acceptance require the migrated local PostgreSQL database.
Playwright starts FastAPI and the built frontend preview automatically. The
browser suite uses mobile Chromium and a focused WebKit movement-form layout
regression; HTTP acceptance verifies concurrency,
permissions, exact cents and invalid inputs against the real API. Tests delete
only their own groups. Browser traces and recordings are disabled because they
can contain private group links. See the [acceptance matrix](docs/acceptance.md).

CI additionally exercises domain migration in Chromium and WebKit with separate
`127.0.0.1` and `localhost` cookie jars. To run those scenarios locally, use the
[two-host test configuration](docs/custom-domain.md#local-two-host-acceptance).
They are deliberately disabled when pointing acceptance at a remote deployment.

The generated API schema is `backend/openapi.json`, and the frontend consumes
`frontend/src/lib/api.generated.ts`. Regenerate both after contract changes;
the pipeline rejects uncommitted generated changes.

## Contributing

Make changes on a dedicated branch and submit a pull request against `master`.
Run the relevant checks locally, and ensure GitHub Actions passes before merge.

## Production and CI/CD

[GitHub Actions](.github/workflows/ci.yml) checks formatting, linting, Python and
TypeScript types, unit tests, component tests and architectural dependencies.
On pull requests and `master`, it also migrates an isolated PostgreSQL 17 service
and runs all integration and browser acceptance tests. Only `master`, after
these checks pass, can migrate production,
deploy the tested source to Vercel, and verify the published API and static app.

`npm run build:production` builds from an explicit allowlist in an isolated
temporary directory and verifies the resulting Python package. This prevents
local `.env` files, database files and browser artifacts from entering a release.
`npm run deploy:production` publishes only that verified build to the linked
project. Both commands support `VERCEL_TOKEN` through the environment; no token
is passed in process arguments or stored in build command logs.
In CI, `npm run pull:production` downloads only project-level build settings,
so the deployment credential can remain restricted to Appachas.

Production requires Vercel variables `DATABASE_URL`, `ALLOWED_ORIGINS`,
`COOKIE_SECURE=true`, `APP_ENV=production` and `CRON_SECRET`. The GitHub repository
requires `PRODUCTION_DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` as encrypted Actions secrets. The Vercel token should be
restricted to this project. Configuration can be prepared from existing linked
CLI sessions using `scripts/configure-production.mjs`; it never prints secrets.
If the CLI session cannot create tokens, create a project-scoped token through
Vercel's Account Tokens dashboard and save it directly as `VERCEL_TOKEN` in
GitHub Actions secrets; do not paste it into source files or chat.

The daily authenticated `/api/internal/expire` cron physically deletes groups
after 10 days without a new movement after the end date, with an absolute
30-day limit. Expired groups reject access immediately, even before cleanup.
Manual closure deletes operational data immediately and leaves only an
in-memory final summary on the current browser screen. Database backup
retention belongs to the database provider.

## Privacy

Group links are bearer credentials; share the member link and keep the creator
link private. Lost creator links cannot be recovered. Tokens use URL fragments
only on entry; session exchange removes them from the address bar. Subsequent
requests use an essential HttpOnly, SameSite=Strict cookie (Secure in production)
without resending the link. PostgreSQL stores token hashes. Links are never
persisted in browser storage. There are no analytics, advertising cookies or
third-party fonts.

MIT licensed. No payment is executed or verified by this application.
