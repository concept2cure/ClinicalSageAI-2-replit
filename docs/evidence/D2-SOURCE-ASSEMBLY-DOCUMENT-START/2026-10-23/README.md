# Complete selected-source document starts

W1 / D2, canonical `concept2cure-v2`, local/Codespaces only.

## What already exists

`SourceAssemblyDialog.tsx` and `useSourceAssemblyTarget.ts` already hand explicit
selected sources to a chosen current working document. At discovery, their New document remedy
dropped source intent and required returning after creation.
`AuthoringCreateExport.tsx` owns the canonical C2CForm/template picker and invokes
`useAuthoringCreation.ts`/`authoringCreationRecovery.ts` for pinned actor requests,
confirmed receipts and unknown-outcome guards. `newDocumentAction.ts` opens only
a mounted host and intentionally retains no pre-mount request.

`editorTarget.ts`, `assemblySourceIntent.ts`, `DocumentWorkbench.tsx` and
`workbenchLeaveTarget.ts` already receive exact document/project intent through
context and dirty-work guards. `authoringDraftTransport.ts`, `shellProject.ts`,
`ceremony.ts`, `C2CForm.tsx` and `useDialog.ts` own the current context and modal
behavior. Later source preview/build owns version/excerpt verification; this
completion must not create another writer, form, picker, store or review engine.


The unchanged backend owners are `server/routes/authoring.router.ts` (current
project/tenant reads and `POST /docs`), `server/services/authoring/authoring-documents.ts`
(the shared transactional creator), and `db/migrations/20260725_authoring_document_loop_tables.sql`
(the existing authoring document/section/template schema). They do not retain a
client chooser’s source intent and require no new schema for this completion.
`shared/authoring/assembly-sources.ts`, `server/routes/authoring-assembly.ts` and
`server/services/authoring/authoring-assembly-sources.ts` own bounded selectors,
explicit assembly and exact current source checks. `server/services/authoring/authoring-draft-tool.ts`
and `server/services/ana/document-catalog-tools.ts` expose existing AnA authoring/
source preparation and reads; they do not authorize automatic acceptance or
submission. These paths are reused unchanged, with no new AnA tool.

The [design](../../../design/SOURCE_ASSEMBLY_DOCUMENT_START_2026-10-23.md)
records code/schema/AnA/deleted-history discovery, UI references, the completion
contract and constraints before implementation. Discovery starts from clean,
synced canonical `56a076306c6dbbaa8455526d56db825cbddaa1f6`.

## Completed behavior

The existing chooser’s New document action passes a distinct privately owned
source-start command to the existing editor. The canonical creation host opens
the same C2CForm and template picker once. Selected template/module/project and
actor headers keep the existing payload. Ordinary creation remains independent.
The optional source context is captured per attempt and retained through known,
pending and identified/unknown recovery outcomes. Source retirement stops source
adoption and new source-linked POSTs without turning known creation into unknown.

Opening the form preserves the actual selected working document and dirty
canvas bookkeeping. After a confirmed creation, original source intent crosses a
post-close staged effect through the existing exact-ID inventory/access and
unsaved-work gates. The inventory’s first row cannot choose the new document or
replace a dirty buffer before a real leave decision. Pinned/filtered hosts keep
the existing external-document handoff. No second editor, creator, modal, writer,
backend endpoint, schema, dependency or eligibility rule was introduced.

Opening does not create. Creating saves only the selected working document and
its template sections. Preview/build/source-excerpt verification, AnA generation,
draft acceptance, approval and filing remain explicit existing actions. Sources
are selection intent, not verified citations or submission readiness.

## Evidence and review

- `channel/README.md`: private command, bounded selectors, sender/receiver
  ownership, TTL admission, tamper/withdrawal/current-account/project guards.
  Meaningful initial RED: 10 failed / 2 passed. Qualified GREEN: 77 / 3 suites;
  strict five-owned-file lint: zero warnings. Later root qualification includes
  the final channel bytes.
- `creation/README.md`: canonical form and per-attempt source ownership,
  unknown/identified recovery, ordinary isolation and actual same-session bearer
  refresh. Meaningful initial RED: 9 failed / 2 passed. Qualified GREEN: 176 / 9
  suites; strict four-owned-file lint: zero warnings. Its first broader run had
  two pre-existing unscoped test-fixture URL mismatches; the correction asserts
  the actual current project query and preserves separate recovery reads.
- `integration-feature-red.json`: qualified actual chooser → real editor → real
  creator harness; two failures reached the missing canonical creation form.
  Earlier `integration-red` / `integration-qualified-red` captures include
  ambiguous fixture queries and are not counted as clean feature RED.
- `integration-first.json`: two form-open passes and three template-option-count
  fixture failures. Corrected to require the exact template UUID. Subsequent
  `integration-second` / `third` / `fourth` retain actual post-create failures
  while the exact-ID refresh and original-owner post-close continuation were
  corrected. `integration-third-debug.log.gz` is a diagnostic run, not final
  qualification. `integration-fifth.json`: five composed cases passed.
- `integration-guards-red.json`: one meaningful dirty-bookkeeping failure / 13
  passes; opening then cancelling creation incorrectly marked the old canvas
  clean. `integration-guards-green.json`: all 16 then-selected cases passed.
- `dirty-creation-red.json`: the later peer review case reproduced replacement
  of a dirty default-selected canvas during a decoy-first refresh; one failed /
  16 skipped. Its exact test source is retained as a gzip matching the historical
  freeze. Pinning the actual current document corrected it. The final 17-case
  actual-flow suite covers this guard, exact UUID/template/headers/checksums,
  cancellation/Escape/focus, absent-record refusal, filtered delivery, source/
  project/session/unmount retirement, refresh and explicit identified recovery.
