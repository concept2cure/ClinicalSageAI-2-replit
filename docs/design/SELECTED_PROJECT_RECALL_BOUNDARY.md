# Selected-project recall boundary

Approved bounded WO-02 implementation on 2026-10-16, based on
`990a687c6eb31adb1becfa58d91fc9d2932f23ed` plus the preserved, separately
qualified Authoring access work. No provider, model, approval, permission,
production schema or native database change belongs to this increment.

## Scope and behavior

The live stream already admits the program/project and passes its integer
project ID to semantic recall and bootstrap. Its prefix already resolves UUIDs
through `integerProjectForRef`; that resolution is retained. An explicit project
reference that cannot resolve must not acquire organization-wide recall.

Five source files are owned here:

- `server/services/lumen-context/intelligence-prefix.ts`: a supplied project
  reference suppresses client intelligence. Only resolved project intelligence
  and project-specific wisdom may enter that prefix. Keep current resolution,
  cache identity, budgets and unavailable reporting.
- `server/services/ana-wisdom-engine.ts`: an additive project-only read option
  omits client patterns and platform recommendations before their reads. Existing
  callers retain their current behavior when the option is absent.
- `server/services/memory-context-assembler.ts`: a selected integer project skips
  client semantic retrieval and passes its exact project selector to working
  memory, while retaining project recall, diagnostics and budgets.
- `server/services/ana-session-bootstrap.ts`: a selected project skips client
  atoms and binds working-memory recall to that project. Keep the current actor,
  project/catalog admission, file recall and project outcome lessons.
- `server/services/working-memory.ts`: thread recall, semantic fallback, refresh
  and previous-summary writeback bind the same organization/thread/project.

Canonical user/organization policy, role, preference and relational overlays are
unchanged. Organization callers retain their existing recall behavior. An explicit
portfolio question can use authorized tools; this change does not infer project
ownership from names, titles, categories or semantic text.

## Additive working-memory API

`getLatestWorkingMemoryByThread(threadId, organizationId, { projectId? })` adds
an optional third selector. `searchWorkingMemorySemantic` adds `projectId` to its
existing options. `needsWorkingMemoryRefreshByThread` adds the same trailing
selector. Omitting the selector preserves existing organization/thread behavior.
A supplied selector must be a positive safe integer; invalid explicit selectors
return no recall rather than dropping the constraint. Selected SQL binds exact
`project_id` before ordering/limiting, excluding NULL and other projects.

`WorkingMemory` and semantic hit rows retain their stored `projectId` where read;
the table already has the additive 20260820 project column and its writer already
records it. No historical row is reattributed. A missing project column or failed
selected query supplies no summary and never retries an unscoped read.

`summarizeAndStoreWorkingMemoryForThread` passes its project ID to both refresh
and previous-summary recall, so project A's older summary cannot enter project B's
writeback prompt. Existing no-project callers retain their old behavior. The
summary gateway is stubbed in tests; no real provider is called for qualification.

## Proof and limits

Retain a meaningful RED before production edits. Real PGlite SQL cases cover the
same thread and organization with A, B and NULL rows, newest-row conflicts,
exact-project empty recall and foreign organizations. Also cover exact semantic
bindings/fallback, project-only prefix and cache behavior, fresh bootstrap,
writeback refusal of another project's prior summary, and no-project compatibility.
Semantic vector binding controls are not native pgvector qualification.

Use one Node 22 Vitest process at a time with heap 4096. Keep red/green logs,
commands and new source pins under
`docs/evidence/D2-WORKFLOW-CONTINUATION/2026-10-16/grounding-recall/`.
The preceding Authoring access packet remains qualified only for its own frozen
source snapshot; new pins describe this recall increment.

This increment does not remove or rebind stored conversations. Raw same-thread
history, unbound/browser transcript facts, organization-wide proactive deadlines
and contradictions, and the missing live screen-facts consumer remain named
residuals. It does not prove live-source citation, generated answer correctness,
selected-project end-to-end acceptance or complete demo readiness. No rewrite of
historical summaries, audit rows or synthetic seeds is authorized here.
