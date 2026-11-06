# AnA memory continuity: preserve exclusions and distinguish complete memories

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Starting snapshot: `36169f21f2ce6e9486c8f521bca307dd5ebf8943`  
Plan: F1; W1, launch row D2 repair evidence, not launch closure.  
Completes: `server/services/memory-consolidation-job.ts` and `server/services/memory-orchestrator.ts`.

## What already exists

- `server/services/working-memory.ts`: the existing seven-field conversation summary, including next actions, created artifacts and exclusions. Its formatter already carries all seven fields in working memory.
- `server/services/memory-consolidation-job.ts`: the existing scheduled promotion of working memory to project memory. It carries six fields but omits exclusions. Its acceptance decision, tenant scopes, embedding, duplicate marker and transaction handling are retained.
- `server/services/ana-ri/memory-acceptance.ts`: the existing full-content acceptance comparison and lexical contradiction check. It already distinguishes complete content and preserves pending review. No new acceptance system is needed.
- `server/services/memory-orchestrator.ts`: the existing recall ranking, age policy and deduplication. It compares only 120 leading content characters, allowing different conclusions to collapse.
- `server/services/memory-context-assembler.ts`: the existing caller of that orchestrator, which formats the selected records for AnA. Its retrieval scopes and deadlines remain unchanged.
- `package.json`: existing pre-push command definitions. The eCTD and risk-code checks already use `node --import tsx`; the one-product check still used the socket-opening CLI. Only its two launch commands are aligned to that existing loader after reproducing the runtime failure.
- `tests/services/ana/memory-consolidation-outcomes.test.cjs`, `server/services/__tests__/memory-consolidation.pglite.integration.test.ts`, and `server/services/__tests__/memory-orchestrator.test.ts`: existing behavioral and PostgreSQL-engine tests, extended in place.
- `.design/claude-convergence/COORDINATION.md`: inspected at the starting snapshot; none of the changed production paths is held by another listed session.

Searches covered the memory services, routes, tests and plan, including `exclusions`, `nextActions`, `createdArtifacts`, `dedupeContentKeyLength`, and the admission/recall callers. The repository has one root `AGENTS.md`. `git log --all --diff-filter=D` returned no deletion of the three primary memory paths in the available depth-40 history; this is not a complete repository-history audit. The existing retired memory-review routes are not recreated.

## Repair design

Carry the exclusions into the exact content sent to admission, embedding and storage. If exclusions are the only populated structured field, retain the existing raw-summary fallback alongside them. An exclusion supplies context, not evidence validation or additional confidence: the existing six-field scoring and review decision remain unchanged. No prior stored record is rewritten or automatically accepted.

Compare complete recall content using an unambiguous tuple so shared beginnings do not erase different conclusions. Keep the existing ranking and forgetting behavior and the higher-ranked survivor of genuine duplicates. No new screen, route, service, table, model or dependency is introduced.

The recall tuple contains layer, exact category, title and complete content. Title and content retain the existing case and surrounding-whitespace normalization. Categories remain distinct; no new category normalization is introduced. The old exported `dedupeContentKeyLength` property remains for compatibility, is documented as deprecated, and can no longer shorten identity comparisons.

## Verification

Executed with the repository's locked dependencies (`npm ci`), Node 22.23.4 and TypeScript 5.6.3:

| Suite | Before repair | After repair |
| --- | --- | --- |
| Consolidation behavioral suite, complete job with real acceptance gate in the continuity cases | 56 passed, 6 failed | 62 passed, none failed |
| Consolidation PGlite suite, actual SQL and acceptance gate | 11 passed, 2 failed | 13 passed, none failed |
| Recall orchestration and unscored ranking suites | 25 passed, 6 failed | 31 passed, none failed |
| Acceptance fidelity suite | Existing regression coverage | 57 passed, none failed |
| Memory integration suites (consolidation, deadlines, recall mode, selected-project boundary, working-memory project recall) | Not a separate baseline run | 48 passed across 5 files, including the 13 consolidation cases above |

