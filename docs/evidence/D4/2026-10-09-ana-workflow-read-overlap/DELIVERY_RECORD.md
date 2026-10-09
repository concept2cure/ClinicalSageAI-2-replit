# AnA workflow-status read overlap — W3 / D4

Canonical branch: `concept2cure-v2`. Publication base:
`21ed7516fb312bcb7c7b9a3a4ba1c5ec80609f0f`.
Owned production scope: `server/services/ana-ri/workflow-orchestration.ts`.
Regression scope: its existing `__tests__/workflow-status-tenancy.test.ts`.
No UI contribution.

## Delivered behavior

The existing workflow-status reader gathers artifact types and populated CTD
sections for a tenant/project. Those two reads do not depend on each other's
results. They now start in their original order and join before the existing
workflow calculation, allowing their pooled waits to overlap.

Each read retains its original try/catch, SQL, tenant/project arguments and row
mapping. Either source can fail without discarding the other's evidence.
The valid-organization guard and unknown-workflow early return are unchanged.
Workflow definitions, evidence-based completion, tracked/untracked progress,
next-step selection, blockers and prompt formatting are unchanged.

The mounted stream reaches this reader through `enrichContextForChat` and
`buildWorkflowContext`, including common project context and `/workflow`,
`/status` and `/preflight`. The existing invocation-local workflow promise
still shares a single read pair across common and requested context.
Later turns read again. There is no cross-turn cache, TTL, new dependency,
model, tool, integration, signature or capability.

Existing pool instrumentation captures tenant context per query and acquires
separate scoped clients. Query count stays at two per workflow read. Pool
capacity determines actual overlap. This change is neither a production
latency benchmark nor a transactionally consistent database snapshot.
The existing enrichment deadline and existing fail-soft handling remain.

## Qualification

| Check | Actual result |
| --- | --- |
| Fail-first on original production | Six selected admission/timing regressions failed, exit 1; candidate restored in `finally` |
| Final focused suite | 28 passed / 0 failed, exit 0 |
| Output preservation | Exact full status and prompt across eight workflow types, empty/mixed evidence: 16 cases |
| Final broader backend qualification | 499 passed / 0 failed across 31 files, exit 0, 53.520 seconds |
| Forced ESLint | Both edited files: zero errors and zero warnings |
| Final production build | Exit 0, 18.664 seconds |
| Full unchanged pre-push hook | Exit 0, completion banner, TypeScript zero errors (tsc exit 0), 58.249 seconds |

The scripted two-read timing test completes after the slowest existing wait
(750 ms with 125/750 ms delays), rather than their sum (875 ms). This is an
overlap regression, not a live database or production latency measurement.
Tests also cover reverse completion, exact SQL/arguments, individual and total
synchronous/asynchronous failures, empty data, fresh tenant/project calls,
invalid/absent organizations and unknown workflow types. Deferred results and
timers are settled in `finally`. Existing workflow-promise sharing remains
qualified by the real-builder `/workflow` regression and enrichment tests.

The broader run retains journey overlap, context deadlines/memory, project
identity, tenant/launch scope, Live Drive, Stop/disconnect/hold/approval,
turn-record coverage and submission-sequence truth, including existing PGlite
contracts. It uses local/scripted database and provider seams, not external
provider calls or a live production database. This is focused qualification,
not every repository test or a deployment. Existing build notices remain.

An independent scoped audit and final source review found no material blocker.
Reviewers made no edits and ran no verification processes. Two added size-rule
warnings were resolved by query-call formatting and test grouping, without
suppression or baseline changes; the final production transpilation equals
the original candidate that produced the eight-workflow comparison outputs.
Final qualified source hashes are pinned separately.

Native TypeScript cache preparation used the unchanged whole-project config
and actual semantic diagnostics, finishing with zero unchecked entries and
zero cached diagnostic-error files in two bounded processes. Preparation is
not qualification. The unchanged full hook then passed at source checkpoint
`2b4dab596b659adbfd7942262fbdbae148883796` against the publication base above.
No compiler option, lint suppression, baseline or repository gate was weakened.

## Publication boundaries

The final source blobs and unchanged client tree are pinned in this directory.
Publication uses an expected-SHA, non-force update of `concept2cure-v2` and
verifies the complete resulting tree. Source publication is separate from
production deployment. Remote CI status is reported separately.
