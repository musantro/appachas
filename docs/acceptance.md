# Acceptance coverage

`MVP.md` supplies the product contract. Playwright exercises the real running
React, FastAPI and PostgreSQL application. HTTP acceptance scenarios use the
public API, and mobile scenarios use the same API through the browser. The
backend is never mocked. Browser-only operating-system facilities (the native
share sheet and clipboard) are captured so their exact outgoing text can be
checked without opening an external application.

The offline recovery scenario disconnects the actual browser context, verifies
an immediate recoverable error, reconnects and verifies that no movement is sent
automatically. Only an explicit retry may create the movement.

The session contract in `security-and-sessions.md` is verified independently:
entry links are exchanged for opaque HttpOnly cookies, subsequent requests use
only the cookie and public group reference, URLs lose their secret fragment,
and browser storage/history never retains either secret link. HTTPS executions
also require the session cookie's Secure flag. Cleanup attempts every group
created by a scenario even if an earlier deletion fails, reporting no secrets.

Run the application and migrations as described in `README.md`, then run
`npm run test:e2e`. Set `E2E_BASE_URL` to test another running environment.
Tests create their own groups and delete only those groups at teardown; they
must never point at groups belonging to real users. Credentials are not added
to assertions, screenshots, traces, videos or reports.

The deterministic expiry cases run in backend unit and persistence integration
tests, using a controlled clock. No production endpoint exists for changing time
or bypassing expiry. The accessibility checks combine axe with keyboard, 320 px
layout, text enlargement and touch-target assertions. They complement, rather
than replace, the moderated usability study described in `MVP.md`.

