# Medical-writing review: heading evidence, not scientific completion

Date: 2026-10-07. Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`.
Branch: `concept2cure-v2`. Existing AnA review and writing-gate paths only.

## Defect and bounded change

The existing review considered any salient heading keyword anywhere in the
draft sufficient for a section, then returned `Structure complete`. A single
paragraph mentioning abstract, introduction, methods, results, discussion,
limitations, conclusions, declarations and references falsely satisfied every
manuscript section. Partial titles such as `Methods planned` also passed.

The review now reuses `extractHeadingOutline` from `document-search-core.ts`
and the existing `medical-writing.ts` document standards (including the
canonical ICH E3-derived CSR outline). Whole heading labels, not isolated
keywords, are compared. Narrow format adaptation supports Markdown, numbered,
HTML heading elements and exact standalone indexed plain headings. Fenced
examples and hidden HTML are excluded. Actual detected and matched headings
are returned as evidence. Separately held section titles already available in
`critiqueDocument` are forwarded through the existing writing precision gate.

All outcomes explicitly preserve `evidenceReviewed: false`,
`scientificCompleteness: not_assessed` and `approvalStatus: not_assessed`.
Requirements and pitfalls remain human/evidence-review items. Even a complete
heading-only skeleton is not certified as scientifically complete, compliant,
approved or filing-ready. Missing-heading output distinguishes undetected
titles from proof of missing substantive content. Unknown types do not acquire
an invented outline; empty drafts remain structurally unchecked.

At most three conditional client clarification prompts reuse fresh copies of
the existing document-preparation questions. Source prompts ask for versions,
locations, contradictions and applicable study/SAP records; clinical-result
prompts include population denominators, endpoint units/timepoints and
uncertainty. Relevant medicinal CMC mentions select the existing quality prompt
with batch/material, method and stability-condition/timepoint evidence. Device
and IVD inquiries use the indexed writing requirements, not a medicinal-product
preparation plan. Instructions require reading project sources and prior
answers first, asking only unresolved material questions and keeping questions
outside formal prose. These prompts never verify an answer or source.

The preparation tool's market/product scope, question priorities, discussion
markers and unassessed readiness contract are unchanged. Only the existing
review tool description was updated; no new tool, model, dependency, surface,
source-read operation, approval or persistence path was introduced.

## RED receipts

1. Before review implementation:

   `npx vitest run server/services/ana/__tests__/medical-writing-review.test.ts --config vitest.config.ts --reporter=dot`

   **12 failed / 14 passed (26)**. The paragraph fixture returned no missing
   sections; partial headings falsely satisfied Methods/Results; honest state,
   inquiry and separately supplied heading assertions failed.

2. Before forwarding existing authoring titles into the hardened review:

   `npx vitest run server/services/ana/__tests__/writing-gate-structure-status.test.ts --config vitest.config.ts --reporter=dot`

   **1 failed / 17 passed (18)**. A document with all nine indexed manuscript
   titles held separately from its bodies falsely reported all nine missing.

## GREEN receipts

Run with `NODE_OPTIONS=--max-old-space-size=4096`:

```sh
npx vitest run \
  server/services/ana/__tests__/medical-writing-review.test.ts \
  server/services/ana/__tests__/medical-writing-review-tool.test.ts \
  server/services/ana/__tests__/medical-writing.test.ts \
  server/services/ana/__tests__/medical-writing-qc.test.ts \
  server/services/ana/__tests__/writing-precision-gate.test.ts \
  server/services/ana/__tests__/writing-gate-structure-status.test.ts \
  server/services/ana/__tests__/writing-gate-regulatory-register.test.ts \
  server/services/ana/__tests__/in-text-references.test.ts \
  server/services/ana/__tests__/document-search-core.test.ts \
  server/services/market-specs/__tests__/document-preparation.test.ts \
  --config vitest.config.ts --reporter=dot
```

**10 files passed / 355 tests passed.** This includes all 13 indexed document
outlines, prose/partial-title rejection, four heading formats, heading-only
limits, no draft/unknown type, supplied authoring titles, fenced examples,
headings beyond the extractor's default forty, relevant evidence questions,
device/IVD scope, registered tool output and existing writing/gate/reference/
preparation controls.

Scoped ESLint: **0 errors / 0 warnings** for the changed review, gate and
preparation services and their focused tests, using `--max-warnings=0`.
`evidence-literature-tool-defs.ts` retains its existing `max-lines` warning:
the HEAD baseline is 1 warning (1,731 lines); the changed file has 1 warning
(1,733 lines). With only that existing size rule disabled for this single file,
all other lint rules pass with `--max-warnings=0`. No lint suppression or
baseline change was added. `git diff --check` passes.

## Limits and remaining evidence

These are deterministic unit and existing-tool-delivery checks. The shared
Vitest setup mocks PostgreSQL; startup log text is not a live database receipt.
No source content, scientific qualification, live model/provider, staging
workflow, expert approval, export/package validation or regulator acceptance
was exercised or established. Full shared typecheck/release gates and
publication belong to the control tower, not this worker receipt.

Heading matching is an English-language heuristic against indexed labels,
allowing case, numbering, punctuation and descriptive parentheticals. Alternate
client-template titles, split compound headings, other languages and unsupported
document types need explicit template/applicability review; an undetected label
is not evidence that its substantive content is absent. A matched heading is
never evidence that its body is populated, scientifically supported or approved.
