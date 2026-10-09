# AnA workflow read sharing — W3 / D4

Canonical branch: `concept2cure-v2`. Publication base: `bebd4253676f43d1c983ac769c660e0c0aacdd10`.
Owned scope: `server/services/ana-ri/context-enrichment.ts`, its existing
`context-enrichment-deadline.test.ts` and `workflow-status-tenancy.test.ts`,
and this evidence directory. No UI contribution.

## Delivered behavior

Common project context and the `/workflow`, `/preflight` and `/status` command
paths previously called `buildWorkflowContext` independently with identical
project, submission type and organization arguments within one enrichment call.
The mounted stream passes its detected submission type into this helper, so
the duplicate work is reachable. The workflow builder performs two tenant-scoped
artifact SELECTs; these commands previously admitted four workflow SELECTs.

One lazy raw workflow promise is now reused within each enrichment invocation.
The real-builder regression proves two workflow SELECTs instead of four for a
`/workflow` turn. All three command regressions prove one builder invocation.
Ordinary overlap with independent project context is retained. The result is
not stored across invocations, tenants, projects or future turns. No new cache,
TTL, dependency, subsystem, public signature, model, tool or integration.

Each consumer retains its existing deadline wrapper and reporting key. Common
and command prompt blocks, their ordering, source labels and message rewriting
are preserved, including the existing repeated workflow block. Failures and
timeouts still produce the availability notice, healthy empty results remain
distinct, and late completion cannot mutate the returned response. A later turn
reads again. Existing SQL, tenant predicates and governance decisions are
unchanged; an absent organization still admits no workflow artifact SELECT.

## Qualification

| Check | Actual result |
| --- | --- |
| Fail-first on original production | 10 failed / 22 passed, exit 1 |
| Focused suites after fix | 32 passed / 0 failed across two files, exit 0 |
| Broader backend qualification | 430 passed / 0 failed across 29 files, exit 0, 51.44 seconds |
| Forced ESLint | Production zero errors and same six warnings; both test files zero errors/warnings |
| Production build | Exit 0, 17.956 seconds |
| Full current pre-push hook | Exit 0 and completion banner; TypeScript zero errors (tsc exit 0), 55.548 seconds |

Eleven new regressions cover the three command paths, independent-read overlap,
rejection, synchronous throw, deadline and late completion, healthy empty data,
fresh reads across tenant/project/repeated invocations, real workflow SELECT
counts and absence of reads without tenant context. Twenty-one prior focused
tests remain green. The broader run also retains direct-answer, context memory,
program-project identity, tenant scope, launch refusal, Live Drive, Stop,
disconnect, hold, approval and turn-record coverage, including existing PGlite
contracts. Tests use scripted database/provider seams; no external provider or
database was contacted. This is focused qualification, not all repository tests,
a live production latency benchmark, or an atomic database transaction snapshot.
Existing build notices remain.

An independent scoped read-only audit and implementation review found no
material blocker; the reviewer ran no verification processes. Native TypeScript
cache preparation used the unchanged whole-project config and actual semantic
diagnostics, ending with zero unchecked entries and zero cached diagnostic-error
files in 2 bounded processes. Preparation is not qualification. The full
unchanged hook passed at `7fa8a73108983405d2c562cf4ab34a2788e1ef4f` against `bebd4253676f43d1c983ac769c660e0c0aacdd10`. No lint suppression,
baseline, compiler option or repository gate was weakened.

## Publication boundaries

`source-files.json` pins all three qualified source files. `ui-scope.json`
records identical client hashes against the publication base. Final evidence
changes are documentation only. Publication uses a non-force expected-SHA
GitHub update and verifies each blob and the complete resulting Git tree.
The published commit and its actual CI state are reported separately. Source
publication is not production deployment; queued CI is not green CI.

Text transcripts trim trailing whitespace only. Lint JSON omits duplicate
source echoes while retaining diagnostics, counts and the omitted-source hash.
