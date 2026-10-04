# P1-17 tranche 3, set-B: 34 more 5xx bodies stop carrying the caught error's text

Security audit 2026-09-24, IAM-18 (1); remediation plan P1-17. Launch row D6.
Date: 2026-10-01. Branch `concept2cure-v2`, uncommitted in the shared tree; the
control tower commits.

This set was started by an earlier attempt that a usage limit interrupted at about
03:50 UTC. That attempt left the 34 containment test files (untracked) and the
first three `red/` files (`gate-before.txt`, `list-before-all.txt`,
`list-before-set.txt`, written 03:19). It changed no route file and saved no test
run. The resume read every one of those tests against its route, kept them, ran
them red against the unchanged routes, made the fixes, and wrote everything else
in this folder.

## The finding, for these files

Each of the 34 baselined `ci:server-error-leaks` sites below put the caught error's
text into a 5xx body. For a database failure that is relation, column and
constraint names and SQLSTATE text. For a provider failure it is the provider's
own body or a missing-key message. For a filesystem failure it is the absolute
path, and for a transport failure it is the internal host and port.

The canonical answer is `serverError(res, log, where, err)`
(`server/lib/api-response.ts`). It logs the detail against the request id and
returns `{ error: 'INTERNAL_ERROR', message: 'Something went wrong while <where>…',
correlationId }`. Every 500 below now goes through it. Where a site's status was
not 500 (502 or 503) and its code is part of the route's coded vocabulary, the
status and code stay as they were, the body carries the code's own static
sentence, and the detail goes to the file's logger. Prior tranches handled such
sites the same way (paydown 1's coded 503s; set-A's 502s). No 4xx branch and no
success path changed.

## Files and sites: 34 sites in 34 files before, 0 after

| File | Site (line before) | Status | Now answers |
|---|---|---|---|
| `server/routes/cortexQueryRoutes.ts` | 182 | 500 | `serverError(…, 'answering the Cortex query', …, { processingTimeMs })` |
| `server/routes/document-lifecycle.ts` | 180 (`wrap()`) | 500 | `serverError(…, 'handling the document lifecycle request')`; was `{ ok:false, error:'internal_error', detail }` |
| `server/routes/document-understanding.ts` | 619 | 500 | `serverError(…, 'analysing the document')`; was `String(err)` |
| `server/routes/escalate.ts` | 42 | 500 | `serverError(…, 'evaluating the escalation')` |
| `server/routes/etmf.ts` | 50 (`fail()`) | 500 | `serverError(…, 'handling the eTMF request')` |
| `server/routes/external-evidence.ts` | 53 | 502 | 502 kept; `firecrawlError('provider_error')` static sentence; detail logged with the request id |
| `server/routes/financial-disclosures.ts` | 76 (`fail()`) | 500 | `serverError(…, 'handling the financial-disclosure request')` |
| `server/routes/firecrawl.ts` | 244 | 502 | 502 kept; `provider_error` static sentence plus the route's own `correlationId` (hoisted above the `try`); detail logged under it |
| `server/routes/grant-finder.ts` | 42 (`fail()`) | 500 | `serverError(…, 'handling the grant-finder request')` |
| `server/routes/grdheRoutes.ts` | 695 | 500 | `serverError(…, 'executing the export job', …, { jobId })`; the best-effort job-status update is unchanged |
| `server/routes/ha-interactions.ts` | 51 (`fail()`) | 500 | `serverError(…, 'handling the health-authority interaction request')` |
| `server/routes/harmonize.ts` | 38 | 500 | `serverError(…, 'running the harmonization check')` |
| `server/routes/ind-generation.ts` | 383 | 500 | `serverError(…, 'generating the section')` |
| `server/routes/inspections.ts` | 51 (`fail()`) | 500 | `serverError(…, 'handling the inspection request')` |
| `server/routes/invention-disclosure.ts` | 41 (`fail()`) | 500 | `serverError(…, 'handling the invention-disclosure request')` |
| `server/routes/knowledge.ts` | 149 | 500 | `serverError(…, 'loading the validation-rule corpus')`; `detail` gone |
| `server/routes/lifecycle.ts` | 50 (`fail()`) | 500 | `serverError(…, 'handling the lifecycle-obligation request')` |
| `server/routes/preclinical.ts` | 149 | 503 | 503 and `PRECLINICAL_INGEST_DISABLED` kept; says the pre-check's own sentence `Preclinical ingest is disabled` (was the flag name) |
| `server/routes/predicate-intelligence.ts` | 770 | 500 | `serverError(…, 'authoring the SE discussion')`; `detail` gone |
| `server/routes/protocol-amendments.ts` | 55 (`fail()`) | 500 | `serverError(…, 'handling the protocol amendment request')` |
| `server/routes/protocol-budget.ts` | 43 (`fail()`) | 500 | `serverError(…, 'handling the protocol budget request')` |
| `server/routes/protocol-development.ts` | 96 (`fail()`) | 500 | `serverError(…, 'handling the protocol development request')` |
| `server/routes/protocol-export.ts` | 26 (`fail()`) | 500 | `serverError(…, 'handling the protocol export request')` |
| `server/routes/protocol-milestones.ts` | 40 (`fail()`) | 500 | `serverError(…, 'handling the protocol milestone request')` |
| `server/routes/protocol-portfolio.ts` | 24 (`fail()`) | 500 | `serverError(…, 'handling the protocol portfolio request')` |
| `server/routes/protocol-reviews.ts` | 69 (`fail()`) | 500 | `serverError(…, 'handling the protocol review request')` |
| `server/routes/protocol-risks.ts` | 47 (`fail()`) | 500 | `serverError(…, 'handling the protocol risk request')` |
| `server/routes/protocol-soa.ts` | 43 (`fail()`) | 500 | `serverError(…, 'handling the schedule-of-assessments request')` |
| `server/routes/protocol-templates.ts` | 41 (`fail()`) | 500 | `serverError(…, 'handling the protocol template request')` |
| `server/routes/research-compliance.ts` | 41 (`fail()`) | 500 | `serverError(…, 'handling the research-compliance request')` |
| `server/routes/seed-demo.ts` | 407 | 500 | `serverError(…, 'seeding the demo projects')` |
| `server/routes/validate-completeness.ts` | 84 | 500 | `serverError(…, 'validating submission completeness')` |
| `server/startup/inline-endpoints.ts` | 723 (`/api/shadow/health`) | 502 | 502 and its sentence kept; `message: error.message` dropped; detail logged with the request id |
| `server/utils/monitoring.js` | 180 (`errorTrackerMiddleware`) | 500 | static sentence plus `errorId` in every environment (was `message` and `stack` whenever `NODE_ENV` was not production) |