The same regression tests failed before the fix and passed afterward. The two SQL failures reproduced both the lost exclusion and erroneous duplicate rejection. An additional intermediate implementation was shown failing when `[KNOWN]` inside an exclusion incorrectly raised an inferred-only summary's confidence; the final implementation takes quality labels from the original content/fallback only. `excluded-label-regression.tap` records that deliberate failing check, not the final result.

The logs are actual local executions, not remote CI results. The Node suites execute the complete production modules with controlled I/O. The PGlite suite executes PostgreSQL SQL in process; it mocks tenant-connection acquisition and the embedding provider. It is not a native multi-connection PostgreSQL/RLS or live-provider acceptance test.

The final combined runs on the repaired source passed **119 Node cases and 79 Vitest cases (198 distinct cases)**. The 79 Vitest cases comprise the 48 integration cases and 31 recall/ranking cases above; repeated runs are not counted again. `final-behavioral.tap` and `final-memory-tests.txt` record those final runs.

`npm run build` passed, including the client, server and audit-chain verifier bundles. Targeted ESLint reported zero errors and four warnings on already-large functions; the pushed-files warning ratchet remains the enforced no-growth check. `scripts/ai/verify-tests.sh` exited zero; its filename-only scan warns about `memory-consolidation-job.ts`, whose actual existing tests are named `memory-consolidation.pglite.integration.test.ts` and `memory-consolidation-outcomes.test.cjs`. Those suites were executed above. `scripts/ai/context-pack.sh` could not generate its optional context bundle because neither packager is installed; repository sources and instructions were inspected directly.

Independent read-only reviews of the memory changes and launcher correction found no blocker. The complete, unchanged pre-push hook subsequently passed on the committed implementation and launcher candidate: **15,379 source files checked exactly once, 33 workers, an unchanged input snapshot, zero TypeScript errors, and every pre-push gate passed**. The pushed-files lint warning count did not grow. `pre-push.txt` records the successful run; `publication.json` records its exact candidate, configuration, log hashes and publication identities.

## Publishing-runtime repair

The CLI push stopped before hooks because no GitHub write credential was available to local Git. The connected GitHub app has repository push permission. Before updating the branch through that app, the unchanged `.husky/pre-push` was run locally against the exact committed candidate and current remote parent. Both published commit trees were compared with their local candidates and matched exactly. The branch update used `force: false` and the expected previous head; a fresh read-back verified the published head and tree.

The first local hook run stopped at `ci:one-product`: the `npx tsx` CLI attempted to listen on `/tmp/tsx-1000/260.pipe`, which the workspace refuses with `EPERM`. Running the unchanged script with `node --import tsx` passed, as did its existing self-test that refuses an added surface, added rail entry and reasonless grant. `package.json` now uses that loader for `ci:one-product` and `ci:one-product:selftest`, matching `ci:ectd-stubs` and `ci:risk-codes`. The checker, its baseline, the plan, `.husky/pre-push`, dependencies and lockfile are unchanged. This is a launcher correction, not a disabled check. The full hook completed successfully before the branch update.

The first bounded typecheck attempt used 1,000 diagnostic targets per worker and a 6,144 MB heap. It exhausted the heap after checking 1,000 of 15,379 files and failed the hook; it is not counted as a pass. The successful rerun used the existing supported settings `TYPECHECK_FILES_PER_PROCESS=500` and `TYPECHECK_HEAP_MB=7168`. Every worker still loaded the complete identical program, all files were checked, and the final snapshot verification passed. No baseline, compiler configuration, gate, or scope was relaxed. `pre-push-memory-failure.txt` preserves the incomplete attempt, and `pre-push-launcher-failure.txt` preserves the earlier launcher failure.

