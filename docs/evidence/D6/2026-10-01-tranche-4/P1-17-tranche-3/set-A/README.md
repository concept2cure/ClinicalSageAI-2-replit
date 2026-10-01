# P1-17 tranche 3, set A: no caught-error text in a 5xx body (IAM-18 (1))

Row D6. Plan item P1-17; audit finding IAM-18 (1). Date: 2026-10-01.

This set clears every baselined `ci:server-error-leaks` site in 17 route files:
51 sites, 0 left. Each 500 now answers through `serverError(res, log, where, err)`
(`server/lib/api-response.ts`). That helper logs the detail against the request
id and returns `{ error: 'INTERNAL_ERROR', message, correlationId }`. It follows
the shape of the paydown-2 commit 89852a48. Each file uses its existing scoped
logger or a new `createScopedLogger`, with a stable `where` sentence. Nothing
changed in any 4xx answer or success path. The one exception is the
health-probe report, covered below.

A non-500 status (502, 503, 501) keeps its status and its machine-readable code
and gets a fixed sentence. The caught text goes to the log. This is how the
first P1-17 tranche (51d61713) treated a coded 503. `serverError()` only answers
500, so these bodies have no `correlationId`.

This session resumed an attempt that a usage limit cut off at about 03:50 UTC.
That attempt had written the 17 containment tests, run them red at 03:30:55, and
edited 15 of the 17 route files. This session reviewed those edits and kept
them. It then fixed `health.ts` and `real-world-evidence.ts`, ran everything
green, and wrote this README.

## Files and sites

| File | Status(es) | Sites before | Sites after | Treatment |
|---|---|---:|---:|---|
| server/routes/documentOrchestrationRoutes.ts | 500 | 3 | 0 | `serverError` (generate / lock / version) |
| server/routes/ectd-compile.ts | 500 | 4 | 0 | `serverError` + `{ projectIdent }` log context (compile / status / history / validate) |
| server/routes/evidence-sufficiency.ts | 500 | 3 | 0 | `serverError` + `{ programId }` / `{ assessmentId }` |
| server/routes/health.ts | 500 | 2 | 0 | `serverError`; also fixes the deep-check probe text, see below |
| server/routes/knowledge-base.ts | 502 | 3 | 0 | 502 kept with its sentence; the connector or transport text is logged |
| server/routes/nanoBanana.ts | 500 | 4 | 0 | `serverError` |
| server/routes/part11-compliance.ts | 500 | 2 | 0 | `serverError` (signature manifest, seal integrity); the 503 `SIGNATURE_STORE_UNPROVISIONED` is unchanged |
| server/routes/planner-routes.ts | 500 | 4 | 0 | `serverError` (three generators plus the shared `exportToPDF`) |
| server/routes/platform-capabilities.routes.ts | 500 | 2 | 0 | `serverError` |
| server/routes/predictive-sections.ts | 500 | 4 | 0 | `serverError` |
| server/routes/project-modules.ts | 500 | 2 | 0 | `serverError`; the Zod 400 is unchanged |
| server/routes/real-world-evidence.ts | 503, 501 | 2 | 0 | FAERS 503: code, sentence and openFDA status kept, transport text logged. Study 501: message built from `dataSource` |
| server/routes/reports/manifest-routes.ts | 500 | 4 | 0 | `serverError` |
| server/routes/reports/subscriptions-routes.ts | 500 | 4 | 0 | `serverError` |
| server/routes/se-matrix.ts | 500, 502 | 2 | 0 | 500 → `serverError` + `{ programId }`; the 502 keeps its status, and the shadow-service text goes to the log and the existing audit row |
| server/routes/tenant-export.ts | 500 | 3 | 0 | `serverError` + `{ organizationId }`; the 404 and 503 are unchanged |
| server/routes/universal-packager.ts | 500 | 3 | 0 | `serverError` (its existing `logger`) |
| **Total** | | **51** | **0** | 17 files to 0 files |

Before: `red/list-before-set-A.txt`. After: `green/list-after-set-A.txt` (empty
apart from the count line).

The whole-tree gate is shared with the other sets in this tranche, which edit
other files in the same tree. Its totals are 95 sites in 61 files before
(`red/gate-before.txt`) and 10 sites in 10 files after (`green/gate-after.txt`),
which is 86 fixed across all sets. Exit is 0 and no file gained a site. This set
did not write the baseline. That `--write-baseline` step belongs to the control
tower.

### Decisions worth a reviewer's eye

