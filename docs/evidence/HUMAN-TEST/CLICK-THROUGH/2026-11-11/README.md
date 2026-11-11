# The launch screens as a release serves them (2026-11-11)

Launch row **D2** (the launch catalog works in the app). Lead session `session_011DpxUyQmE1enma4gTjcfBy`. It follows
`../2026-11-10/`, whose click-through ran with the launch-scope gate off, as every Codespace and laptop does. A
release runs with it on. This run asks whether a screen that works in the Codespace also works there.

## What already exists (RULE 3)

Nothing was built. What was used, and what it already proves:

- `server/services/entitlements/launch-scope.ts` and `launch-scope-api.ts` (`launchScopeApiVerdict`): what a release
  serves. Unset, the gate is on in production and off elsewhere. `LAUNCH_SCOPE_ENFORCE=on` and
  `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce` turn it on in a development process.
- `npm run ci:launch-scope-api` (`scripts/ci/check-launch-scope-api.ts`): no launch or shell screen names an API path
  the gate refuses. **It passes at `656e2406a3`: 657 paths, none refused.** It reads `/api/...` literals, so a URL
  built from a base and a relative piece is its blind spot.
- `docs/evidence/DESIGN/R1/2026-11-01-inventory/` (R1): every server route, whether a screen calls it, and the
  gate's verdict.
- `docs/evidence/DEMO/2026-11-10-sales-rehearsal/`: the demo stories with the gate on; no screen was refused.
- `server/middleware/redisRateLimiter.ts` and `server/config/platform-limits.ts`: the request limits, the same in a
  Codespace and in a release except for sign-in.
- `../2026-11-06/clickcrawl.cjs`: the click-through. Its logs name every screen and tab it reached.

New here, as scripts only: `gatewalk.cjs` (opens every screen and tab the click-through reached, clicks nothing but
tabs, records what the server refused and every API path the screen asked for), `rate-walk.cjs` (walks one screen at
a person's pace and records every request with its time) and `browse-download.cjs` (the walk of finding R).

## How it ran

The sandbox's Codespace build of 2026-11-10 (same database), trunk at `656e2406a3`, the app started by
`.devcontainer/post-start.sh` with `LAUNCH_SCOPE_ENFORCE=on LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`. `NODE_ENV` stayed
`development`: the client is served by Vite, and sign-in is the development sign-in. So this is the release's gate,
not the release's build. See "Not covered".

## What it found

| # | Found | Outcome |
|---|---|---|
| — | **The gate refuses no launch screen.** As Ana Author, all 134 screens and tabs the click-through reached were opened with the gate on: no request was refused as outside the release, and every screen landed where it was sent. The three refusals are CMC's own and correct (a biologic, P-28; a project with no modality yet). | **Holds.** The Lumen account's 307 screens and tabs are being opened; the count is added below when it ends. |
| — | **Doors to screens outside the release are not shown.** Of the screens the click-through reached from launch screens, two are outside the launch scope: the trial master file (from Vault's header) and the source tracer (from the project page's Evidence step). With the gate on, Vault's header shows no "Trial master file" and no "Inspection readiness" (`Vault.tsx`, `available('etmf')`), and no step of the project page shows "Trace a claim to its source" (`ProjectHome.tsx`, `available('source-tracer')`). A direct link to either says "not in this release … It is not a subscription or permission matter", with a way back to Projects. The rail lists the launch catalog and nothing else. | **Holds** (seen in the running app). |
| — | **The static gate's blind spot holds nothing.** Every server route (3,448 distinct paths, R1's inventory) was given the gate's verdict at today's code: 1,888 are refused. Each was searched for in the client as a relative piece sent through a base constant. Five matched and all five are false: the screens call a sibling path that is served (RBM's `/rbm-patient-profiles/score`, not the list). | **Holds.** |
| R | **A minute of ordinary browsing used up the download limit.** Any path with a `documents` segment is counted in the `documents` bucket: 20 requests a minute for one person, meant for downloads, exports and writes. Three reads a screen makes as it opens were in it: a selected Vault document's catalog record, and the controlled-document register with its review-due list, which the project page and Quality both read. Measured at a person's pace (`rate-walk.cjs`, a click every two seconds): the project page costs 3, Quality 4, each Vault document selected 2. So one project page, five Vault documents and one Quality visit spent the bucket; the catalog record then failed to load, and **Download answered 429 "Too many document requests. Please wait."** The click-through of 2026-11-10 met it as 429s on Vault's catalog record and Download and on Quality's later tabs, and they were put down to the crawler's pace. They were not: the page-open walk here, one screen every six seconds, was refused on Quality's last three tabs. The limits are the same in a release. | **Fixed** (this change, `server/middleware/redisRateLimiter.ts`): the three reads are record reads, counted with the other record reads (600 a minute for one person, still refused on a flood, still closed on a limiter error). The catalog record's confirm and correct, a new controlled document, a controlled document itself and every download stay at 20 a minute. Shown red then green in `redisRateLimiter-vault-reads-and-batch-upload.test.ts` (defect 4). **Walked** (`browse-download.cjs`): 43 seconds of the project page, Quality and twelve Vault documents made 26 of those reads; none was refused, and Download delivered `LMN201-CDI02-CMP-v1.1.pdf`. |
| — | The demo seed, started with the gate on, stops at the Lumen RBM step: it reads the ingestion history (`GET /api/mdx/rbm-data-runs`), which the gate refuses. | **The run's own.** A Codespace never runs with the gate on, and no screen calls that route. It is one of three RBM routes built and reached by no screen (with the scored patient profiles list and site oversight); they are on R1's list for RBM. |

## Not covered

- **The release's build.** No one has opened the screens on the built client with `NODE_ENV=production`. CI's
  production boot smoke proves that build starts and answers `/readyz`; it opens no screen. What only that build can
  show: the response headers a release sends (a content security policy against the PDF viewer's frame, for one),
  the bundle's lazy chunks, and sign-in with development sign-in off. It needs TLS to PostgreSQL and the virus
  scanner, as CI's job sets them up.
- **Clicks with the gate on.** This run opens screens; it does not click. The static gate and the search above cover
  the paths a click sends.
- **AnA.** No model key in the sandbox, as before.
