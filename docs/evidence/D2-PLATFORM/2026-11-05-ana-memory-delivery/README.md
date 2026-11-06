# Complete AnA's existing memory delivery

Repository: `concept2cure/ClinicalSageAI-2-replit`

Branch and starting snapshot: `concept2cure-v2`, `2cec182a17105da5863bab2fdb66ba1adef317e2`

Scope: W1 / launch row D2, `Plan: F1`. Repair evidence, not launch closure.

Status: local behavioral tests and build passed. Complete pre-push validation and GitHub publication remain pending; their exact identities and outcomes will be recorded in a separate publication receipt.

## What already exists

- `server/services/working-memory.ts` requests and settles seven summary fields. Its public `formatWorkingMemoryForPrompt` renders all seven, but thread writeback's private formatter renders only objective, facts, decisions and questions. That shorter string is stored, embedded, recalled and supplied to later summaries; the structured row separately retains the other fields.
- `server/services/ana/memory-fact-check.ts` already settles all list fields against checked answers and separates unsupported items into `withheld`. Formatting must remain after this check and must never render withheld content as settled memory.
- `server/services/memory-consolidation-job.ts` now retains exclusions in project-memory content, and `memory-orchestrator.ts` now distinguishes complete records. Those completed repairs are the preceding receipt. Ranking, forgetting, admission and pending-review policy need no change here.
- Complete thread writeback exposes one consolidation fallback interaction: when exclusions are the only structured field, the raw summary now contains those exclusions too. Quality-label scanning must mask their exact structured text in a copy of the fallback, using whitespace to avoid synthesizing a label by joining neighbors. The raw admission/storage/embedding content and genuine legacy summary labels outside exclusions remain intact; no acceptance rule or review policy is relaxed.
- `server/services/memory-context-assembler.ts` already performs scoped, deadline-bounded recall. It cuts each semantic record to 400 characters and then cuts the entire block to its total budget. This can remove a qualification or exclusion and even the closing delimiter. Its `read` list checks only an item's opening, so a partial or colliding opening is treated as a read.
- `server/services/ana/turn-context-used.ts` already turns that read list into the existing context-used event. When retrieval succeeds but all records are withheld by the prompt budget, its current empty list becomes `none` and the client says nothing matched.
- `server/routes/chat/send-message.ts` also creates a model-facing context snapshot. Its memory counts use all ranked candidates, including records the assembler did not admit. These counts must use the same admitted `read` list so the snapshot does not contradict the complete block or its omission notice. Its existing `send-message-read-only.test.ts` exercises the real handler and inspects the gateway's prompt; extend that suite.
- `server/services/ana-session-bootstrap-format.ts` is the existing pure first-turn formatter. It separately cuts working summaries to 1,200 characters, semantic records to 240, and outcome lessons to 220. These are free-text memories whose qualifications may be at the end.
- `server/services/ana-session-bootstrap.ts` loads the first-turn records with current project/actor access and deadlines, and appends a retrieval-degradation notice. The formatter's Vault and chat-file previews have their own existing scope/provenance notices; they are not evidence that whole source documents were read.
- The existing `recall_session_context` tool returns the same bootstrap block as JSON. Both loop hosts then use `server/services/ana/agentic-loop.ts`'s existing per-result/round budgeting. That generic head/tail cap can cut a complete memory after JSON escaping or round sharing, including a limiting condition in the middle. The automatic first-turn system messages are not cut by those callers or the gateway. Extend the existing budget boundary so this named recall result is delivered unchanged or explicitly withheld; retain the existing private-read receipts, passage priorities, total/per-result limits and generic tool behavior.
- `tests/unit/memory-context-assembler.test.ts`, the server's assembler deadline/mode/project tests, `ana/__tests__/turn-plan-and-context.test.ts`, `working-memory-fact-check.test.ts`, `working-memory.test.ts`, `working-memory-project-recall.pglite.test.ts`, and `ana-session-bootstrap.test.ts` already exercise these paths. Extend those tests rather than introduce another memory system.