- **health.ts was fixed, not exempted.** No file imports it today. It is a
  Kubernetes and load-balancer probe router, so wherever it is mounted it is
  reached without a session. That makes it unauthenticated, not
  platform-admin-only. Both of its 500s now go through `serverError`; the deep
  check's log keeps the stack as log-only context.
  - The deep check's degraded **503** report also carried the database and
    SagePlus probe errors verbatim. The gate does not flag those, because they
    are built before the status call, but they are the same disclosure in a 5xx
    body. They now read `"<probe> probe failed; the detail is in the server
    log"` and the detail is logged at warn level.
  - A failed latency probe sets `latencyError` on a report that can still
    answer **200**. That field also carried the driver text. It gets the same
    fixed sentence. This is the one change on a non-5xx path. It is the same
    field, on the same unauthenticated body, with the same disclosure.
- **real-world-evidence.ts.** `FAERSUnavailableError` now has two fields:
  - `publicDetail`: what the caller is told. This is openFDA's own HTTP status
    and error code, public facts about a public API.
    `rwe-faers-honesty.contract.test.ts` still pins the 429 detail.
  - `transportDetail`: log-only. A fetch failure's own message names the proxy,
    resolver or address the server dials.

  The fail-closed shape of the 503 is unchanged: no `data` and no `signals`. The
  501 used `err.message`, which names the deployment variable `FHIR_BASE_URL`.
  It now says which source is not configured, from `err.dataSource`.
  `rwe-study-service.ts` is outside this set and was not touched.

## Red and green

The tests are new, one per file. Each makes the dependency throw an Error
carrying a sentinel (`SENTINEL-DB-DETAIL`, `SENTINEL-FS-DETAIL`, and so on, with
a realistic host, path or relation name). Each then asserts four things:

- The response body contains neither the sentinel nor the host, path or
  relation.
- A 500 carries `error: 'INTERNAL_ERROR'` and the request's `correlationId`.
- The sentinel reached the scoped logger.
- In one extra case per file, the 4xx or healthy answers are unchanged.

Red was taken against the unchanged handlers at 03:30:55. That was before any
route edit, and the test files have not changed since. No commit has touched any
of the 17 route files since 03:00, so HEAD's content then is HEAD's content now.

| Test file | Red (failed / passed) | Green |
|---|---|---|
| server/routes/__tests__/documentOrchestrationRoutes-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| server/routes/__tests__/evidence-sufficiency-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| server/routes/__tests__/health-5xx-containment.test.ts | 4 / 1 | 5 / 5 |
| server/routes/__tests__/knowledge-base-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| server/routes/__tests__/manifest-routes-5xx-containment.test.ts | 4 / 1 | 5 / 5 |
| server/routes/__tests__/nanoBanana-5xx-containment.test.ts | 4 / 1 | 5 / 5 |
| server/routes/__tests__/part11-compliance-5xx-containment.test.ts | 2 / 1 | 3 / 3 |
| server/routes/__tests__/planner-routes-5xx-containment.test.ts | 6 / 1 | 7 / 7 |
| server/routes/__tests__/platform-capabilities.routes-5xx-containment.test.ts | 2 / 1 | 3 / 3 |
| server/routes/__tests__/predictive-sections-5xx-containment.test.ts | 4 / 1 | 5 / 5 |
| server/routes/__tests__/real-world-evidence-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| server/routes/__tests__/se-matrix-5xx-containment.test.ts | 2 / 1 | 3 / 3 |
| server/routes/__tests__/subscriptions-routes-5xx-containment.test.ts | 4 / 1 | 5 / 5 |
| server/routes/__tests__/tenant-export-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| server/routes/__tests__/universal-packager-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| tests/routes/ectd-compile-5xx-containment.test.ts | 3 / 1 | 4 / 4 |
| tests/routes/project-modules-5xx-containment.test.ts | 2 / 1 | 3 / 3 |
| **Total** | **55 failed / 17 passed** (`red/tests-before.txt`) | **72 / 72** (`green/tests-after.txt`) |

Every red failure is the leak itself. Examples from `red/tests-before.txt`:

- `{"error":"Tenant export failed","detail":"SENTINEL-DB-DETAIL …`
- `{"success":false,"error":"SENTINEL-FS-DETAIL ENOSPC: no space left on device, write '/tmp/packager-7f3a/out.docx'"}`
- `'openFDA request failed: SENTINEL-TRANSPORT-DETAIL connect ECONNREFUSED 10.9.8.7:3128'`
- `'No FHIR data source is connected (FHIR_BASE_URL not set).'`

**Neighbour suites.** These are the existing tests that import a route in this
set. They were run unchanged and none of them pinned the old text:

- `green/neighbour-suites.txt`: 25 files, 191 tests, all passed. This covers
  tenant-export, the audit-trail contract, evidence-sufficiency and nano-banana
  tenant isolation, knowledge-base upload guards, the nine part11 suites,
  `rwe-faers-honesty`, `rwe-study-service`, the part11 audit-trail gate, the six
  ectd-compile suites, and project-modules tenant scoping.
