# Native model-call collector and record proof

## What already exists

The shared `server/services/ana/turn-record-loop.ts` collector retains raw tool
calls and its writer files the canonical record. The existing `TurnRecorder`,
`addServed`, `servedModelsOf`, qualified `servedBy`, chained audit writer and
PGlite migrations already support model-call provenance. The collector does not
retain model responses; the writer ignores the planned optional `servedCalls`.
This suite reaches those existing exports without importing the executor.

## Frozen baseline result

The 18 cases produce **13 intended semantic failures and five passing controls**,
with zero skips/todo, on Node 22. All failures concern absent retained call
metadata/author qualification or the obsolete limitation warning. The callback
is invoked optionally against a structural expected shape, so missing methods
and exports do not manufacture red evidence. Included ESLint reports zero
errors and warnings before the run. All 26 selected initial baseline hashes
match before and after. `freeze.json` pins the exact test hash and case names.

The red cases cover detached primitive metadata, exclusion of response content,
usage and arguments, exact string normalization, first-call round zero,
chronology, repeated-model distinct requests, unknown authors, canonical author
qualification, and earlier calls retained on late failed/stopped turns without
inventing a served call from error metadata. Existing display-model/answer/raw
result behavior and tenant/actor facts are checked alongside the new facts.
The passing controls cover raw tool collection, omitted/empty observation lists
with the exact legacy warning, first-call failure and an unbound turn.

## Boundaries

`loopToolCollector`, `recordLoopTurn`, TurnRecorder, PGlite SQL, the canonical
chained audit writer, stored-record/hash verification, `servedModelsOf` and
`qualifyServedModels` are real. Gateway responses are deterministic callback
fixtures; independent writer cases supply a readonly observation list. The
normal Vitest setup's global PostgreSQL mock does not service the explicit
PGlite pool used here. This proves stored bytes and their audit hash linkage,
not live PostgreSQL/RLS, HMAC sealing or a complete tenant-chain walk.

No gateway/executor, SDK/provider dispatch, full input trace, new approval,
deployment or agency acceptance is claimed. Tool-step rounds and later inputs
remain unavailable. Current approved/unapproved fixtures come dynamically from
the existing approval registry; no policy or frozen input is changed.

`red-command.json` holds exact argv/environment and test hash; `red.txt` is the
raw combined transcript, `red-results.json` the full report, and `red-exit.json`
the actual process exit and transcript hash. Included lint and before/after
baseline pins are retained separately. Root owns subsequent changes and green
qualification; the worker does not edit this test after final submission.
