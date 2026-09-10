# Delivery verification — 2026-09-10

The implemented application has been verified locally against the built
frontend, FastAPI and a real PostgreSQL database:

| Check | Result |
| --- | --- |
| Backend unit, architecture and bootstrap tests | 80 passed |
| Backend PostgreSQL integration tests | 5 passed |
| Frontend unit and component tests | 23 passed |
| HTTP acceptance and mobile browser end-to-end tests | 36 passed |
| Ruff lint and formatting, ty, Biome and TypeScript | Passed |
| Regenerated OpenAPI and TypeScript contract consistency | Passed |
| Frontend production build | Passed |
| Native Vercel Python 3.13 build from the isolated release directory | Passed |
| Release package exclusion of local secrets, database and test artifacts | Passed |

The 144 tests include persistent identity cookies, concurrent claims and edits,
exact-cent calculations, destructive-action confirmation, offline recovery
without automatic submission, and accessibility checks at 320 px and 200% text
size. See [the acceptance matrix](acceptance.md) for the requirement mapping.

These results are local verification, not a claim that GitHub Actions or the
public production application has been verified. The workflow is implemented,
but production setup was stopped by the automatic approval review before any
credentials or access settings were changed. Activating production requires
explicit approval to store the Supabase connection in this app's Vercel project
and GitHub repository, create the project-scoped CI deployment credential, and
remove Vercel SSO protection for public link access.

After approval, configure the secrets, publish the source, run the pipeline and
verify the resulting public deployment. Do not treat the reserved production
domain as a working application until that verification succeeds.
