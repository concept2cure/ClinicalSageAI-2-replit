# AnA catalog native-record scope — 2026-11-13

## What already exists

- `server/services/ana/document-catalog-data-room.ts` implements the existing
  `list_project_documents(catalog:true)` receipt. It reads the same actor-filtered
  catalog and deterministic grades as the Data room, but drops native-record
  scope, identity and lifecycle when shaping its items and calls every capture a
  file. Its existing test is `server/services/ana/__tests__/document-catalog-data-room.test.ts`.
- `server/services/clinical-regulatory-evidence/record-source.ts` records exact
  native Quality snapshots with `provenance.origin=native_record_snapshot` and
  a `recordSnapshot` containing work area, source scope, native kind/id and
  lifecycle. `source-read-access.ts` owns current source admission and rechecks.
- `server/routes/c2c/projects.ts` already exposes those admitted facts as
  `catalog.nativeRecord={workArea,sourceScope,kind,id,lifecycle,version}`.
  `client/src/concept2cure/v2/editor/SourceCatalogLine.tsx` labels an organization
  source as **Organization context**, beside native lifecycle/version. Neither
  helper is an exported decoder suitable for a catalog-tool import.
- The organization-wide supplier, internal-audit and management-review reads in
  `server/services/qms/project-evidence-queries.ts` are intentional context, not
  evidence of cross-tenant access. Their inclusion and source filters are outside
  this repair.
- `GIT_NO_LAZY_FETCH=1 git log --all --diff-filter=D` on the exact catalog,
  retained-context and SourceCatalogLine owner paths found no deleted alternate
  implementation. Current catalog history includes `069516d07`, `a5043b4c4` and
  `4bf73b1a8`; UI/native-record wording was repaired in `275b7e328`.

## Completion contract

Finish the existing F1 catalog receipt, without a new tool, reader or service:

1. Return nullable `nativeRecord` in the existing UI shape, only for an admitted
   native-origin receipt with the supported Quality work area, recorded project
   or organization scope, nonempty native kind/id and lifecycle, and a recorded
   string-or-null version. Invalid or absent fields remain null; no scope is
   inferred from capture placement or `metadata` flags.
2. Describe the mixed catalog as source captures, distinguishing native records
   from uploaded files. Explain that organization context does not establish
   project-specific evidence. A native lifecycle describes that record; capture
   placement and grade do not establish scientific or regulatory approval of a
   project deliverable. Preserve recorded supplier/Quality approval status.
3. Preserve actor admission, project placement, uploaded-file facts, grades,
   pagination, current/used state and governed filing behavior. Demonstrate the
   scope-loss regression before editing runtime code, then run the existing
   focused test file and changed-file lint.

Scope authorized by the lead: the catalog receipt, its existing test and this
evidence folder only. S2's catalog row holds no files; Quality's separate
`project-evidence.ts` performance hold remains untouched. No Git mutation,
provider call, full compiler or build belongs to this worker.

## Held-owner handoff: selected native context

This receipt repair does not resolve a separate selected-context limit.
`retained-source-context.ts` truncates native text at 16,000 UTF-16 units. The
Quality reader sorts JSON keys, placing a sufficiently long `data` value before
`sourceScope`, native identity, lifecycle and qualification. Those facts can fall
outside the excerpt, and `RetainedSourceContext` supplies no separate native
metadata. `server/routes/ana-ri/stream.ts` tells AnA that the recorded scope governs
interpretation, but can therefore supply an excerpt without that scope. Hand
this to the existing S2/S4 retained-context/runtime owners with an explicit
shared-stream handoff; keep their source admission, digest and dispatch guards.
The held Quality reader, selected-context reader and stream are unchanged here.

## Verification

The contract and regression tests were written before changing runtime code.
On the prior serializer, the focused file failed **17 of 27** cases: the mixed
receipt lost native classification, malformed/unverified classification lacked
an explicit null, and the receipt called every capture a file. The other ten
existing cases passed.

On the final source, **61 of 61 tests pass across five existing files**, with no
skips (8.93 seconds, Node v22.23.5):

| Existing test file | Passed |
| --- | ---: |
| `document-catalog-data-room.test.ts` | 27 |
| `document-catalog-tools-project-scope.test.ts` | 16 |
| `document-catalog-program-binding.test.ts` | 7 |
| `catalog-scope-platform-role.test.ts` | 5 |
| `document-catalog-safe-errors.test.ts` | 6 |

The mixed fixture proves an actual recorded supplier lifecycle of `approved`
remains reportable, while placement and grade establish no project-deliverable
approval. Organization and project native records retain their different scope;
conflicting metadata never overrides the admitted receipt. Malformed scope,
schema, renderer, work area, identity, lifecycle or version supplies no invented
native classification. Existing upload fields, deterministic grade, used state,
Vault dataset facts, actor/project refusal and governed filing cases remain green.

Changed-file ESLint exits **0, zero errors and zero warnings**. `git diff --check`
also passes. An independent read-only source review found no material blocker.
Commands, bounded summaries and final source/log digests are recorded in
[`verification.json`](verification.json) and [`checks.txt`](checks.txt). Whole
compiler/build/push verification remains the integrating lead's responsibility.
No provider calls, live-model answer, PQ qualification or hosted-Codespace
acceptance were performed or claimed by this worker.