| Story | Observable acceptance evidence |
| --- | --- |
| US-01 | Mobile creation with dates, Unicode members and creator selection; HTTP valid creation. |
| US-02 | HTTP rejects empty, whitespace and overlong group names. |
| US-03 | HTTP rejects member bounds, empty/overlong names and case-insensitive duplicates. |
| US-04 | HTTP rejects past start, nonfuture end and reversed date range. |
| US-05 | HTTP returns the persisted IANA timezone and rejects invalid zones. |
| US-06 | Mobile presents separate links; HTTP independently authenticates the two credentials. |
| US-07 | Mobile captures member-sharing text, dates and identity instructions. |
| US-08 | Mobile checks creator-link privacy and loss warnings. |
| US-09 | HTTP metadata excludes private financial state; mobile identity screen hides history. |
| US-10 | Mobile claims a member and reaches the history; HTTP marks the identity occupied. |
| US-11 | HTTP claim with alias preserves member identity and publishes the alias. |
| US-12 | HTTP rejects duplicate aliases and leaves the member available. |
| US-13 | Concurrent independent HTTP contexts produce exactly one claim and one 409. |
| US-14 | Mobile reload retains the claimed identity through the persistent session cookie, with a clean group URL and no bearer credential in later API requests. |
| US-15 | HTTP switch releases the old claim and occupies the new claim atomically. |
| US-16 | Independent browser session cannot reclaim an occupied identity. |
| US-17 | Creator release makes the identity available and revokes the old session. |
| US-18 | HTTP rejects deletion or release of the creator. |
| US-19 | Member alias update is visible globally with stable member ID. |
| US-20 | Creator rename preserves member ID, creation order and claim. |
| US-21 | HTTP and mobile exercise creator member management without changing links. |
| US-22 | Adding a member leaves the existing allocations and their initial zero balance unchanged. HTTP and mobile editing can include the new member in earlier movements; payer/source and participant/recipient roles are covered with recalculated balances and preserved creation time. |
| US-23 | HTTP rejects deleting a member referenced by a movement. |
| US-24 | HTTP deletes an unused claimed member and revokes that member's session. |
| US-25 | Member HTTP session manages other members' movements and cannot administer the group. |
| US-26 | Creator HTTP session updates configuration and members; mobile closes the group. |
| US-27 | Mobile creates an expense and observes history, total and balances. |
| US-28 | Mobile checks default date, payer and all participants selected. |
| US-29 | HTTP and mobile save an expense with its payer excluded from participants. |
| US-30 | HTTP verifies exact allocation of an odd cent by original member order. |
| US-31 | Mobile creates a refund from a positive input; HTTP returns a negative amount. |
| US-32 | HTTP creates a refund without any preceding expense. |
| US-33 | Mobile and HTTP convert expense/refund while preserving the other fields. |
| US-34 | Mobile checks contribution source and initially unselected recipients. |
| US-35 | HTTP rejects empty recipients, source-as-recipient and mismatched allocations. |
| US-36 | Mobile checks equal defaults and saves customized contribution allocations. |
| US-37 | HTTP accepts a contribution with an empty concept. |
| US-38 | HTTP rejects zero, negative and subcent values; mobile accepts decimal comma and point. |
| US-39 | HTTP rejects future and out-of-range movement dates. |
| US-40 | HTTP accepts a payment from before the group was created. |
| US-41 | HTTP edit preserves creation time and recalculates state; mobile edits a movement. |
| US-42 | Mobile deletion requires confirmation; HTTP deletion restores totals and balances. |
| US-43 | Mobile history contains labeled expense, refund and contribution rows. |
| US-44 | HTTP history is descending by business date and then immutable creation time. |
| US-45 | HTTP balances sum to zero; mobile presents understandable balance phrases. |
| US-46 | HTTP total excludes contributions; mobile labels a negative total as net refunds. |
| US-47 | HTTP negative net total still yields valid balances and settlement. |
| US-48 | HTTP contribution settles the corresponding debt and leaves only residual payments. |
| US-49 | HTTP accepts an excess contribution and reverses the residual debt. |
| US-50 | HTTP checks deterministic greedy settlement and member-order tie breaking. |
| US-51 | HTTP and mobile check exact settlement sentences without group name or heading. |
| US-52 | Mobile shows the settled state and hides copy/share controls. |
| US-53 | Mobile copies exactly the displayed settlement lines. |
| US-54 | Mobile shares exactly the settlement lines via the native share contract. |
| US-55 | Concurrent HTTP edits reject stale versions without overwriting the winning edit. |
| US-56 | Mobile reload displays a movement written by another authenticated client. |
| US-57 | Mobile close confirmation preserves the complete summary on the current screen. |
| US-58 | Both credentials return 404 after close; subsequent mutation also fails. |
| US-59 | Backend controlled-clock tests and PostgreSQL lifecycle integration cover inactivity expiry. |
| US-60 | Backend controlled-clock tests cover the absolute 30-day limit despite recent activity. |
| US-61 | Backend controlled-clock tests verify only new movements renew the activity window. |
| US-62 | Backend controlled-clock tests verify reads do not renew the activity window. |
| US-63 | Mobile shows the same unavailable screen for an invalid or closed link; HTTP returns 404. |
| US-64 | Backend logging/security tests check credential and product-data exclusion from logs. |
| US-65 | Mobile observes no third-party network requests or analytics; only first-party session cookies are permitted by the user's explicit persistence decision. |
| US-66 | Mobile runs axe and 44 px touch-target checks on six primary screens at 320 px, then verifies 200% text enlargement on each screen with maximum-length names, concepts and technical amounts. Movement form regressions also check unbroken type labels and contained amount/date fields at narrow widths. The creation form checks keyboard focus and activation. |

## Custom-domain session migration

`domain-migration.spec.ts` runs against two explicitly configured local hosts,
using real host-isolated cookies and the same PostgreSQL-backed API. CI enables
this configuration; see [local setup](custom-domain.md#local-two-host-acceptance).
It never attempts a migration against a remote deployment.

Chromium and WebKit exercise member and creator transfer, clean bookmarks and
secret entry links, reloads, repeated old links, independent groups, an already
occupied destination and cleared-cookie recovery without reclaiming another
identity. A confirmation-response loss test lets the real API commit before
aborting the response, then checks that the browser can still enter the group.
HTTP cases cover browser binding, replay, an interrupted transfer keeping the
source valid, and refusing to replace an active destination session. Browser
checks reject secrets in request URLs, referrers and persistent browser storage.
Backend unit and PostgreSQL integration tests separately exercise expiry,
concurrent handoffs, revocation, transaction rollback and role preservation.

Acceptance is complete only when the referenced tests pass against the built
application. This matrix describes test responsibility; it is not a substitute
for execution results from the deployment pipeline.