- `green/neighbour-suites-2.txt`: route smoke and the marketing-application
  golden journey, 2 files, 19 tests, all passed.

**ESLint.** `green/eslint-compare.txt` gives problem counts per file: HEAD's
content (through stdin) against the working tree. No file increased.
knowledge-base.ts went from 47 to 46.

## Client readers

I grepped `client/src` for every mount path:

- `/api/ectd-compile`
- `/api/nano-banana`
- `/api/planner`
- `/api/predictive-sections`
- `/api/reports/*`
- `/api/510k/*`
- `/api/evidence-sufficiency`
- `/api/knowledge-base`
- `/api/tenant-export`
- `/api/packager`
- `/api/part11`
- `/api/platform/ai-providers`
- `/api/project-modules`
- `/api/programs/:id/se-matrix`
- `/api/real-world-evidence`
- `/health/*`

Only `client/src/concept2cure/v2/surfaces/EctdCompile.tsx` reads a route in this
set (ectd-compile compile, status, history and validate). It needs no change:

- Its `readJson` catches the error `apiRequest` throws on any non-OK status
  other than 401 and returns `{ ok: false, status: 0, body: null }`.
- So a 500 body never reaches the screen. Each caller already shows a fixed
  failure: status or history in an error state, "Validation didn’t run (HTTP …)"
  with the failure flag set, and "Compile refused (HTTP …) — nothing was
  assembled".
- The compile toast reads `body.error.message`. The old 500 never had that
  field, because `error` was a string.
- The import path already goes through `serverMessage(body)`.

A failed request still shows as failed, never as an empty result.

`reports/manifest-routes.ts`, `reports/subscriptions-routes.ts` and `health.ts`
have no importer on the server, so nothing mounts them today.

## Commands

```
# gate, before (from the interrupted attempt) and after
node scripts/ci/check-server-error-leaks.mjs
node scripts/ci/check-server-error-leaks.mjs --list | grep -E 'server/routes/(<17 files>)\.ts:'

# red (against unchanged handlers) and green
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
  server/routes/__tests__/{documentOrchestrationRoutes,evidence-sufficiency,health,knowledge-base,manifest-routes,nanoBanana,part11-compliance,planner-routes,platform-capabilities.routes,predictive-sections,real-world-evidence,se-matrix,subscriptions-routes,tenant-export,universal-packager}-5xx-containment.test.ts \
  tests/routes/{ectd-compile,project-modules}-5xx-containment.test.ts

# neighbour suites: see the file list at the top of green/neighbour-suites*.txt
# ESLint compare: npx eslint <file> -f json  vs  git show HEAD:<file> | npx eslint --stdin --stdin-filename <file> -f json
```

## Not done here

- `scripts/ci/server-error-leaks-baseline.json` has not been rewritten. The
  control tower runs `--write-baseline` once every set has landed.
- No typecheck was run, per the instructions. Two type changes need a check:
  - `databaseResult.latencyError` in health.ts lost its `as any`. The field is
    declared on the local type.
  - `FAERSUnavailableError` has a new optional second constructor parameter. The
    field is named `transportDetail`, not `cause`, to stay clear of ES2022
    `Error.cause`.

## Fix round (2026-10-01, 08:20–08:30 UTC)

Review must-fix 1 (IAM-18 (1) residual, Low, same class as the item; 21 CFR
11.10(e), GDPR Art. 32, HIPAA 164.312(e)(1)): `se-matrix.ts` still sent the
shadow service's own error body to the tenant. When the shadow service
*answered* 500 or above, as opposed to failing to connect, the render handler
turned it into 502 `detail: <shadow body>`. This round's own sweep found the
same shape in `knowledge-base.ts`, which is in this set. Five shadow relays
there passed a shadow 5xx answer through verbatim, status and body. That
contradicts the "0 sites" claim for that file too, so it is fixed here as
well. The reviewer can veto that part on its own; it touches no other file.

The leak gate cannot see either shape, because no caught error is involved.
The gate read the same before and after this round: 10 baselined sites in 10
files, 86 fixed, exit 0, and 0 sites in the 17 set-A files
(`fix-round/gate-after-fix-round.txt`; the before run was printed at the start
of the round and was identical).

### What changed