The successful hook log is byte-identical to its captured output. The two failed-hook logs have only extra blank lines at EOF removed to satisfy the repository whitespace check; all preceding bytes are unchanged. `publication.json` records both original capture hashes and stored hashes for those two files.

## Published result

At **2026-11-06 04:10:07 UTC** (November 5 in America/Los_Angeles), a fresh GitHub branch read-back and local fetch both verified `concept2cure-v2` at `0a4d34219f21ae0efad2877874947bee01972915`, with complete tree `5beb7ae685f81f3038ede1d7bc7ea272e10e3348`. The previous remote head was `36169f21f2ce6e9486c8f521bca307dd5ebf8943`.

| Change | Locally validated candidate | Published commit |
| --- | --- | --- |
| Preserve exclusions and complete recall identity | `b0d0f10472aa93b924250237843c85765dca96f2` | [0b4c6366](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/0b4c636614a5ea8218b47a4c15b19c8b369ad955) |
| Repair the one-product gate launcher | `76f1cdfa8101d7e0eab35e1d954f3013572c159c` | [0a4d3421](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/0a4d34219f21ae0efad2877874947bee01972915) |

The local and published commit IDs differ because the connected app creates commit metadata. Their complete Git trees match: `0314f8e9c41077a6e60e256718eec38e5bc3e8c7` for the memory repair and `5beb7ae685f81f3038ede1d7bc7ea272e10e3348` for the launcher candidate. After fetching the published commits, the clean local branch was aligned by a compare-and-swap ref update only after verifying tree equality. No files were reset. This receipt is appended in a separate documentation commit.

Remote workflows for the exact published implementation head were observed at **2026-11-06 04:10:30 UTC**:

| Workflow | Observed status | Run |
| --- | --- | --- |
| CI | Queued | [42160851433](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851433) |
| Tier 5 Browser Smoke | Queued | [42160851437](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851437) |
| Cortex CSR Evidence | Queued | [42160851399](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851399) |
| Semgrep | Queued | [42160851287](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851287) |
| CodeQL | Queued | [42160851505](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851505) |
| Repo Health Baseline Refresh | Pending | [42160851368](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851368) |
| C2C Agent — Validate & Audit | Completed / skipped | [42160851522](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42160851522) |

These are observed remote states, not successful remote qualification. The successful local checks above do not establish hosted browser, live-provider, or deployed acceptance.

## Reproduction

```sh
node --test tests/services/ana/memory-consolidation-outcomes.test.cjs tests/services/ana/memory-acceptance-fidelity.test.cjs
npx vitest run server/services/__tests__/memory-consolidation.pglite.integration.test.ts server/services/__tests__/memory-context-assembler-deadline.test.ts server/services/__tests__/memory-context-assembler-mode.test.ts server/services/__tests__/memory-context-selected-project.test.ts server/services/__tests__/working-memory-project-recall.pglite.test.ts server/services/__tests__/memory-orchestrator.test.ts server/services/__tests__/memory-orchestrator-ranks-unscored-atoms-on-their-other-signals.test.ts
npm run build
TYPECHECK_FILES_PER_PROCESS=500 TYPECHECK_HEAP_MB=7168 node scripts/ci/typecheck-no-regression.mjs --incremental
```

Use the repository's Node 22 runtime and locked dependencies. The before-run used unchanged production files from the starting snapshot with the same new regression cases. `execution.json` records the implementation/test file identities and log hashes. The normal pre-push hook must run; no bypass is authorized by this receipt.

## Remaining limits

- No historical memory is rewritten or activated. An already consolidated record missing its exclusions still needs an explicitly reviewed recovery procedure.
- The existing assembler has a per-record and overall prompt budget. This repair prevents incorrect deduplication and loss during consolidation; it does not promise that every field of every stored record fits into every model prompt.
- Live AnA/provider/browser acceptance and a deployed release are separate from these local repairs. No production database, model key or live document was used.
