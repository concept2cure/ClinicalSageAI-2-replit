# Architecture Consolidation Master Plan

**Branch:** `concept2cure-v2` (per CLAUDE.md; harness-directed `claude/architecture-consolidation-c2c-v2-ZxSbD` is overridden)
**Start date:** 2026-04-22
**Status:** All phases complete. Phase 5 (UI) deferred — UI work goes through the Claude Design bundle, not this consolidation sprint.

## Purpose

This document tracks the multi-phase architecture consolidation described in
the Concept2Cure V2 Architecture Consolidation Work Order. Each phase has a
dedicated proof report under `docs/audits/PHASE_N_*_REPORT.md`. This master
doc links them and records the non-negotiables that apply across all phases.

## Non-negotiables (apply to every phase)

1. **No rewrite.** Surgical, scoped refactors only.
2. **Governed document contract enforcement must not weaken.** The
   `tests/routes/ai-entry-point-contract.test.ts` and
   `tests/routes/chat-governed-upload.test.ts` suites are the tripwires.
3. **AI gateway stays canonical.** `server/services/ai-gateway/` is the only
   sanctioned LLM access layer.
4. **Single retrieval truth.** By end of Phase 2, only one retrieval path is
   active. Legacy is quarantined.
5. **No silent public API breakage.** If a public contract changes, it is
   documented and accompanied by a compatibility shim.
6. **Concept2Cure naming in new code and docs**, even where legacy filenames
   still use older names.

## Phase index

| Phase | Title | Status | Report |
| --- | --- | --- | --- |
| 1 | Composition root split (`server/index.ts`) | ✅ Complete | [PHASE_1_BOOTSTRAP_REPORT.md](PHASE_1_BOOTSTRAP_REPORT.md) |
| 2 | Converge retrieval to one active path | ✅ Complete | [PHASE_2_RETRIEVAL_REPORT.md](PHASE_2_RETRIEVAL_REPORT.md) · truth table: [RETRIEVAL_ENTRYPOINTS.md](RETRIEVAL_ENTRYPOINTS.md) |
| 3 | Separate DB runtime from DB bootstrap/install | ✅ Complete | [PHASE_3_DB_BOOTSTRAP_REPORT.md](PHASE_3_DB_BOOTSTRAP_REPORT.md) |
| 4 | Decompose chat route | ✅ Complete | [PHASE_4_CHAT_ROUTE_REPORT.md](PHASE_4_CHAT_ROUTE_REPORT.md) |
| 5 | Decompose `ProjectWorkspaceShell.tsx` | ⏸ Deferred (UI) | Routed through Claude Design bundle |
| 6 | Route ownership normalization | ✅ Complete | [PHASE_6_ROUTE_OWNERSHIP_REPORT.md](PHASE_6_ROUTE_OWNERSHIP_REPORT.md) · truth table: [ROUTE_OWNERSHIP.md](ROUTE_OWNERSHIP.md) |
| 7 | Tests + truth tables to prevent regression | ✅ Complete | [PHASE_7_REGRESSION_GUARDS_REPORT.md](PHASE_7_REGRESSION_GUARDS_REPORT.md) · guard: [tests/routes/route-ownership.test.ts](../../tests/routes/route-ownership.test.ts) |

## Files preserved (must not regress across phases)

- `server/services/concept2cure/governedDocumentContractService.ts`
- `server/services/ai-gateway/gateway.ts`
- `server/src/control-plane/kernel.ts`
- `tests/routes/ai-entry-point-contract.test.ts`
- `tests/routes/chat-governed-upload.test.ts`

## Canonical retrieval layer (established in Phase 2)

`server/services/enhancedEmbeddingService.ts` + `server/services/advancedRAGPipeline.ts`,
both backed by `lumen_data_atoms` + hybrid search. See the full surface-by-surface
classification in [`RETRIEVAL_ENTRYPOINTS.md`](RETRIEVAL_ENTRYPOINTS.md). The legacy
files named in the work order (`semanticSearch.js`, `vaultRetriever.js`) and their
dead consumer chains were deleted in Phase 2 — no quarantine was needed because
the entire chain was transitively dead.

## Canonical AI provider layer

`server/services/ai-gateway/` — verified as the single LLM access layer by
`ai-entry-point-contract.test.ts`. Other providers (OpenAI direct, Anthropic
direct) must route through the gateway.