| File | Path | Before | After |
|---|---|---|---|
| server/routes/se-matrix.ts | POST `/:programId/se-matrix/render`, shadow answers >= 500 | 502 `{ error: 'SE matrix payload generation failed', detail: <shadow JSON or raw text> }` | 502 `{ error: 'Shadow service unavailable' }`, the same answer as the catch. The shadow body is logged with `programId` and `shadowStatus`. The `SE_MATRIX_GENERATION_FAILED` audit row is unchanged. |
| server/routes/se-matrix.ts | same, shadow answers < 500 | status and `detail` relayed | unchanged: a 422 validation body is the intended relay |
| server/routes/knowledge-base.ts | GET `/context/:projectId`, POST `/generate-ind-section`, POST `/upload` (ingest), POST `/generate-docx` and `/generate-ind-package` (`proxyBinary`), shadow answers >= 500 | shadow status, content type and body passed through | shadow status kept, body `{ error: 'Shadow service failed' }`. The shadow body is logged through one helper, `sendShadowFailure`, with a stable where-string per relay. |
| server/routes/knowledge-base.ts | same relays, shadow answers < 500, and binary success | passed through | unchanged |

The knowledge-base relays keep the upstream status rather than mapping it to
502, so the only change is the 5xx body. A shadow 5xx in `proxyBinary` does not
throw, so it does not fall into the Node DOCX fallback. Before this round it
also did not fall back; it piped the error body.

No client changes. No file in `client/src` reads `/api/programs/:id/se-matrix/render`
or any of the five knowledge-base relays (grep for the mount paths). The
server's own references are the predicate-intelligence routes, which are a
different router, and smoke tests that only check auth.

### Red and green

Red was run against the working-tree handlers before each edit. The sha256 of
the route file is recorded at the top of each output.

| Test file | New cases | Red (failed / passed) | Green |
|---|---|---|---|
| server/routes/__tests__/se-matrix-5xx-containment.test.ts | shadow JSON 500, shadow plain-text 503, 4xx relay pin | 2 / 4 (`fix-round/red-se-matrix-tests.txt`) | 6 / 6 (`fix-round/green-se-matrix-tests.txt`) |
| server/routes/__tests__/knowledge-base-5xx-containment.test.ts | context JSON 500, ind-section text 503, upload JSON 500, generate-docx and generate-ind-package text 500, 4xx relay pin, binary 200 pin | 5 / 6 (`fix-round/red-knowledge-base-tests.txt`) | 11 / 11 (`fix-round/green-knowledge-base-tests.txt`) |

Every red failure is the leak itself:

- `502 {"error":"SE matrix payload generation failed","detail":"SENTINEL-SHADOW psycopg2.errors.UndefinedTable: relation \"predicate_devices\" does not exist File \"/srv/shadow/app.py\", line 88"}`.
  This is the reviewer's reproduction, now pinned.
- knowledge-base: `expected '{"detail":"SENTINEL-SHADOW psycopg2.e…' not to match …`.
- knowledge-base: `expected 'Traceback (most recent call last): SE…' not to match …`.

The two pins, the 4xx relay and the binary success, passed red and green. They
show that the fix narrowed the relay rather than closing it.

Whole set after the round: 17 files, 82 of 82 tests passed
(`fix-round/green-set-A-all-tests.txt`). That is the earlier 72, plus 3 new
se-matrix tests and 7 new knowledge-base tests. The neighbour suites that import
`knowledge-base.ts`, unchanged, passed 35 of 35 in 3 files
(`fix-round/green-neighbour-suites.txt`): `knowledge-base-proxy-traversal`,
`knowledge-base-upload-guards` and the route smoke test. No existing test
imports `se-matrix.ts` besides its containment test.

ESLint problem counts, HEAD content against the working tree
(`fix-round/eslint-compare-fix-round.txt`):

- `se-matrix.ts`: 2 and 2.
- `knowledge-base.ts`: 47 and 46.
- Both test files: 0.

Final file hashes:

- `se-matrix.ts` `d3a200c7…`
- `knowledge-base.ts` `f3cb67c3…`

### Commands

```
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/se-matrix-5xx-containment.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/knowledge-base-5xx-containment.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run <the 17 set-A containment files, as above>
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/knowledge-base-proxy-traversal.test.ts \
  server/routes/__tests__/knowledge-base-upload-guards.test.ts server/__tests__/routes/smoke.test.ts
node scripts/ci/check-server-error-leaks.mjs ; node scripts/ci/check-server-error-leaks.mjs --list
```

### Still not covered

- The leak gate does not model an upstream relay. A `res.status(upstream.status)…send(upstream.body)`
  in any other route is invisible to it. Teaching `check-server-error-leaks.mjs`
  that shape is outside this set.
- The shadow service's source is not in this repository (only
  `shadow_service/shadow_service/scoring/` is), so what its 5xx bodies contain
  cannot be bounded here. The fix does not depend on knowing that.
