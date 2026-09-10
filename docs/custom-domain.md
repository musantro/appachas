# Custom domain: appachas.es

The primary domain is `https://appachas.es`. Configure `www.appachas.es` as a
redirect to it. Keep `appachas.vercel.app` serving the application without a
redirect: its existing host-only session cookies cannot move to another domain.
Local development remains unchanged.

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

New links use the origin on which the group was created; neither frontend nor
backend hardcodes the old hostname. The API remains same-origin under `/api`.
Cookies remain HttpOnly, Secure and SameSite=Strict, with no `Domain` attribute.
An existing session on `appachas.vercel.app` stays there; it is not automatically
transferred to `.es`. Keep existing group links on their original hostname.

The backend already accepts same-origin requests, including the new domain,
even with the previous `ALLOWED_ORIGINS` value. No runtime secret change is
required for activation. The provisioning script now sets
`ALLOWED_ORIGINS=https://appachas.es,https://appachas.vercel.app` for future runs;
do not rerun full secret provisioning solely to attach a domain.

If rollback is needed, users can continue on `appachas.vercel.app`; no data
migration or cookie relaxation is involved.

Provider references: [custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
and [A records, CNAME and HTTPS](https://vercel.com/kb/guide/a-record-and-caa-with-vercel).
