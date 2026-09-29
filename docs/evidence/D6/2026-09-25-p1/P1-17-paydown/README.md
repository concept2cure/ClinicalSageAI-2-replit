# P1-17 paydown — twenty-five 5xx bodies stop carrying the caught error's text; leak baseline 145 → 120 (IAM-18 (1), Low)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (grouped), item (1): the
`ci:server-error-leaks` baseline held 145 sites across 89 files whose 5xx body reads the caught error. **Plan item:**
P1-17 ("ratcheting down"). This is the first paydown tranche: the first 25 baselined sites in file order, in 12 files,
all cold under the 24-hour rule (last touched 09-23 09:53 or 09-25 01:01).

## What was wrong

Twenty-three 500 handlers sent `error.message`, `String(err)` or `(error as Error).message` to the browser as `error`,
`details`, `detail` or `message` — for a node-postgres failure that is the relation or column name, the driver's SQLSTATE
text or the connection target. Each also `console.error`'d the same detail beside it, so the leak bought the operator
nothing. Two coded 503s in `server/routes/ana-features.ts` did the same: POST `/api/ana/authoring-plan` answered
`MIGRATION_PENDING` with the thrower's text, which is `authoring_plans table not migrated yet`
(`services/ana/authoring-plan-generator.ts`) or `therapeutic_area column not migrated yet`
(`services/ana/therapeutic-area-context.ts`) — a table and a column name, the exact class the gate exists for; POST
`/api/ana/submission-chat` echoed whatever carried `AI_PROVIDER_UNAVAILABLE`.

## What is true now

- The 23 sites answer through the one helper, `serverError(res, log, where, err)` (`server/lib/api-response.ts`): a
  static `{ error: 'INTERNAL_ERROR', message: 'Something went wrong while <where>. …', correlationId }` and the detail
  logged against `X-Request-Id` under a `createScopedLogger` scope. The paired `console.error` is gone at each site. The
  four `.js` routers take the import/scope lines from the seven already-migrated siblings
  (`server/api/cmc/manufacturing-tuner.js:27-31`, `.js`-suffixed relative imports). Every 4xx branch — the ZodError 400s,
  the `Organization context required` 401s, the 400/403/404 domain answers in ana-features — is untouched, and
  `module3ConvergenceRoutes.ts` still `ROLLBACK`s before answering.
- The two coded 503s keep status 503 and their code and say a static sentence (`The AI provider is unavailable.`;
  `This feature is not yet provisioned in this deployment.`); the caught message goes to the file's `logger`. They are not
  `serverError()` calls — that would turn a 503 into a 500 and drop the machine-readable code.
- `scripts/ci/server-error-leaks-baseline.json`: `totalSites` 145 → 120, `totalFiles` 89 → 77, twelve `counts` keys
  removed, no count increased (the write ran only after the gate printed `25 site(s) fixed since the baseline`, so no
  other lane's growth was baked in). The gate is green at the new totals.

| | File | Result |
|---|---|---|
| red | `red/gate-before.txt` | `OK — 145 baselined site(s) across 89 file(s)`, no "fixed" line: nothing had been paid down |
| red | `red/list-before.txt` | the 145 sites, the 25 of this tranche first in file order |
| red | `red/tests-before.txt` | the two new suites against the unchanged handlers: 5 failed / 8 passed — `build-state` and `uploaded-sources` answered `relation "cmc_source_objects" does not exist` in the 500 body; `authoring-plan` answered `authoring_plans table not migrated yet` and `therapeutic_area column not migrated yet` in the 503 body; `submission-chat` echoed the thrown provider text. The 4xx-unchanged cases passed before and after |
| green | `green/gate-fixed.txt` | after the edits, before the write: `OK — 120 … 25 site(s) fixed since the baseline — shrink it with --write-baseline` |
| green | `green/gate-after.txt` | after `--write-baseline`: `OK — 120 baselined site(s) across 77 file(s); no file gained one` |
| green | `green/list-after.txt` | the 120 remaining sites |
| green | `green/tests.txt` | 13 files / 147 tests passing: the two new suites, `api-response-500-containment`, the six cmc suites (`module3AutoDraftRoutes` pins the direct 400 and the 401), `routes-reach-the-bundle`, `unifiedTasks.routes`, `tenant-isolation-extraction-queue.contract`, `ana-gap-analysis`, `ana-apply-rewrite-signature`. `check:security-patterns` 0 violations across 2855 files |

Tests: `server/api/cmc/__tests__/module3BuildStateRoutes.test.ts` (new describe block on the existing pool/spine
harness: a 42P01 from the spine resolver yields 500 `INTERNAL_ERROR` with the correlation id and no relation name, for
both routes; the 401 is unchanged) and `tests/routes/ana-features-coded-503-containment.test.ts` (both throwers' texts
absent from the 503 body, present in the observed `ana-features` logger; the 400 and 404 domain answers unchanged).

ESLint per touched file, HEAD vs working tree: no file's warning count rose (`module3ConvergenceRoutes.ts` 2 → 1; the
other eleven unchanged; both test files 0/0).

## Client callers

A grep of `client/` and `shared/` for the 18 migrated route paths finds one first-party caller,
`client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx`: GET `/api/cmc/module3-os/build-state/:id` through
`useLiveData`, which never read the body (a non-2xx shows `HTTP <status> <path>`), and POST
`/api/cmc/module3-os/build-section/:id/:key` through `cmcWriteError` → `serverMessage`, which prefers `message` — so it
now shows the helper's sentence where before it showed the bare `error` only if `looksInternal` let it through. No
client keyed on a field the migration removed. (The scout's "no first-party caller" was wrong for these two paths; the
behaviour is unchanged or better, so no client edit was made.)

## Not done here

- **Hot (4 files, 7 sites), with window ends:** `server/routes/knowledge-base.ts:175,820,861` (merge `0bc045c7` without a
  session trailer, treated as hot until 2026-09-27 02:32 UTC); `server/routes/cortexQueryRoutes.ts:182` (until 02:49);
  `server/routes/cortex-unified.ts:1024` (until 04:43); `server/routes/study-design.ts:525,604` (until 05:39).
- **Cold, 113 sites in 73 files** — the next tranche in file order starts at `server/routes/ana-mdx-context.ts:94`,
  `ana-tool-policy.ts:47,118,150`, `assumption-decision-contradiction.ts:93`, `audit-trail-routes.ts:781`,
  `authoring-actions.ts:1018,1226`, `biosketch.ts:51`, `cerv2-document-routes.ts` ×3 (another lane holds uncommitted
  edits there now), `cerv2-export-routes.ts` ×5, …; the full list is `green/list-after.txt`.
- **Wiring `ci:server-error-leaks` into `.husky/pre-push`** (it runs only in `ci.yml`): the control tower's, not this
  worker's.
- `server/api/enterprise/routes.js` is mounted with no mount-level auth beyond the default-deny boundary — an IAM
  observation from the scout, outside P1-17.