- `pre-extraction-qualified-ui.json`: 447 / 20 suites passed on the retained
  pre-extraction freeze. An intermediate warning ratchet caught two extra
  warnings; the existing document-navigation code was extracted without behavior
  change and the aggregate test description split. No baseline was increased.
  Final `qualified-*` receipts supersede that draft qualification.

Root and scoped AI reviewers inspected the composed flow. Peer review found the
dirty cancellation/reorder defects before publication and re-reviewed the fixes.
`peer-review.json` records the final no-blocker verdict and UI reuse boundaries.
This is an automated review, not human acceptance.

`source-freeze.json` names declared qualification inputs. These are the existing
editor/surface source files, selected suites, configuration and CI scripts; it
is not a complete transitive dependency graph. Each root receipt records exact
argv, UTC time, exit, Node version, before/after SHA-256s, drift and the SHA-256 of
its deterministic raw gzip. Historical receipts refer to historical freezes;
repeated and overlapping cohorts must not be summed as distinct coverage.
`qualification-commands.json` lists bounded UI and backend selections.

## Canonical and human-testing scope

Discovery began at clean/synced `56a07630`. `canonical-catchup.json` records the
normal fast-forward to `b3e5746f` after 43 incoming canonical commits. No owned
production file overlapped. Read-only review of incoming Unicode read-window,
reporting/current-access and recorded release-identity changes found no source-
start integration blocker. Bounded backend regressions include those seams.
Normal direct publication and exact Git-object verification are recorded after
qualification. No new branch, PR, force or hook bypass is permitted.

The existing Codespaces handoff now has **83 cases, all Not run**, including new
source-start cases 76–83. jsdom tests use synthetic HTTP/auth responses and actual
client owners; the selected server suites declare their synthetic/PGlite seams.
No human session, native production-like installation, live provider/model,
agency transmission or deployment is qualified by this increment. Universal
sector/regional completeness and GLP/GCP/GMP source-outline review remain open.
Known/unknown creation recovery remains mounted-component scoped; this change
adds no durable backend idempotency across reload or another tab.

## Qualification epochs

Before the saved-section re-filing merge, the editor-owned bytes passed **447 tests / 20 client suites** and **283 tests /
15 backend suites**, strict lint of the eleven other changed TypeScript files,
and the changed-file warning ratchet (existing Workbench warnings do not grow).
At that epoch the compiler reported **zero errors against the unchanged zero baseline**, the
build passed, and all **18** repository gates passed on the 598-input freeze.

During qualification, eight more canonical commits landed. The normal fast-
forward in `vault-freshness-catchup.json` changed no previously pinned input.
The only incoming production source was `advancedRAGPipeline.ts`; read-only review
found its current-passage fences compatible with editor/AnA source ownership.
`publication-source-freeze.json` extends the unchanged inputs with that source
and the eight changed suites: **84 tests / 8 suites** pass. The publication
warning ratchet also passes; publication compiler/build and affected gateway,
SQL-inspection and repository-size gates are captured separately on that 607-
input freeze. Those selections counted 814 tests in 43 distinct files before the later merge; worker and earlier
repeated cohorts are not added again. Final Git-object verification identifies
which exact source bytes reached the canonical remote.


A later normal canonical merge (`saved-refiling-merge.json`) integrates the
concurrently completed unchanged saved-section re-filing action. Implementation
commit `58e10011` was recorded with normal hooks before this merge. The incoming
change touched the Workbench toolbar/metadata and the authoring PATCH dispatch;
its new governed act is explicit and remains unavailable to unbound, dirty or
unverified records. It does not change document creation or automatically file
source-start documents. Shared lineage/filing helpers retain their owning gates.
Read-only review found no compatibility blocker, and the merge preserved both
sets of code without conflict. Previously declared Workbench/router pins changed
explicitly; `merged-source-freeze.json` records the new 623-input epoch. Earlier
qualification stays historical and is not silently relabelled as testing this
merge. `merged-*` receipts and the updated final qualification identify the
actual combined code and replayed tests/checks used for direct publication.


On the merged 623-input epoch, **503 tests / 23 client suites** and **465 tests /
20 backend suites** pass with no declared source drift. These include the new
re-file UI/access/save cases and shared unchanged-refiling/workflow/lineage/
filing-lock/node-status contracts. `merged-vault-freshness`, `merged-typecheck`,
`merged-build`, `merged-warning-full` and the eighteen `merged-gate-*` receipts
complete the final combined qualification before publication. The final
qualification file lists their actual results; earlier cohorts remain preserved.


Final combined qualification passes **1,052 tests / 51 distinct suites**, zero
TypeScript errors, the full warning ratchet, build and all eighteen repository
gates on the 623-input merged freeze. No baseline or dependency changed. All
source-start production/test bytes and incoming filing repairs are represented
in the final Git-object verification. The human handoff remains 83 Not run cases.


The first normal push passed every hook, including zero-error compiler, lint and
size gates, then Git refused the update because canonical advanced. Its actual
exit/raw output remain in `implementation-push.*`. `project-intake-merge.json`
records the normal merge of explicit workspace intake; only the prior Projects
surface pin changed, with seven source-start production paths unchanged.
`retry-source-freeze.json` records 649 inputs. The six-suite integration replay
passed 109 tests, the two additional intake guards passed 40 tests, and the build
passed. The repeated 17-case source-flow test is not added again as new coverage.
Normal pre-push checks qualify the complete current compiler before publication.
