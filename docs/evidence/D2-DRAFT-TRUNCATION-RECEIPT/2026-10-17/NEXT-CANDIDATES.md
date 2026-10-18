# Separately scoped findings

These are audit candidates, not delivered features or closed launch rows. The October 14 data-room strategy/competition research remains in `docs/reports/data-room-research-2026-10-14/`; this bounded D2 delivery does not establish competitor uniqueness or expand the filing launch catalog.

The [October 18 remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md) revalidates these candidates against `e62320e0a`, acknowledges delivered selected-source assembly and dataset intake, and separates code defects, design needs, qualification and product expansion.

## Editor candidate termination

Source review at `e62320e0a` found that the actual Authoring generate-draft route parses nonempty gateway content and parks a server-owned candidate without reading the finish reason (`authoring.router.ts:3943`, `:3978`, `:4060`). Current source manifests establish selected-input identity and current use, not completed output. A separate fail-first candidate/accept contract should reuse the canonical classifier and preserve honest failure/turn records. This is separate from the delivered generic BatchDraft handoff. The reachable quick-completion API also drops termination metadata; no current client caller was found. These are source findings, not executed end-to-end qualification.

## Cancellation propagation

Read-only revalidation on baseline `accf8c6bacfdc2d89b5de9098e22a67fe3f27914` confirms that `ToolContext` already has an abort signal, but the `batch_draft_sections` handler does not pass it into draft requests; the drafting request/gateway construction and wave loop do not propagate it. The parent can stop waiting while background source reads and drafting work continue. A separate increment should propagate the existing trusted signal, stop scheduling after cancellation, suppress late output and preserve already completed siblings with explicit cancelled outcomes. It should reuse existing gateway cancellation/semaphore behavior, not introduce a second execution system or treat cancelled slots as automatic retries. No cancellation change is included here.

## Retrieval and extraction policy

The Unicode coordinate error found against the earlier checkout was already fixed upstream and revalidated before this implementation; the adjacent D2-DRAFT-WINDOW-COORDINATES record explains that disposition. Japanese segmentation and passage-neighbor expansion/absolute source anchors need independent contracts and current-code reproduction before implementation. Neither word-boundary policy nor extraction/table geometry is qualified by this receipt patch.

## Generic batch UI termination forwarding

Status 2026-10-18: the normal UI handoff is now delivered in `e42a5e59b19a9874f32f4cc08d388533d909f6c3`; see [qualification](../../D2-BATCH-DRAFT-TERMINATION-HANDOFF/2026-10-17/README.md). Cards retain reported termination, known cutoffs cannot be accepted, and viable acceptance forwards the existing snake_case fields. The historical finding below motivated that increment. Trusted generation attestation and unknown/manual policy remain separate.

The generic HTTP batch service retains finish metadata and its accept route checks supplied truncation. Independent review found a separate gap in `client/src/concept2cure/v2/surfaces/BatchDraft.tsx`: response-to-card mapping and the accept POST do not retain/forward those fields. This AnA receipt patch does not fix or qualify that separate consumer. A follow-up should reproduce the actual UI-to-accept sequence and preserve termination metadata through its existing handoff.

## Completeness and save authority

An unknown/absent finish reason does not prove complete generation. This receipt fix rejects known or explicitly flagged cutoffs and preserves termination metadata. A stronger finish-qualified authoring handoff would need an independently designed trusted receipt/write boundary, replay/current-source behavior and compatibility proof. Current model-visible guidance is not such an authority token. No scientific correctness, approved content, agency submission or live-provider qualification is claimed.
