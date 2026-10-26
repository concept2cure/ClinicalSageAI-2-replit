# Deferred finding: section codes do not establish document expertise

This is a separate read-only finding, outside the insertion-remedy increment.
No test, provider call or production change was performed for this finding.

## What already exists

- `server/routes/ana-ri/stream.ts:1702` and `server/services/ana-ri/chat-context-builder.ts:511` read the open section code from authoring/request context and call `buildSectionSpecificPrompt(code)` without a document/template/filing discriminator.
- `server/services/lumen-context/sections.ts:424` is that existing pure prompt builder. It resolves the CTD overlay, fixed CTD/deliverable playbooks and bare-module fallbacks. Its `3` fallback supplies Quality/CMC, ICH M4Q and Phase 1 IND language. It accepts a code only.
- `shared/regulatory/protocol-m11.ts` already records protocol section `3` as trial objectives and associated estimands. Existing editor template references can therefore correctly identify an M11 protocol while the code-only chat supplement interprets the same code as Module 3 CMC.
- `server/services/ana/AnaDocumentDraftingService.ts` already has exact `resolveDraftingRequirements(submissionType, sectionType)` and `resolveSystemPrompt(submissionType)` behavior. `server/services/ana/__tests__/drafting-regional-context.test.ts` specifically proves `ICH_PROTOCOL` / `3` uses the M11 objective/estimand headings, and preserves unconfirmed regional scope for harmonized documents.
- `server/services/authoring/authoring-template-guidance.ts` already validates saved per-section assembly/template receipts and reads recorded guidance after current access admission. `saved-template-review.ts`, `authoring-read.ts` and the existing project-scope admission provide the saved-record/reference boundaries. Client screen facts are context, not independent receiving-market authority.
- The insertion design's Rule 3 inventory records root's historical authoring/remedy/section-context searches. This audit issued no Git commands under its assigned no-Git constraint. No alternate contextual section resolver was found in current editor/chat callers; the exact typed drafting resolver above is already reusable.

## Reproducible path to qualify next

Open a working M11 protocol at saved section `3` (trial objectives and
associated estimands), then ask AnA a section question or request a draft/fix.
Both chat doors append the code-only CTD supplement. The recorded protocol
template can travel separately, but does not prevent injection of incompatible
CMC/IND guidance. The observable defect is the incompatible prompt content;
this audit makes no claim about a live model's resulting answer.

The same collision applies to other non-CTD templates whose local sections are
numbered `1` through `5`. The harmonized protocol example is particularly
bounded because the existing exact resolver and test already supply its right
record.

## Smallest canonical follow-up

Complete the existing chat-context bridge to choose section guidance from the
currently admitted saved section's verified template/reference identity, using
the existing exact requirements resolver. Preserve per-section assembly scope
when it differs from the parent. Unknown or contradictory identity must remain
unassessed; do not infer CTD/US IND from a local number, project home filing or
stored title. A harmonized document still does not establish a receiving
agency. Update both existing chat doors through one shared resolver/admission
path, retaining current scope, paging, tracked-edit and model gates.

The separately observed direct `/sections/:sectionId/ai/draft` prompt also does
not load saved template guidance or declared product/modality context; it uses
module/code/title/product_code and optional request context/requirements. That
is a second potential completion, requiring its own bounded prompt evidence
and contract. It is not part of the insertion change or the already completed
retained regional-input/source-window changes.

## Bounded immediate guard using the existing prefetch

Further scoped review found `ana-ri/open-document.ts` already resolves saved
template identity before a surface-stated type. Its existing
`openDocumentFields` returns `openDocumentRegistryId`, and both canonical chat
prefetches already carry it. That is sufficient for a smaller first correction:
pass the explicit canonical open-document scope to the existing code-only
section prompt builder, allowing its legacy CTD/IND supplement only for exact
`US_IND`. Null, unread, unknown, harmonized/component, device and other regional
types must not receive a guessed CTD/US-IND supplement. Keep their existing open
document brief and original-record limits.

The third production call is `lumen-context-builder.ts:1163`, reached by
`routes/cortex-unified.ts:324` through `buildContextAwarePrompt`. That convenience
caller has a declared submission type and section code, but no verified open
document type. Supply an explicit unresolved scope there rather than infer the
current document from the project's home filing. One-argument compatibility may
remain for direct legacy helper consumers if required; all three production
callers need an explicit scope. This correction can reuse the existing helper
and prefetch without new I/O, taxonomy, provider, specialist tool or store.

Positive exact-US-IND coverage and negative M11 `3`, device, global/component,
Canadian, Japanese, missing and unread scope cases should precede that separate
change. `ana-ri/__tests__/open-document-turn.test.ts` already covers saved-record
precedence, registry resolution and unread state; the existing regional drafting
tests cover correct M11 scope. Root owns the corrective contract and meaningful
RED/GREEN for this follow-up.
