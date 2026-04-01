# Dependency Consolidation Report

Date: 2026-03-31
Scope: Runtime/developer dependency audit for Concept2Cure-v2 hardening pass.

## Summary

- Dependencies reviewed with repo-grounded import checks (`rg`) and package manifest diffing.
- High-confidence action in this pass: moved type-only packages out of runtime deps.
- Runtime dependency count reduced from **161 → 157**.

## High-confidence changes applied

| Dependency | Why it exists | Import evidence | Runtime critical | Overlap | Action |
|---|---|---|---|---|---|
| `@types/compression` | Type support for compression middleware | TS typing only | No | N/A | **REMOVE (runtime) / KEEP (dev)** |
| `@types/cookie-parser` | Type support for cookie parsing middleware | TS typing only | No | N/A | **REMOVE (runtime) / KEEP (dev)** |
| `@types/jsdom` | Type support in tests/tooling | TS typing only | No | N/A | **REMOVE (runtime) / KEEP (dev)** |
| `@types/multer` | Type support for upload middleware | TS typing only | No | N/A | **REMOVE (runtime) / KEEP (dev)** |

## Overlap analysis (deferred decisions)

| Area | Packages observed | Current conclusion | Action |
|---|---|---|---|
| Prisma vs Drizzle | `@prisma/client`, `drizzle-orm`, `drizzle-kit` | Both appear present in active code paths/migrations; removal needs a migration strategy and schema ownership decision. | **DEFER** |
| AI SDK overlap | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `langchain`, `@langchain/*` | Multi-model strategy appears intentional; should be reduced only after provider contract consolidation. | **DEFER** |
| Export/document libs | `docx`, `pdfkit`, `pdf-lib`, `pptxgenjs`, `xml2js`, `xmlbuilder2` | Multiple content formats are actively supported; removal requires endpoint-level usage confirmation. | **DEFER** |
| Collaboration/editor stack | `@tiptap/*`, `yjs`, `@hocuspocus/*`, `y-prosemirror` | Stack appears cohesive; no high-confidence deletion without collaborative feature map validation. | **DEFER** |
| File/storage helpers | `multer`, `archiver`, AWS S3 SDKs | Appears actively used; no safe no-risk deletion identified in this pass. | **KEEP** |
| Validation/util layers | `zod`, `drizzle-zod`, `ajv` | Coexistence likely due mixed runtime/schema-validation requirements. | **DEFER** |

## Notes

- This report intentionally prioritizes no-regression removals only.
- Additional removals should be staged behind route-level smoke checks and ownership sign-off.