Discovery searched the formatter names, `nextActions`, `createdArtifacts`, `exclusions`, `trimContent`, `memoryBlock`, `read`, `maxChars`, and existing context-budget implementations across services, routes, client and shared contracts. The root rules, one-design plan and current coordination file were read; none of these production files is held by another listed session. Deleted-path searches returned no deletion of the selected production paths in the available shallow history; this is not a complete repository-history audit.

## Repair contract

1. Use the existing seven-field formatting logic for both public prompt formatting and settled thread writeback. Preserve the public interface, honest empty thread summaries, and the fact-check boundary. No reader SQL change, historical reconstruction, automatic activation or backfill.
2. Assemble complete memory records within the existing per-turn total character limit. Account for headings, source labels, separators, retrieval notices, omission notice and closing delimiter before admission. Remove arbitrary cuts through a record. Keep current layer order and ranking; omit a record that cannot fit and consider later records. Never keep only an affirmative opening while dropping its limiting condition.
3. Preserve retrieval-unavailable notices ahead of recalled content. If the character budget omits records, include a concise notice that history is incomplete, set `diagnostics.trimmed`, and derive `read` directly from admitted records. When every candidate is omitted, use the existing `unavailable` context-used state instead of claiming no memory matched. The JSON chat's model-facing snapshot must count admitted records too; diagnostic candidate counts remain available separately.
4. Apply the same complete-record rule to first-turn working memory, semantic memory and outcome lessons. Bound their combined rendered contribution to 4,500 characters, including their headings and omission notice. This replaces the separate prefix cuts; it is close to the old default 4,460-character content allowance before titles/headings (1,200 + 9 × 240 + 5 × 220). Preserve working/project/client/lesson ordering and existing ranking/count limits. Leave Vault/chat-file preview and access/provenance behavior intact.
5. Keep model qualification, verification, tenant/project scope, active-only recall, deadlines, retrieval modes, similarity policy and pending review unchanged. Add no service, screen, route, model, table, dependency or permission bypass.
6. At explicit tool-result handoff, if the existing generic budget would alter a `recall_session_context` result, replace its entire body with the existing honest withheld-result envelope. Do not pass a partial memory or broken JSON, reinterpret another tool's payload as protected recall, increase budgets, or change private-read receipt allocation. Keep the strict final total-body check.

## Ownership and verification plan

Root owns the assembler and context-used production change, evidence, combined validation and Git publication. One worker owns settled working-memory formatting, its existing tests, and the reproduced consolidation quality-scan interaction. One owns first-turn formatting and the JSON chat snapshot calculations with their existing tests. A separate worker writes the assembler/context-used regressions before root changes production behavior, independently reviews the formatting changes, and repairs the final explicit-recall tool-result boundary in the existing loop module and tests. No overlapping edits or worker commits.

First reproduce the missing fields, lost tail qualifications, broken block closure and inaccurate read/empty states against the existing implementation. Then run the meaningful focused suites, including existing deadline, selected-project, fact-check, PGlite recall, context-used and bootstrap regressions. Check build and the complete unchanged pre-push hook before publication. The workspace requires Node 22 and the repository's supported bounded full-program typecheck settings; a memory-limited incomplete run is a failure, not a pass.

## Executed local verification

The relevant production module was unchanged when each red run was captured. The same behavioral assertions passed after its repair; subsequent boundary/control cases are identified separately. These are local executions, not hosted CI or deployed acceptance.

