# Delivery verification — 2026-09-10

The implemented application has been verified locally against the built
frontend, FastAPI and a real PostgreSQL database:

| Check | Result |
| --- | --- |
| Backend unit, architecture and bootstrap tests | 83 passed |
| Backend PostgreSQL and HTTP-adapter integration tests | 27 passed |
| Frontend unit and component tests | 26 passed |
| HTTP acceptance and mobile browser end-to-end tests | 37 passed |
| Ruff lint and formatting, ty, Biome and TypeScript | Passed |
| Regenerated OpenAPI and TypeScript contract consistency | Passed |
| Frontend production build | Passed |
| Native Vercel Python 3.13 build from the isolated release directory | Passed |
| Release package exclusion of local secrets, database and test artifacts | Passed |

The 173 tests include persistent identity cookies, concurrent claims and edits,
exact-cent calculations, destructive-action confirmation, offline recovery
without automatic submission, and accessibility checks at 320 px and 200% text
size. See [the acceptance matrix](acceptance.md) for the requirement mapping.

The remote session and algorithm specifications have been integrated. Sessions
use cookies after initial link exchange; the browser removes secret fragments
and does not persist credentials. PostgreSQL is migrated through `0004`.

The owner authorized production configuration. Supabase credentials are stored
as encrypted Vercel and GitHub secrets, public access is enabled, and the owner
created the Vercel CI credential in GitHub. These results are local verification;
GitHub Actions and the public deployment still require their release run and
live verification before production is declared ready.