Each of the 18 per-file `fail()` helpers keeps its coded 4xx branch byte for byte.
Only the uncoded fall-through changed. Files without a logger got
`createScopedLogger('<file>')`, and a `console.error` paired with a removed body
was dropped, because `serverError()` now logs the failure.

### Two leaks the gate cannot see, closed in the same files

The gate keys on a literal `.status(5xx)`. Two more 500 paths in these files
leaked the same way:

- **`grdheRoutes.ts` router error handler**: `res.status(err.status || 500).json({ …
  message: err.message, stack (development) })`. Every `asyncHandler` route without
  its own catch falls through to it. A status of 500 or above now goes through
  `serverError(…, 'handling the GRDHE request')`. An error carrying a status below
  500 keeps its body unchanged (pinned by a test).
- **`preclinical.ts`**: `res.status(isZodLike ? 422 : 500).json({ error: message })`.
  The 500 half now goes through `serverError(…, 'ingesting the preclinical
  study', …, { sourcePdfId })`. The 422 half is unchanged (pinned by a test).

### Operator-facing diagnostics: who can reach them

- **`/api/shadow/health`** (`inline-endpoints.ts`) is mounted by
  `mountDiagnosticEndpoints` after `applyAuthBoundary` (`server/index.ts:138–142`).
  It has no `requireMetricsAuth` and is not on the public allow-list
  (`register-platform-routes.ts` lists only `/api/time` and `/api/diag`), so any
  signed-in user of any tenant reaches it. It is not operator-only, so it was
  changed rather than skipped.
- **`errorTrackerMiddleware`** (`monitoring.js`) is imported by no runtime module
  today. An error handler answers whoever can make a request fail, and a staging,
  demo or preview deployment that is not `NODE_ENV=production` is still one people
  sign into. It was changed so that a future mount cannot reintroduce the
  disclosure.
- Nothing in this set was skipped as a deliberate platform-admin-only diagnostic.

## Client readers

Every client caller of these paths goes through `apiRequest`. In a browser it
throws `ApiRequestError` for every non-2xx except 401. Its message comes from
`extractApiError` → `serverMessage`, which selects the envelope's `message`, the
static sentence. `useLiveData`'s `failureFrom` shows that message as an error
state, not an empty result. `Etmf.tsx`, `CommunicationCenter.tsx` and
`ProtocolDevSoa.tsx` already read refusals through `serverMessage()`. No client
branches on `'INTERNAL'`, `'internal_error'`, `EXPORT_FAILED`,
`PRECLINICAL_INGEST_ERROR` or `provider_error` (grep of `client/src`).

Two helpers read `error` before `message` on a refusal they get back as a resolved
response: `submitProtocolRegister` (`error?.message ?? error?.code ?? error`) and
`ProtocolDevWrites.detailOf` (returned a string `error` unchanged). A 500 that
reached either would have read "Couldn't record the risk — INTERNAL_ERROR." Both
now read `serverMessage(json) ?? errorCodeOf(json) ?? 'HTTP <status>'`. They still
say the write failed and that nothing was written; a coded 4xx reads as before.
`tests/routes/protocol-dev-client-5xx-message.test.ts` pins them, feeding the
envelope produced by the real `serverError()`.

