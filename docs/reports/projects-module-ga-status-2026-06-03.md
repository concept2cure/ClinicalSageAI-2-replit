---
title: Projects module — GA-readiness status (backend, sans UI)
date: 2026-06-03
branch: concept2cure-v2
companion: docs/reports/projects-module-surfacing-report-2026-06-03.md
---

# Projects module — GA-readiness status

This is the close-out for the backend GA push against the Projects spec (Part A).
It records what shipped this session, what changed for Claude Design, and the
remaining gaps that require the live preview-DB + model loop. Pairs with the
surfacing report (companion above).

## Shipped this session — all on concept2cure-v2, tsc --noEmit clean

| Gap | Spec | Commit | Tests |
|---|---|---|---|
| Project instructions → chat system context, both chat paths | A1.1 | `d409394` | 13 |
| A2 two-mode: estimate + select + persist + surface retrieval mode | A2 | `f7ebcec` | 9 |
| A2 two-mode: in-context full-corpus injection (dark-launched) | A2 | `caa22bc` | +5 |
| `project_knowledge_search` model tool | A3 | `763ad9e` | tsc |
| Real PDF/DOCX text extraction at upload | A3 / A5 | `02c49b0` | 8 |
| Claude Design surfacing report | — | `efebfc2` | — |

35 new unit tests; full-repo `tsc --noEmit` clean at every step. One additive,
idempotent migration (`migrations/20260603_project_retrieval_mode.sql`).

## What changed for Claude Design (revisions to the surfacing report)

- **Retrieval-mode indicator (B2/B6): BLOCKED → SURFACE NOW.**
  `GET /api/concept2cure/projects/:id/knowledge` now returns `retrievalMode`
  (`in_context` | `retrieval`) and `knowledgeTokenEstimate`.
- **Instructions ("tailor Claude for this project"): now real on both chat
  paths** (main + submission-chat). Present it as functional, not aspirational.
- **B6 inline "searching project knowledge": now backed** by the
  `project_knowledge_search` tool — the model can call it, so the in-thread
  tool-activity has a real event to render.
- **Binary uploads (PDF/DOCX) are now extracted and searchable** — the Files tab
  can treat them as real project knowledge, not opaque blobs.
- Everything else in the surfacing report (Provenance / Memory / Activity tabs,
  conversation-first Project Landing) remains SURFACE NOW.

## Remaining backend gaps — need the live preview-DB + model loop

Deliberately NOT blind-pushed: each needs real Postgres/pgvector + embedding/
rerank model runs + deploy to build and certify safely. This environment has
none of those, and the repo's history shows blind regulated-pipeline pushes get
reverted on `preview_db_test`. Each is specified enough to implement in a
session that has the live infra.

1. **Contextual-embeddings ingest (A3)** — chunk each document, generate a
   per-chunk situating context via `gateway.ts`, prepend before embedding, store
   dense + sparse with provenance, and read chunks on the retrieval side. Ingest
   rewrite + LLM-per-chunk cost + a retrieval-side change → must be validated
   against real models/DB. The current whole-document atom embedding (now fed
   real extracted text, `02c49b0`) keeps working in the meantime.
2. **A2 in-context injection rollout** — the code shipped behind
   `PROJECT_INCONTEXT_INJECTION_ENABLED` (default off). Validate prompt-cache hit
   rate, token budget, and latency/cost on the live env, then enable.
3. **Gateway unification (A3 "all LLM calls via gateway.ts")** — route the
   `advancedRAGPipeline` HyDE/rerank calls through `gateway.ts` (they use
   `AIProviderRouter` directly today). Behaviour-changing refactor of a working
   pipeline → validate parity live.
4. **Conversations ↔ AI runtime** — converge the storage-only
   `/projects/:id/conversations/:convId/messages` endpoint with the
   `send-message` runtime (different table families today). Architectural.
5. **Citation `version` (minor)** — add the artifact version to citations; the
   citation path's artifact query selects no version column, so this needs a
   schema/query check first.

## GA gate (backend, sans UI)

- **Code:** GA-grade — additive, tenant-scoped, graceful, typecheck-clean, and
  unit-tested for all pure logic. On `concept2cure-v2`.
- **Migration:** idempotent + additive; applies in the preview/CI DB. Not
  certified against real Postgres in this environment (no preview DB here).
- **Runtime / deploy certification:** pending the CI/preview loop — this
  environment cannot run Postgres, pgvector, the embedding/rerank models, or a
  deploy. That loop is the final GA sign-off; the shipped code is ready for it.
