# Delivery verification — 2026-09-10

The application is publicly available at <https://appachas.vercel.app>.
Local checks and the [successful release pipeline](https://github.com/musantro/appachas/actions/runs/34465191188)
verify the built frontend, FastAPI and a real PostgreSQL database:

| Check | Result |
| --- | --- |
| Backend unit, architecture and bootstrap tests | 83 passed |
| Backend PostgreSQL and HTTP-adapter integration tests | 27 passed |
| Frontend unit and component tests | 29 passed |
| Project-scoped deployment configuration tests | 4 passed |
| HTTP acceptance and mobile browser end-to-end tests | 37 passed |
| Ruff lint and formatting, ty, Biome and TypeScript | Passed |
| Regenerated OpenAPI and TypeScript contract consistency | Passed |
| Frontend production build | Passed |
| Native Vercel Python 3.13 build from the isolated release directory | Passed |
| Release package exclusion of local secrets, database and test artifacts | Passed |

The 180 tests include persistent identity cookies, concurrent claims and edits,
exact-cent calculations, destructive-action confirmation, offline recovery
without automatic submission, and accessibility checks at 320 px and 200% text
size. See [the acceptance matrix](acceptance.md) for the requirement mapping.

The remote session and algorithm specifications have been integrated. Sessions
use HttpOnly cookies after initial link exchange; the browser removes secret
fragments and does not retain link tokens in Web Storage or history state.
Production cookies are Secure and SameSite=Strict. PostgreSQL is migrated
through `0004`.

The owner authorized production configuration. Supabase credentials are stored
as encrypted Vercel and GitHub secrets, public access is enabled, and the owner
created a project-scoped Vercel CI credential in GitHub. The release pipeline
passed quality, acceptance and production jobs, including migration, deployment
and the published API/static-app smoke check.

All 37 HTTP acceptance and mobile browser tests also passed against the public
HTTPS deployment with no retries. This includes identity changes during delayed
refreshes, editing and deleting movements, cross-device updates, offline recovery,
group closure and accessibility checks. Every synthetic test group was removed
successfully. The daily authenticated expiry cron is configured for 03:00 UTC.
