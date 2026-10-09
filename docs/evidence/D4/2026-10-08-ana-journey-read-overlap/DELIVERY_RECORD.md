# AnA client-journey read overlap — W3 / D4

Canonical branch: `concept2cure-v2`. Publication base: `561a11a7cddfbed16614c448a9b96dc1bb658aba`.
Owned scope: `server/services/ana/client-journey.ts`, its existing
`client-journey.test.ts`, and this evidence directory. No UI contribution.

## Delivered behavior

The existing in-scope `get_client_journey` tool calls `getClientJourney` with a
pool. Its projects, governed-artifact counts, submitted/transmitted audit count
and organization-age reads previously waited in sequence despite having no
data dependency. Four independent reads now start in their original order and
join before stage resolution. A pooled caller can overlap their existing waits.
The regression with four scripted 750 ms reads completes after one 750 ms wait;
the original implementation does not. This is a scripted timing experiment,
not a live database or production latency measurement.

Every read keeps its original try/catch, SQL text, tenant argument, row mapping
and fallback. Synchronous throws and rejections remain contained per source,
so one failure does not discard healthy results. The stage resolver, precedence,
readiness override, segment, output and prompt formatters are unchanged. Reads
write disjoint invocation-local fields and are joined before use. Later calls
read again; there is no shared cache, TTL, dependency, public signature or new
capability. `sql-scope.json` verifies four byte-identical SQL literals.

Existing pool instrumentation acquires a separate tenant-scoped client for each
statement, with local tenant settings and release. No connection, transaction
or governance behavior was changed. A supplied PoolClient may serialize on its
single connection; this change creates no extra connection for that case and
does not claim parallel execution on one client. The fixed admission is four
existing reads, never an unbounded fan-out.

The mounted greeting fallback also calls this helper only with a project
reference, no matched requested enrichment, and empty common project/workflow
context. It is not called for every projectless greeting. Tool definition,
registration, launch scope and execution wrapper remain unchanged.

## Qualification

| Check | Actual result |
| --- | --- |
| Final fail-first on original production | 2 failed / 30 passed, exit 1; candidate restored in finally |
| Focused suite | 32 passed / 0 failed, exit 0 |
| Broader backend qualification | 462 passed / 0 failed across 30 files, exit 0, 51.101 seconds |
| Forced ESLint | Production zero errors, one retained warning (two before); test zero errors/warnings |
| Production build | Exit 0, 16.702 seconds |
| Full current pre-push hook | Exit 0 and completion banner; TypeScript zero errors (tsc exit 0), 55.822 seconds |

Eleven new tests cover all-four pre-settlement admission, out-of-order completion,
the scripted slowest-read wait, segment/readiness preservation, each partial
failure, all synchronous throws or rejections, empty rows/negative-age clamp,
concurrent tenant isolation and fresh subsequent reads. Twenty-one original
pure stage, prompt and registered-tool tests remain green. Deferred reads and
timers are settled in finally. The broader run retains workflow sharing,
direct-answer, project memory/identity, tenant and launch scope, Live Drive,
Stop/disconnect/hold/approval and turn-record coverage, including existing PGlite
contracts. It uses scripted database/provider seams; no external provider or
database was contacted. It is focused qualification, not all repository tests
or a production deployment/benchmark. Existing build notices remain.

An independent scoped audit and final implementation review found no material
blocker. The reviewer made no edits and ran no verification processes. Native
TypeScript cache preparation used the unchanged whole-project config and actual
semantic diagnostics, ending with zero unchecked entries and zero cached
error files in 2 bounded processes. Preparation is not qualification.
The full unchanged hook passed at `4d46685d14e20a5443946052b6e9e7e0684222ef` against `561a11a7cddfbed16614c448a9b96dc1bb658aba`. No lint
suppression, baseline, compiler option or repository gate was weakened.

`canonical-sync.json` records the preserved repository-health report refresh:
only two generated report files changed, leaving all typed source and UI bytes
unchanged. Test/build qualification remains valid; the full hook used the new
base. `source-files.json` pins the two final qualified source blobs.

## Publication boundaries

`ui-scope.json` records identical client hashes against the publication base.
Final evidence changes are documentation only. Publication uses a non-force
expected-SHA GitHub update and verifies each uploaded blob and the complete
resulting tree. The published commit and its actual CI state are reported
separately. Source publication is not production deployment; queued CI is not
green CI.

Text transcripts trim trailing whitespace only. Lint JSON omits duplicate
source echoes while retaining diagnostics, counts and the omitted-source hash.
