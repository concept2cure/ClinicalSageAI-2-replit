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
- `../2026-11-11/` (session `01E8btkB…`, the same day): every launch screen read in the running app, with the gate
  off: what each shows and whether it reads as the plan's design. This run does not repeat it. It asks the two things
  that walk does not: what a release's gate refuses, and what the request limits refuse.

New here, as scripts only: `gatewalk.cjs` (opens every screen and tab the click-through reached, clicks nothing but
tabs, records what the server refused and every API path the screen asked for), `rate-walk.cjs` (walks one screen at
a person's pace and records every request with its time), `browse-download.cjs` (the walk of finding R) and
`cspwalk.cjs` (the same screens on the built client, under the policy a release enforces).

## How it ran

The sandbox's Codespace build of 2026-11-10 (same database), trunk at `656e2406a3`, the app started by
`.devcontainer/post-start.sh` with `LAUNCH_SCOPE_ENFORCE=on LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`. `NODE_ENV` stayed
`development`, so sign-in is the development sign-in. The gate walk ran on the Vite-served client. The policy walk
ran on the built client (`npx vite build`, then `SKIP_VITE=1`, with `server/public` linked to `dist/public` because
the source server looks for the build beside itself). See "Not covered" for what that leaves.

## What it found

| # | Found | Outcome |
|---|---|---|
| — | **The gate refuses no launch screen.** As Ana Author, all 134 screens and tabs the click-through reached were opened with the gate on: no request was refused as outside the release, and every screen landed where it was sent. The three refusals are CMC's own and correct (a biologic, P-28; a project with no modality yet). | **Holds.** The Lumen account's 307 screens and tabs are being opened; the count is added below when it ends. |
| — | **Doors to screens outside the release are not shown.** Of the screens the click-through reached from launch screens, two are outside the launch scope: the trial master file (from Vault's header) and the source tracer (from the project page's Evidence step). With the gate on, Vault's header shows no "Trial master file" and no "Inspection readiness" (`Vault.tsx`, `available('etmf')`), and no step of the project page shows "Trace a claim to its source" (`ProjectHome.tsx`, `available('source-tracer')`). A direct link to either says "not in this release … It is not a subscription or permission matter", with a way back to Projects. The rail lists the launch catalog and nothing else. | **Holds** (seen in the running app). |
| — | **The static gate's blind spot holds nothing.** Every server route (3,448 distinct paths, R1's inventory) was given the gate's verdict at today's code: 1,888 are refused. Each was searched for in the client as a relative piece sent through a base constant. Five matched and all five are false: the screens call a sibling path that is served (RBM's `/rbm-patient-profiles/score`, not the list). | **Holds.** |
| R | **A minute of ordinary browsing used up the download limit.** Any path with a `documents` segment is counted in the `documents` bucket: 20 requests a minute for one person, meant for downloads, exports and writes. Three reads a screen makes as it opens were in it: a selected Vault document's catalog record, and the controlled-document register with its review-due list, which the project page and Quality both read. Measured at a person's pace (`rate-walk.cjs`, a click every two seconds): the project page costs 3, Quality 4, each Vault document selected 2. So one project page, five Vault documents and one Quality visit spent the bucket; the catalog record then failed to load, and **Download answered 429 "Too many document requests. Please wait."** The click-through of 2026-11-10 met it as 429s on Vault's catalog record and Download and on Quality's later tabs, and they were put down to the crawler's pace. They were not: the page-open walk here, one screen every six seconds, was refused on Quality's last three tabs. The limits are the same in a release. | **Fixed** (this change, `server/middleware/redisRateLimiter.ts`): the three reads are record reads, counted with the other record reads (600 a minute for one person, still refused on a flood, still closed on a limiter error). The catalog record's confirm and correct, a new controlled document, a controlled document itself and every download stay at 20 a minute. Shown red then green in `redisRateLimiter-vault-reads-and-batch-upload.test.ts` (defect 4). **Walked** (`browse-download.cjs`): 43 seconds of the project page, Quality and twelve Vault documents made 26 of those reads; none was refused, and Download delivered `LMN201-CDI02-CMP-v1.1.pdf`. |
| — | The demo seed, started with the gate on, stops at the Lumen RBM step: it reads the ingestion history (`GET /api/mdx/rbm-data-runs`), which the gate refuses. | **The run's own.** A Codespace never runs with the gate on, and no screen calls that route. It is one of three RBM routes built and reached by no screen (with the scored patient profiles list and site oversight); they are on R1's list for RBM. |
| — | **The built client works under the policy a release enforces.** The client was built as a release builds it (`npx vite build`, 32 seconds, 216 assets) and served by the app (`SKIP_VITE=1`), with the gate on. Each page's header was rewritten into the enforcing policy of `enterprise-security.ts`'s production branch (`cspwalk.cjs`), and all 134 screens and tabs were opened as Ana Author: **no uncaught error, no script or stylesheet failed to load, and no screen was refused anything it uses.** The editor's and the dialogs' runtime styles carry the nonce (`client/src/cspNonce.ts`). Two things were reported on every page, S and T. | **Holds**, with S and T. |
| S | **Every page load reported a refused inline style.** The build writes an inline theme block into `index.html` (`<style data-vite-theme>`, 20 variables), and the server gave the request's nonce to `<script>` tags only. The release's `style-src-elem` has no `'unsafe-inline'`, so the block was refused. A stylesheet defines the same 20 variables: read with and without the policy they are equal, and a screenshot of Projects is byte for byte the same. So nothing looked different, but each page load sent a violation report, which hides a real one. | **Fixed** (this change, `server/vite.ts`): every `<style>` in the template gets the nonce, as scripts do. Shown red then green in `server/__tests__/vite-csp-nonce.test.ts`. **Walked** with T. |
| T | **Twenty-one of the 134 screens reported a refused `eval`.** Zod probes `new Function` once, to choose its compiled parser. The release's `script-src` has no `'unsafe-eval'`. Zod catches the refusal and parses without compiling, so nothing broke, but the browser reported a violation on 21 of the 134 screens. | **Fixed** (this change, `client/src/cspNonce.ts`): Zod is told not to probe (`jitless`), which is what its own source names for a strict policy; a release cannot compile anyway. Shown red then green in `client/src/__tests__/cspNonce.test.ts`. **Walked:** the client rebuilt, the app restarted, 27 screens (every fifth of the 134) opened under the enforcing policy: no violation, no error. |

## Not covered

- **The release's process.** The client above is the release's build, under the release's policy and gate, but the
  server ran with `NODE_ENV=development`: sign-in was the development sign-in, and the header was rewritten in the
  browser, not sent by the server. A process started with `NODE_ENV=production` needs TLS to PostgreSQL and the virus
  scanner, as CI's production boot smoke sets them up; that job proves it starts and answers `/readyz`.
- **Clicks under the policy.** The walk opens screens and their tabs. It does not type in the editor, open the PDF
  viewer's frame or download. `frame-src` admits the viewer's `blob:` frame by the same file's comment and its own
  evidence (`docs/evidence/D3/2026-10-22-pdf-viewer-csp/`).
- **Clicks with the gate on.** This run opens screens; it does not click. The static gate and the search above cover
  the paths a click sends.
- **AnA.** No model key in the sandbox, as before.
