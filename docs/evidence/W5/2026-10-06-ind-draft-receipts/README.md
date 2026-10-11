# Generated and saved IND draft receipts

Launch workstream W5, supporting D2/D7. Enhances the existing batch drafting,
submission-context guidance, and governed authoring tool. No new model, module,
provider, dependency, schema, or write path was added.

## Behavior

* Batch generation returns every requested slot in its original order, including
  invalid slots. Previously, invalid requests disappeared and null slots could
  throw before the handler's error boundary.
* Drafting context now prefers the open program UUID over the legacy project ID,
  matching the governed save tool's project resolution.
* Each slot reports its original `requestIndex`, generated content or actionable
  failure, `saved: false`, and `authoringDocId: null`. The batch reports
  `savedCount: 0`, its actual requested/success/failure counts, and `retryIndices`.
* Successful content survives partial failures in the returned result. Empty
  generated text is a failed slot. A whole-batch exception returns failure
  receipts without relaying the thrown provider detail.
* The existing `draft_authoring_document` tool returns `saved: true`,
  `documentStatus: draft`, and its existing durable document ID after the
  authoring transaction succeeds. Its legacy `status: generated` is retained
  for the existing artifact/canvas stream contract.
* IND/NDA/BLA guidance and tool descriptions explicitly distinguish generated
  text, saved drafts, approval, and filing. They direct requested deliverables
  through the existing governed save tool, retain saved IDs, and retry failed
  sections rather than regenerate successful work or recreate saved documents.

## Evidence and limits

Four receipt regressions failed before implementation: no explicit unsaved
receipt, invalid input silently dropped, no per-slot retry receipt, and a null
slot throwing. The final focused run passed **121 tests in seven files**, covering
batch slots, SQL-backed saved documents/provenance, submission-context guidance,
qualification/confirmation gates, blueprint-grounded drafting, stream source
records, and the existing saved-document conversation canvas. Production build
passed. Changed-file ESLint and the warning ratchet passed without added warnings.

The SQL-backed test verifies the returned ID against the real authoring table,
its draft state, program ownership, and provenance. Neither batch generation nor
this receipt change automatically saves or approves content. Existing human
confirmation and model qualification gates remain in force.

This improves the generation-to-save contract; it is not atomic batch promotion,
a durable checkpoint for unsaved batch text, or server-side idempotency for save
retries. A missing/unknown save receipt requires checking the existing document
before re-creation. No live provider or production sponsor run was performed.
Canonical review projection, deletion UI/API enforcement, and live qualification
remain unfinished. Publication is a repository update, not deployment.

Full TypeScript validation remains with existing GitHub CI because the preceding
session reproduced the local compiler exceeding the 8 GB workspace limit. No
configuration or gate was weakened. The earlier readiness/identity commit
`a5703dc64a71ef1668f230bbb5588c66aa4c9ea7` has now passed CI's full and beta-slice
TypeScript checks and its Lint job:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37525851167
Those results do not validate these subsequent code changes; check their own CI.
