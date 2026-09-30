# P1-17 paydown 2 — twenty-five more 5xx bodies stop carrying the caught error's text; leak baseline 119 → 94 (IAM-18 (1), Low)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (grouped), item (1): after the first
tranche (`../P1-17-paydown/`) the `ci:server-error-leaks` baseline still held 119 sites across 76 files whose 5xx body
reads the caught error. **Plan item:** P1-17 ("ratcheting down"). This is the second tranche: the next 25 baselined
sites in file order that sit in cold files under the 24-hour rule — 15 files, `server/routes/ana-mdx-context.ts:94`
through `server/routes/dmsp.ts:51` in `red/list-before.txt`. Two sites inside that span were hot and skipped (below).

## What was wrong

Twenty-two 500 handlers sent `err.message`, `error?.message`, `(error as Error).message` or a template built from it to
the browser as `detail`, `details`, `message`, `error` or `error.message` — for a node-postgres failure that is the
relation or column name, the SQLSTATE text or the connection target. Concretely:

- `ana-mdx-context.ts:94` and `ana-tool-policy.ts:47,118,150` answered `{ error: 'Failed to …', detail: err.message }`.
  The existing test `server/__tests__/routes/ana-mdx-context.test.ts:109-114` **pinned the leak** — it asserted that
  `detail` contained the thrower's text.
- `assumption-decision-contradiction.ts:88-98` — the file's shared `handleError` logged the message *and* put it in
  `details`, for all 24 routes under `/api/governed-intelligence`.
- `authoring-actions.ts:1018,1226` — the inner catches of `approve-artifact` and `lock-artifact` sent
  `{ approved|locked: false, reason: 'error', message: err?.message }`.
- Six copies of the per-file `fail()` helper (`biosketch.ts:51`, `citi-training.ts:40`, `committees.ts:64`,
  `controlled-substances.ts:50`, `coverage-analysis.ts:59`, `dmsp.ts:51`) sent
  `{ error: { code: 'INTERNAL', message: err.message } }` — the pattern the gate's own header names as the reason one
  helper fix did not close the finding.
- `cerv2-document-routes.ts:274,423,497` sent `Failed to record literature entries — <err.message>` (and the screening
  write and read likewise), each beside a `logger.error` of the same text. Two existing tests pinned this too
  (`tests/routes/cerv2-literature-record.test.ts:166-177` asserted `/literature_entries/` in the body;
  `tests/routes/cerv2-literature-screening.test.ts:301-311,378-388` asserted `/deadlock detected/` and
  `/connection terminated/`).
- `cerv2-export-routes.ts:898,973` (`/ai-to-editor`, `/ectd`) sent `message: err.message`; `chat-actions.ts:182`
  sent `detail: err?.message`; `compute.ts:97,132` and `conversation-health.ts:40` sent `error: error.message`.

Three coded 500s in `cerv2-export-routes.ts:574,659,739` (`/pdf`, `/docx`, `/zip`) answered
`{ error: 'GOVERNED_EXPORT_FAILED', message: err.message || '<static>' }` — a domain code with the thrown text as its
sentence.

## What is true now

- The 22 sites answer through the one helper, `serverError(res, log, where, err)` (`server/lib/api-response.ts`): a
  static `{ error: 'INTERNAL_ERROR', message: 'Something went wrong while <where>. …', correlationId }` and the detail
  logged against `X-Request-Id`. Files with no logger got `createScopedLogger('<file>')` beside the router, exactly as
  the first tranche's `.ts` routers did (`import { serverError } from '../lib/api-response'`, extensionless, the form 59
  files under `server/routes` already use). The paired `console.error` (`chat-actions.ts`, `conversation-health.ts`) and
  the paired `logger.error` (`cerv2-document-routes.ts` ×3, `cerv2-export-routes.ts:897,972`) are gone; `handleError`
  in `assumption-decision-contradiction.ts` is now one line, `where` = `trying to <context>` because every context there
  is an imperative verb phrase. The six `fail()` helpers keep their 4xx branch byte-for-byte (`{ error: { code, message } }`
  for `NOT_FOUND`/`INVALID_STATE`/`BAD_INPUT`/`NOT_TRAINED`); only the 500 branch changed. `catch (err: any)` became
  `catch (err)` where the binding is only handed to the helper; `authoring-actions.ts` keeps `err: any` because the 4xx
  branch reads `err.governed`.
