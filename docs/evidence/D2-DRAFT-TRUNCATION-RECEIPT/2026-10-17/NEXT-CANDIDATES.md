# Separately scoped findings

These are audit candidates, not delivered features or closed launch rows. The October 14 data-room strategy/competition research remains in `docs/reports/data-room-research-2026-10-14/`; this bounded D2 delivery does not establish competitor uniqueness or expand the filing launch catalog.

## Cancellation propagation

Read-only revalidation on baseline `accf8c6bacfdc2d89b5de9098e22a67fe3f27914` confirms that `ToolContext` already has an abort signal, but the `batch_draft_sections` handler does not pass it into draft requests; the drafting request/gateway construction and wave loop do not propagate it. The parent can stop waiting while background source reads and drafting work continue. A separate increment should propagate the existing trusted signal, stop scheduling after cancellation, suppress late output and preserve already completed siblings with explicit cancelled outcomes. It should reuse existing gateway cancellation/semaphore behavior, not introduce a second execution system or treat cancelled slots as automatic retries. No cancellation change is included here.

## Retrieval and extraction policy

The Unicode coordinate error found against the earlier checkout was already fixed upstream and revalidated before this implementation; the adjacent D2-DRAFT-WINDOW-COORDINATES record explains that disposition. Japanese segmentation and passage-neighbor expansion/absolute source anchors need independent contracts and current-code reproduction before implementation. Neither word-boundary policy nor extraction/table geometry is qualified by this receipt patch.

## Generic batch UI termination forwarding

The generic HTTP batch service retains finish metadata and its accept route checks supplied truncation. Independent review found a separate gap in `client/src/concept2cure/v2/surfaces/BatchDraft.tsx`: response-to-card mapping and the accept POST do not retain/forward those fields. This AnA receipt patch does not fix or qualify that separate consumer. A follow-up should reproduce the actual UI-to-accept sequence and preserve termination metadata through its existing handoff.

## Completeness and save authority

An unknown/absent finish reason does not prove complete generation. This receipt fix rejects known or explicitly flagged cutoffs and preserves termination metadata. A stronger finish-qualified authoring handoff would need an independently designed trusted receipt/write boundary, replay/current-source behavior and compatibility proof. Current model-visible guidance is not such an authority token. No scientific correctness, approved content, agency submission or live-provider qualification is claimed.
