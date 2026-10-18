# Quality engineering — recovered results (basis `92ccdba1`)

The quality-engineering lane ran the vitest suite in five shards and was then
terminated by an API usage limit before it reached typecheck, lint, the
production build, jest and Playwright. The numbers below are read from the
JSON reports the shards wrote; nothing here is estimated.

## Results

| Check | Command | Outcome | Duration |
|---|---|---|---|
| vitest, launch-catalog subset (602 files) | `vitest run --config vitest.config.ts --maxWorkers=2 <launch files>` | **6,695 tests: 6,693 pass, 0 fail, 2 skipped** | 653 s |
| vitest, remainder, shard 1/4 | `… --shard=1/4 <rest files>` | 6,536 tests: 6,528 pass, **8 fail** (2 files) | 488 s |
| vitest, remainder, shard 2/4 | `… --shard=2/4` | 6,725 tests: 6,671 pass, **3 fail** (1 file), 51 skipped | 489 s |
| vitest, remainder, shard 3/4 | `… --shard=3/4` | 7,838 tests: 7,821 pass, **1 fail** (1 file), 16 skipped | 629 s |
| vitest, remainder, shard 4/4 | `… --shard=4/4` | 7,107 tests: 7,037 pass, **6 fail** (3 files), 12 skipped | 427 s |
| **Total** | | **34,901 tests: 34,750 pass, 18 fail in 7 files, 81 skipped** | ~45 min on 2 workers |
| typecheck, lint, build, jest, Playwright | — | **not run by this evaluation** (lane terminated). CI at `94b4f9238`: typecheck green; the authenticated browser smoke red | — |

## The 18 failures

| File | Tests | Failure | Class |
|---|---|---|---|
| `server/services/__tests__/conversation-os.test.ts` | 3 | `[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on` | environment: the suite runs outside a tenant scope when `RLS_ENFORCE=on` is set locally; passes only where CI leaves it unset |
| `tests/services/document-consequence.test.ts` | 4 | same `FAIL-CLOSED` error | environment, as above |
| `server/services/__tests__/CrossReferenceMapping.no-fabricated-content.test.ts` | 6 | `Failed query: select "id", "organization_id", "mapping_code", …` | test database schema does not match the Drizzle model |
| `server/services/ana-ri/__tests__/artifact-status-approval-version.pglite.test.ts` | 2 | assertion on refusal copy | test and copy drifted |
| `tests/routes/export-governance-fail-closed.test.ts` | 1 | source-text assertion: "ectd-export route source contains explicit governance gate" | source-text test out of date with the route |
| `tests/artifact-change-invalidates-bundles.contract.test.ts` | 1 | `BACKSTOP_ONLY lists files that no longer write those columns` | stale baseline |
| `tests/golden-journeys/haq-correction.journey.test.ts` | 1 | `expected 'clinical' to be 'regulatory'` | behaviour change or test drift; needs triage |

The same suite also behaves differently by environment: seven failures
depend on `RLS_ENFORCE`, which is exactly the "local and CI disagree" class a
validated release cannot have.

## Inventory signals

| Signal | Value |
|---|---|
| vitest test files | 2,983 (276 PGlite-backed, 79 `*.dbtest.ts` under `vitest.db.config.ts`) |
| jest test files | 7 |
| `.only` / `.todo` / `xit` / `test.fixme` | 0 / 0 / 0 / 0 |
| `.skip` | 3 in 3 files |
| `.skipIf` | 38 in 19 files |
| Launch-catalog tests with no assertion-like token | 1 of 6,122 parsed (`vaultDocumentHistory.test.tsx:66`) |
| Launch-catalog source files no test imports | **52**: `server/services/submission-gateways` 13, `server/services/ectd` 12, `server/mcp` 11, `server/services/authoring` 5, `server/services/vault` 4, `server/services/qms` 3, `server/services/part11` 2, `server/services/projects` 2 |
| Config warning | `test.poolOptions` was removed in Vitest 4 — the config still sets it, so the pool settings it intends are ignored |

## What this means

The unit suite is large, fast for its size, and the launch-catalog subset is
green. It is not the problem. The problems are that the suite's verdict depends
on the environment it runs in, that nothing makes a red test block a push
(see MR-02), and that the 52 untested launch files sit exactly where
submission transmission, eCTD assembly and the MCP connector live.