## Red / green

| Check | Red (unchanged code) | Green |
|---|---|---|
| 34 containment suites (`*-error-containment.test.ts`, the two `tests/routes/` files) | 34 files failed; 36 tests failed, 31 passed (67). Every failure is the assertion "the thrown text reached the client" (`red/tests-before.txt`) | 34 files, 67 tests passed (`green/tests-after.txt`) |
| Client refusal readers (`tests/routes/protocol-dev-client-5xx-message.test.ts`) | 2 of 3 failed: `Couldn't record the risk — INTERNAL_ERROR…`, `Couldn't add the visit — INTERNAL_ERROR…` (`red/client-tests-before.txt`) | 3 passed; with the 7 existing suites for those modules, 8 files and 55 tests (`green/client-tests-after.txt`) |
| Existing test that pinned the leak (`server/routes/__tests__/lifecycle-renewals-read.test.ts`, which asserted `error.code === 'INTERNAL'` on the 500) | Failed once the route was contained (`green/neighbours-before-flip.txt`) | Flipped to containment (`error === 'INTERNAL_ERROR'`, body does not contain the thrown text): 27 neighbour files, 433 tests passed (`green/neighbours-after.txt`) |
| Every client suite on the protocol surfaces | n/a | 26 files, 279 tests passed (`green/client-protocol-suites-after.txt`) |
| `ci:server-error-leaks`, this set | 34 sites in 34 files (`red/list-before-set.txt`) | 0 (`green/list-after-set.txt` is empty) |
| `ci:server-error-leaks`, whole tree | 95 / 61 at 03:19 (`red/gate-before.txt`); 48 / 46 at resume (`red/gate-before-resume.txt`, after set-A's concurrent work) | 10 / 10, "no file gained one", exit 0 (`green/gate-after.txt`). This set accounts for 34 sites in 34 files; other lanes' uncommitted work removed the rest |
| ESLint, per changed file, HEAD vs tree | n/a | 0 errors everywhere; no file's warning count rose (`grdheRoutes.ts` 4 to 3) (`green/eslint-compare.txt`); test files: 36 files, 0 errors, 0 warnings |

The baseline (`scripts/ci/server-error-leaks-baseline.json`) has not been
rewritten. `--write-baseline` belongs to the control tower and runs after the
tranche lands.

## Commands

```
node scripts/ci/check-server-error-leaks.mjs            # gate-before*.txt, gate-after.txt
node scripts/ci/check-server-error-leaks.mjs --list     # list-*.txt
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
  server/routes/__tests__/{cortexQueryRoutes,document-lifecycle,document-understanding,escalate,etmf,external-evidence,financial-disclosures,firecrawl,grant-finder,grdheRoutes,ha-interactions,harmonize,ind-generation,inspections,invention-disclosure,knowledge,lifecycle,preclinical,predicate-intelligence,protocol-amendments,protocol-budget,protocol-development,protocol-export,protocol-milestones,protocol-portfolio,protocol-reviews,protocol-risks,protocol-soa,protocol-templates,research-compliance,seed-demo,validate-completeness}-error-containment.test.ts \
  tests/routes/inline-endpoints-shadow-health-containment.test.ts \
  tests/routes/monitoring-error-tracker-containment.test.ts     # tests-before.txt / tests-after.txt
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run tests/routes/protocol-dev-client-5xx-message.test.ts   # client-tests-*.txt
# neighbours: every test that imports one of the 34 files (27 files; list at the top of neighbours-after.txt)
npx eslint <file>   and   git show HEAD:<file> | npx eslint --stdin --stdin-filename <file>   # eslint-compare.txt
```

## Residuals (not changed here)

- `grdheRoutes.ts` still writes the thrown text and stack into the export job
  row (`updateExportJobStatus(jobId, 'failed', { errorMessage, errorDetails: {
  stack } })`), and a job read can return them. That is a persisted-record
  disclosure, not a 5xx body, so the gate does not see it. It needs its own item.
- `/api/shadow/health` still passes the upstream's own non-OK payload through
  (`details: payload`) to any signed-in user. This is not caught-error text, and
  it is pinned unchanged by a test. Gating the route behind `requireMetricsAuth`
  would be a behaviour change and belongs to an operator-diagnostics item.
- `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx` `refusal()` has
  the same "string `error` first" shape. It is reached only on a 401 in a browser
  (`apiRequest` throws first for a 5xx), it is private with no test seam, and so
  it was not changed without a test that fails first.
- The grdhe 4xx branch still adds `stack` when `NODE_ENV === 'development'`.
  This is a 4xx, kept byte for byte by instruction.