| Path | Before production repair | After repair |
| --- | --- | --- |
| Settled working summary, public formatter, embedding seam and PGlite read-back | 24 passed, 4 failed | 28 passed |
| Assembler, deadlines and context-used event | 44 passed, 26 failed | 70 passed |
| First-turn bootstrap formatter | 25 passed, 10 failed | 35 passed |
| Exclusions-only raw-fallback quality scan, using the real acceptance gate | 65 passed, 6 failed | 71 passed |
| Real JSON chat handler's memory snapshot | 7 passed, 4 failed | 11 passed |
| Explicit recall tool-result handoff | 20 passed, 6 failed in the rounds suite | 99 passed across six budget/read-integrity suites |

Two additional assembler cases establish full admission at exactly 1,000 rendered characters and whole omission at 1,001 in both project and client modes. The focused assembler unit suite then passed 27 cases. Bootstrap tests likewise cover its exact 4,500-character boundary, notice reservation, complete labels, later smaller records, empty input, ordinary short output and unchanged file previews. Explicit recall tests cover the exact 8,000/8,001 serialized-character boundary, JSON escaping, crowded rounds, preserved call IDs/order and an ordinary payload that merely claims the recall tool name.

The final combined runs on the completed implementation passed **128 Node cases and 323 Vitest cases across 22 files: 451 distinct cases, with no failures**. The focused results above overlap those combined results and are not added to that total. `final-behavioral.tap`, `final-vitest.txt` and `execution.json` retain the actual outputs and source/test identities. The combined selection covers the changed paths plus existing fact-check, selected-project, recall-mode, deadline, consolidation, ranking, bootstrap-latency, read-receipt and strict round-budget behavior.

`npm run build` passed the client, server and audit-chain verifier bundles. `scripts/ai/verify-tests.sh` exited zero. Its filename-only scan warns about `send-message.ts`, `ana-session-bootstrap-format.ts`, `turn-context-used.ts` and `memory-consolidation-job.ts`; their actual companion suites have longer established names and were executed above. That scan is not counted as test execution.

Independent read-only review found no blocker in the four memory formatting/context-used changes or in the explicit-recall handoff boundary. Caller inspection verified that automatic first-turn blocks are concatenated whole through JSON/stream chat and gateway message transformation; model context-window admission refuses an oversized request rather than cutting those messages. Both explicit-tool hosts retain their existing receipt guard/settlement and final total-body assertion after the new recall guard.

The captured logs are preserved except for documented whitespace normalization needed by `git diff --check`. Extra blank lines at EOF are removed; the failed consolidation TAP's diagnostic diff lines also have trailing whitespace removed. `execution.json` records original/stored SHA-256 hashes and the exact whitespace changes, so the original captures can be reconstructed. No test result, diagnostic text, baseline, gate or compiler configuration is changed.

## Reproduction

Use the locked dependencies and Node 22 runtime. The two final Node suites are:

```sh
node --test tests/services/ana/memory-consolidation-outcomes.test.cjs tests/services/ana/memory-acceptance-fidelity.test.cjs
```

`execution.json` lists all 22 final Vitest files. Run them with `node --import tsx ./node_modules/vitest/vitest.mjs run <files>`, then `npm run build` and `bash scripts/ai/verify-tests.sh`. The complete normal pre-push hook must pass on the committed candidate. This workspace uses the existing supported settings `TYPECHECK_FILES_PER_PROCESS=500 TYPECHECK_HEAP_MB=7168`: each sequential worker loads the entire program, only diagnostic targets are partitioned, every source is checked, and the final input snapshot must remain unchanged. No bypass is authorized by this evidence.

## Material limits

Complete records that do not fit are explicitly omitted; the context budget is not a promise that all stored history fits every prompt. Historical summaries that already lost fields are not silently reconstructed from older structured data. The repair does not qualify live providers, a deployment, or native multi-connection RLS. Source-file previews remain previews and keep their existing read-full-source directions.

The fallback quality guard recognizes the exact structured exclusion text rendered by the existing formatter. It does not attempt semantic recognition of paraphrases. The PGlite cases execute PostgreSQL SQL in process with controlled tenant-connection and embedding seams; they do not establish native multi-connection tenant isolation or live embedding-provider behavior.
