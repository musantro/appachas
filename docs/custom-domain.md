# Custom domain: appachas.es

The primary domain is `https://appachas.es`. Configure `www.appachas.es` as a
redirect to it. Keep `appachas.vercel.app` serving the application without a
Vercel or registrar redirect: the application needs to run on the old host to
authorize the automatic transfer of its host-only session cookies. The frontend
then takes the browser to the new domain. Ordinary local development is unchanged.

## Before merging the domain PR

1. In Vercel → Appachas → Settings → Domains, add both `appachas.es` and
   `www.appachas.es` to Production. The apex must serve the app, not redirect.
   Configure only `www.appachas.es` → `appachas.es` (308 preferred; 307 also works).
   Vercel may initially suggest the opposite direction; do not leave both
   redirects enabled.
2. At the existing DNS provider, configure these records. Their destinations
   were confirmed through Vercel's domain-configuration API on 2026-09-10:

   | Type | Name | Value | TTL |
   | --- | --- | --- | --- |
   | A | `@` | `216.198.79.1` | 300 |
   | CNAME | `www` | `eea91984c782bd60.vercel-dns-017.com` | 300 |

   Replace conflicting parking records for these two web hosts, including any
   old AAAA records. Preserve MX, email TXT records and nameservers. If using
   Cloudflare, use DNS-only mode, not the proxy. Future Vercel domain-card values
   take precedence if the provider changes the recommendations.
3. Wait for both domains to report valid DNS and HTTPS certificates in Vercel.
   Vercel handles certificate issuance automatically. No registrar URL-forwarding
   service or separate API subdomain is required.
4. Run the read-only checks below, then merge the PR. Merging triggers the normal
   tested deployment; post-deployment checks require the new domain and redirect
   to work, and also verify the previous domain independently. The PR itself
   does not deploy or change Vercel settings.

```sh
node scripts/smoke-production.mjs
node scripts/smoke-production.mjs https://appachas.vercel.app
```

The default smoke checks `appachas.es`, its JavaScript asset, API health, SPA
routing and unknown-API 404 responses. It also checks that `www` redirects to
the apex while preserving the path and query string. These checks create no
groups and do not invoke the expiry endpoint.

## Sessions, shared links and allowed origins

Old links, including secret entry links and clean group bookmarks, arrive at
the equivalent group screen on `appachas.es`. New shared links use the new
origin. The API remains same-origin under `/api`.
Cookies remain HttpOnly, Secure and SameSite=Strict, with no `Domain` attribute.

On an old link, the browser first checks for an existing destination session.
If present, it uses it without replacing its identity. Otherwise, a short
round trip through both hosts transfers the source session, preserving the
group, member and creator permissions. A single-use code, expiring after two
minutes, is bound to a destination HttpOnly cookie. Only credential hashes are
stored. Codes and entry tokens travel in transient URL fragments, not query
strings, browser storage or HTTP request URLs.

The destination cookie is installed before confirmation. Only confirmation
activates it and atomically revokes the source session. Interrupted transfers
before confirmation leave the old session usable; a lost confirmation response
does not lose the already-installed destination cookie. Returning to an old
link after success uses the destination session directly, including after a
page reload. Each group migrates independently.

This is not cookie recovery: another browser, cleared site data or a released
identity still requires the normal entry/recovery flow. After migration, the
revoked source cookie cannot recreate a subsequently deleted destination
cookie. An occupied member identity is never automatically reclaimed.

The backend already accepts same-origin requests, including the new domain,
even with the previous `ALLOWED_ORIGINS` value. No runtime secret change is
required for activation. The server and frontend default to the fixed HTTPS
source/target pair above (`MIGRATION_*_ORIGIN` and `VITE_MIGRATION_*_ORIGIN`
allow an explicitly configured alternative). No new CI credential is needed.
The provisioning script now sets
`ALLOWED_ORIGINS=https://appachas.es,https://appachas.vercel.app` for future runs;
do not rerun full secret provisioning solely to attach a domain.

Do not remove the old hostname or replace it with an unconditional redirect:
that would bypass authorization for sessions not yet transferred. For a code
rollback, keep the destination serving the app so already-migrated users retain
access. Do not reverse the migration direction or undo the additive database
migration while the bridge is in use.

## Local two-host acceptance

Start PostgreSQL as in the README, then run the following in one shell. Stop
any earlier development/preview servers first so Playwright starts servers with
this configuration; reused servers may have different origins or old code.

```sh
export DATABASE_URL=postgresql://appachas:appachas@127.0.0.1:54322/appachas
export APP_ENV=test COOKIE_SECURE=false CRON_SECRET=acceptance-only-cron-secret
export MIGRATION_SOURCE_ORIGIN=http://127.0.0.1:4173
export MIGRATION_TARGET_ORIGIN=http://localhost:4173
export VITE_MIGRATION_SOURCE_ORIGIN=$MIGRATION_SOURCE_ORIGIN
export VITE_MIGRATION_TARGET_ORIGIN=$MIGRATION_TARGET_ORIGIN
npm run db:migrate
npm run build:test-domains
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

The explicit `migration-test` build mode permits HTTP loopback hosts only;
normal production builds require HTTPS. The hosts must differ, not merely the
ports, because cookies are not isolated by port. Both local origins use the
same real API/database through the preview proxy. Never configure test origins
on Vercel. Without this explicit local pair, the migration browser scenarios
skip; they never visit production domains or migrate real users' sessions.

Provider references: [custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
and [A records, CNAME and HTTPS](https://vercel.com/kb/guide/a-record-and-caa-with-vercel).
