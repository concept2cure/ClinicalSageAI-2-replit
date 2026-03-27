# AnA Document Product Quality Stack — Repository Truth Pass

Date: 2026-03-27
Branch baseline observed: `concept2cure-v2` lineage (working branch currently checked out locally).

## Runtime and stack truth
- Primary runtime is Node.js 20+ with npm 10+, TypeScript, Vite, and Express.
- Existing scripts confirm canonical checks:
  - `npm run typecheck`
  - `npm test`
  - `npm run test:ana`
- Regulated export surfaces already exist and must remain compatible:
  - `server/services/documentExportService.ts`
  - `server/services/export/governedExportConsequence.ts`
  - `server/routes/510k-estar-routes.ts`
  - `server/routes/cerv2-export-routes.ts`
  - `server/routes/conversation-os.ts`

## Architecture truth relevant to this scope
- Artifact governance is app-controlled and mediated through writeback/governance consequences.
- Export generation already has internal validation report plumbing (`PDFValidationEntry[]`), enabling additive validators.
- Conversation OS already has proposal/orchestration service boundaries and is the right insertion point for quality and review artifacts.

## Constraints that shape implementation
1. No runtime replacement: Python/Java tooling must be sidecar or CLI boundary only.
2. No direct sidecar writes into regulated artifact persistence.
3. All sidecar outputs must return to app-controlled service modules for durable writes.
4. Non-trivial risk changes must be feature-flagged.
5. Rollout should start in advisory mode for quality gates, not hard fail, unless policy config says otherwise.

## Integration truth check (initial)
- No dedicated integrations for Tika/OCRmyPDF/Docling/Unstructured/GROBID/LanguageTool/veraPDF/scispaCy currently found under `server/integrations/*`.
- Existing exports provide a safe seam for attaching veraPDF results to export validation metadata.

## Phase recommendation
- Phase 1 and beginning of Phase 2 can safely land now with:
  - formal contracts/schemas,
  - sidecar client boundaries,
  - intake arbitration service,
  - feature flags,
  - advisory-only export validation attachment.
