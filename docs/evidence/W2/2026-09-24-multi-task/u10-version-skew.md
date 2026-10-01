# U10 — client and API out of step across a release

Launch row: **D1** (production as configured).
Date: 2026-10-01. Branch: `concept2cure-v2`.

The audit confirmed two findings (`audit-findings.md`). Both are about a
browser running a different release from the API, or from the bucket.

## 1. The new frontend went live before the API it calls

`deploy-frontend` needed only `test` and `security-gate`. It ran in parallel
with `build-push`, `migrate` and `deploy-api`, so the new `index.html` was live
before any new API task existed. It stayed live, with no end date, in three
cases:

- `migrate` failed;
- `deploy-api` failed;
- the circuit breaker rolled the service back.

The audit's concrete case: the filing bar sends a password to an API that
still demands the retired signing PIN, so the document cannot be filed.

**Fix (`.github/workflows/deploy-aws.yml`).** `deploy-frontend` now needs
`deploy-api`. It publishes only when one of these holds:

- that job succeeded (and `deploy-api` waits for the service to be stable);
- the dispatch was frontend-only (`deploy_api=false`).

`test` and `security-gate` must still pass, and `deploy_frontend=false` is
still honoured.

**Guard: `tests/schema-contract/deploy-frontend-after-api.contract.test.ts`.**
It evaluates the job's real `if:` and `needs:` under the Actions rule (no
status function means every need must succeed) across six scenarios. It also
checks that the smoke test still runs after a frontend-only dispatch.

- Before: 3 failed — `needs deploy-api`; migrate failed; API failed or rolled
  back.
- After: 8/8, and `deploy-migration-mechanism.contract.test.ts` still passes
  (363 in total across both files).

## 2. A tab opened before a release could not get in after it

**The chunks themselves.** `aws s3 sync --delete` removed the previous
release's hashed chunks, so a tab opened before the release could not
lazy-load them. This was already fixed by the U5 sync restructure: `assets/`
is uploaded without `--delete`, and `ci:frontend-sync-coverage` checks it.

**What was left.** The client still could not recover from a chunk that failed
to arrive:

- Vite's preload helper rejects first, with `Unable to preload CSS for …`
  (V2App and the surfaces import stylesheets). `isChunkLoadFailure` did not
  recognise that message. `SurfaceBoundary` therefore told the user the
  failure was a fault on our side and reported it as a render crash.
- The root `ErrorBoundary`'s "Try Again" reset state and rendered again.
  `React.lazy` caches the rejected import and rethrows it, so the button could
  never recover. This is the boundary a user reaches when V2App is first
  imported, right after MFA.

**Fix.**

- `client/src/concept2cure/v2/SurfaceScaffold.tsx`: `isChunkLoadFailure` now
  recognises `unable to preload css`.
- `client/src/ErrorBoundary.jsx`: for a chunk-load failure, "Try Again" reloads
  the page, and the fallback says the page did not finish loading. A render
  crash still resets in place.

**Guard: `client/src/__tests__/errorBoundaryChunkReload.test.tsx`.**

- Before: 2 failed — the classification; "Try Again" never reloaded.
- After: 3/3, and the existing `clientErrorReporting.test.tsx` still passes
  (11 in total).

Raw runs: `u10-runs.txt`.

## Not covered

- **Rolling window.** For the length of one ECS roll (minimum 100%, maximum
  200%, no stickiness), consecutive calls from one tab can still alternate
  between old and new tasks.
- **Tabs open across the release.** A tab that was open before the release
  keeps the old client against the new API until it is reloaded. Nothing
  compares `BUILD_COMMIT` with `GET /api/version`. Closing that is a client
  behaviour change on every surface, which is not in this unit.
- **Old chunks are never removed.** Hashed chunks from earlier releases now
  stay in the bucket. They are immutable and small; an S3 lifecycle rule can
  expire them later.
