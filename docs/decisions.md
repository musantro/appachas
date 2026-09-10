# Implementation decisions

## Persistent member identity

The owner explicitly approved cookies on 2026-09-10 to improve identity
persistence. The session contract published in `security-and-sessions.md`
applies: secret links are exchanged for opaque, revocable server-side sessions.
Only essential first-party identity cookies are used. There is no analytics or
advertising telemetry.
Production cookies use Secure and SameSite=Strict. Clearing browser data still
requires the creator to release the abandoned claim.

## Secret links

Group access tokens are placed in the URL fragment and sent in an Authorization
header only for entry metadata, initial claims and session exchange. After
exchange, history replacement removes the fragment. Subsequent API requests use
only the HttpOnly cookie and a non-secret group UUID in `X-Appachas-Group`.
Tokens never appear in HTTP request paths or query strings. Only one-way hashes
of group and session tokens are persisted in PostgreSQL. Share links are kept
only in memory for the current document, never in browser storage or history
state. After reloading, use the originally saved or shared link to share again.

## Canonical money representation

`algoritmo.md` is normative. Domain objects and PostgreSQL store positive
movement magnitudes and nonnegative allocations; only the movement type
determines the sign when calculating balances. Migration `0004` converts the
previous signed storage without changing balances. The HTTP history DTO uses
signed refund values for presentation, without mutating the domain objects.
Invalid persisted movements fail explicitly instead of silently omitting a
member or returning an unbalanced settlement.

## Release ownership

GitHub Actions owns production deployments after the quality, PostgreSQL
integration and browser acceptance gates pass. Automatic Vercel Git deployments
are disabled to prevent an unchecked push from publishing to production.
Vercel serves the Vite build from `public/` and runs the FastAPI entrypoint
using its native Python runtime. An authenticated daily cron removes expired
groups; all access paths also reject expired groups immediately.

## Isolated production build

Vercel CLI 59.11.7 and its Python builder 13.0.1 do not apply native FastAPI
`functions[].excludeFiles` to the local source glob: the CLI passes the nested
setting, while the Python builder reads a top-level setting. A local build can
therefore reference ignored `.env` and database files even though source upload
uses `.vercelignore`.

`scripts/build-production.mjs` builds the frontend, copies only the runtime
source and static output to a private temporary directory, and runs the same
native Vercel Python build there. The independent package check rejects private
files and verifies that the bundled backend matches the source. Deployment uses
that verified directory. The original source tree and local data are preserved.