- Every 4xx branch is untouched: the 403s in `ana-tool-policy.ts`/`ana-mdx-context.ts`, the 422s, the `ScreeningRefusal`
  422s in `cerv2-document-routes.ts:411-419,486-493`, `sendGovernedContractInvalid` and the 401/403/409 answers in
  `authoring-actions.ts`, the coded 4xx of each `fail()`, the 400s in `conversation-health.ts`. No status code changed.
- The three `GOVERNED_EXPORT_FAILED` 500s keep status 500 and the code (`tests/routes/cerv2-export-governance.test.ts:264`
  and the client's `errorCodeOf` branch on it) and say the static sentence that was already their fallback; the thrown
  text stays in the `logger.error` line above each. Same treatment as the first tranche's coded 503s: a `serverError()`
  swap would have dropped the machine-readable code.
- `scripts/ci/server-error-leaks-baseline.json`: `totalSites` 119 → 94, `totalFiles` 76 → 61, fifteen `counts` keys
  removed, no count increased (checked key by key: `increased=0 removed=15 decreased=0`). The write ran only after the
  gate printed `25 site(s) fixed since the baseline` with no other failure, so no other lane's growth was baked in. The
  gate is green at the new totals.

| | File | Result |
|---|---|---|
| red | `red/gate-before.txt` | `OK — 119 baselined site(s) across 76 file(s)`, no "fixed" line |
| red | `red/list-before.txt` | the 119 sites; this tranche is the first 27 lines minus the two hot ones |
| red | `red/tests-before.txt` | the five harnesses against the unchanged handlers: 7 failed / 41 passed — `ana-mdx-context` answered `'Failed to build MDX context snapshot'` where `INTERNAL_ERROR` belongs; `ana-tool-policy` PUT answered `'Failed to update policy'`; the three cerv2 literature bodies carried `Failed to record … — <driver text>`; the export 500 carried `db writeback failed` as its `message`. (Its GET case for the tool policy was red for the wrong reason — see the next row.) |
| red | `red/tests-before-tool-policy-redesigned.txt` | the redesigned tool-policy suite against HEAD's copy of `ana-tool-policy.ts` (swapped in for one run, then restored byte-identical): 2 failed / 10 passed — the loader-throws GET and the PUT both answered the old `Failed to … policy` body |
| green | `green/gate-fixed.txt` | after the edits, before the write: `OK — 94 … 25 site(s) fixed since the baseline — shrink it with --write-baseline` |
| green | `green/write-baseline.txt`, `green/gate-after.txt` | `baseline written — 94 site(s) across 61 file(s)`; then `OK — 94 baselined site(s) across 61 file(s); no file gained one` |
| green | `green/list-after.txt` | the 94 remaining sites |
| green | `green/tests.txt` | 7 files / 52 tests passing: the five harnesses plus `authoring-actions-governance` and `authoring-actions-compare-versions-tenant` (that router gained two imports) |
| green | `green/eslint-compare.txt` | ESLint per touched file, HEAD vs working tree: no file's warning or error count rose (`authoring-actions.ts` 35 → 35, `cerv2-export-routes.ts` 5 → 5, `cerv2-document-routes.ts` 4 → 4, the rest 0 or 1 unchanged; the five test files unchanged) |

## Containment tests (all on existing harnesses)

- `server/__tests__/routes/ana-mdx-context.test.ts` — the leak-pinning case replaced: a 42P01 from the resolver yields
  500 `INTERNAL_ERROR`, `correlationId` echoing `X-Request-Id`, no `detail`, no relation name or SQLSTATE in the body.
- `server/__tests__/routes/ana-tool-policy.test.ts` — new describe on the same pool/auth harness (`dbState.failWith`
  makes every query reject). GET is **fail-soft by design**: `loadAnaToolPolicy` (`services/ana-ri/mdx-tool-policy.ts:113-123`)
  swallows a read failure and returns `{}`, so a query failure never reaches the route's catch; the suite pins that 200
  honestly, then makes the loader itself throw (a `vi.doMock` scoped to the case) to reach the catch: 500 `INTERNAL_ERROR`
  with the id and no relation name. PUT reaches its catch through the pool: same envelope, and `audit.logAction` is not
  called.
- `tests/routes/cerv2-literature-record.test.ts` and `tests/routes/cerv2-literature-screening.test.ts` — the three
  leak-pinning cases flipped: the mock response gains a `getHeader` so the id is observable; the body is the envelope,
  the relation name / `deadlock` / `connection terminated` are absent, `decisions` is absent on the failed read; the 422
  refusal cases beside them are unchanged.
- `tests/routes/cerv2-export-governance.test.ts` — the fail-closed case now also asserts the static `message` and that
  `db writeback failed` is nowhere in what was sent.

## Client callers

A grep of `client/src` and `shared/` for every migrated route path (anchored and unanchored):

- `client/src/concept2cure/mdx/hooks/useCerLiterature.ts` calls POST `/api/cerv2/literature/record` (line 203) and GET
  `/api/cerv2/literature/screening` (line 372) and, on a non-2xx, reads **`body.error` raw** (lines 214 and 396) into
  `recordError` / `trailUnavailable`, rendered by `client/src/concept2cure/mdx/surfaces/cer/LiteratureTab.tsx:368,392,612`.
  Before this change those two strings were `Failed to record literature entries — <driver text>` (the leak, on screen);
  now they are the token `INTERNAL_ERROR`. The disclosure is closed at the boundary; what remains is copy quality. The
  file's own POST `/screen` path already reads through `serverMessage(body)` (line 441, imported at line 19), which
  returns the helper's sentence — the same one-line change at lines 214 and 396 (`serverMessage(body) ?? <fallback>`)
  is the fix. **Not made here**: `client/` is outside this item's files; reported for the control tower.
- `client/src/concept2cure/mdx/hooks/useCerExport.ts:93-99,149` (POST `/api/cerv2/export/{pdf,docx,zip}`) reads through
  `serverMessage(json)`: it now shows the static sentence where before it showed the thrown text unless `looksInternal`
  caught it; `errorCodeOf` still sees `GOVERNED_EXPORT_FAILED`. No change needed.
- `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:137,403,602` (`/api/governed-intelligence/*`) reads through
  `serverMessage(json)` and never read `details`; it now shows `Something went wrong while trying to <context>…` where it
  showed `Failed to <context>`. No change needed.
- `shared/constants/ui-surface-registry.ui-v2.ts:615` lists `/api/committees`, `/api/coverage-analysis`,
  `/api/citi-training` as `apiPrefixes` (a registry, not a body reader); `ResearchAdmin.tsx:207-213,241` names committees
  and coverage as *unconnected* sections and fetches neither.
- No first-party caller for `/api/ana-tool-policy`, `/api/ana/mdx-context-snapshot`,
  `/api/authoring-actions/{approve,lock}-artifact` (`shared/types/decision-architecture.ts:205-206` names the actions,
  not the HTTP body), `/api/chat/actions/run`, `/api/concept2cure/compute/*`, `/api/conversation-health`,
  `/api/biosketch`, `/api/dmsp`, `/api/controlled-substances`, `/api/cerv2/export/{ai-to-editor,ectd}`.

The fields the migration removed from a 500 body — `detail`, `details`, `ok: false`, `success: false`,
`recorded|screened|available: false`, `decisions: []`, `approved|locked: false`, `reason: 'error'`, and the nested
`error.code: 'INTERNAL'` — are read by no client; the shared readers (`client/src/lib/queryClient.ts:180-233`) take both
the nested and the flat envelope.

## Re-run

```
node scripts/ci/check-server-error-leaks.mjs            # OK — 94 baselined site(s) across 61 file(s)
npm run --silent ci:server-error-leaks:list             # 94 server-error leak site(s)
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/__tests__/routes/ana-mdx-context.test.ts server/__tests__/routes/ana-tool-policy.test.ts \
  tests/routes/cerv2-literature-record.test.ts tests/routes/cerv2-literature-screening.test.ts \
  tests/routes/cerv2-export-governance.test.ts \
  tests/routes/authoring-actions-governance.test.ts tests/routes/authoring-actions-compare-versions-tenant.test.ts
```

## Not done here

- **Hot inside this tranche's span (2 sites), with window ends:** `server/routes/cortex-unified.ts:1024`
  (`f7597c2c`, session `01T2wooCZu46W7msw4TJuuzr`, until 2026-09-27 04:43 UTC); `server/routes/cortexQueryRoutes.ts:182`
  (`0f743698`, session `01W5zW66wy5szuFwRQYUKmkE`, until 02:49). Further down the list and also hot:
  `knowledge-base.ts:175,820,861` (`0bc045c7`, no session trailer, until 02:32) and `study-design.ts:525,604`
  (`2564895a`, session `01KnUGoX3g4R4FWKWGc2sTbN`, until 05:39). `cerv2-document-routes.ts` was touched at 13:39 today by
  this session (`7968de5b`) and so was in scope; `git status` showed no other lane editing any tranche file.
- **Cold, 87 sites in 57 files** — the next tranche in file order starts at `server/routes/document-lifecycle.ts:153`,
  `document-understanding.ts:619`, `documentOrchestrationRoutes.ts:42,72,102`, `ectd-compile.ts` ×4, `escalate.ts:42`,
  `etmf.ts:50`, `evidence-sufficiency.ts` ×3, `export-control.ts:42`, `external-evidence.ts:53` (a **502** — coded
  treatment, not `serverError()`), `financial-disclosures.ts:75`, `firecrawl.ts:244` (502, same), `grant-finder.ts:42`,
  `grants.ts:74`, `grdheRoutes.ts:695`, `ha-interactions.ts:51`, `harmonize.ts:38`, `health.ts:74,212` — 25 sites in 17
  files if all are still cold then; the full list is `green/list-after.txt`. 28 of the remaining files are the same
  `fail()` helper as the six migrated here.
- The two raw `body.error` reads in `useCerLiterature.ts:214,396` (above) went through `serverMessage(body)` in the same
  commit, as line 441 already did: `serverMessage` refuses an enum token and infrastructure text, so the record and
  screening-read failures show the hook's own sentence with the status, never `INTERNAL_ERROR` as prose
  (`client/src/lib/queryClient.ts:205`). ESLint on the hook 1 → 1.
- Register IAM-18 (1), plan P1-17, evidence index and board rows: updated by the control tower in the same commit.
- Adversarial check (`security-auditor`, 2026-09-26): **holds with residuals**, nothing to fix; the client copy residual
  above is the one it named, and it is closed here.

## After the merge with trunk (2026-09-30)

On 2026-09-29 `4cebf1b4` (another lane) made `ci:server-error-leaks` follow a local alias of the caught error's text.
That surfaced 29 existing sites in 8 more files, so trunk's baseline stood at 146 sites / 83 files when this tranche was
merged. Trunk's baseline was taken whole and the gate run on the merged tree: `OK — 121 … 25 site(s) fixed since the
baseline` (`green/gate-fixed-after-merge.txt`); `--write-baseline` then wrote 121 sites / 68 files
(`green/write-baseline-after-merge.txt`, `green/gate-after-merge.txt`). Compared key by key with trunk's baseline, the
only change is the 15 files of this tranche leaving it; no count increased or decreased elsewhere.

