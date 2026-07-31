-- DEPRECATED (2026-08): superseded by the REAL AI trace chain
-- (20260224_ai_trace_chain.sql — ai_retrieval_runs + ai_retrieval_chunks +
-- ai_generation_runs), which already has a live write path: POST /api/evidence/ask
-- (server/routes/evidence-ask.ts) persists a retrieval run, its ranked chunks, and a
-- generation run on every real corpus ask. GET /api/evidence-asks now assembles the
-- surface's latest-ask view ENTIRELY from that real, org-scoped chain via
-- evidence-asks-view-assembler.ts — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This blob is retained (non-destructive) but is
-- no longer written by the demo seed nor read by any route. A later migration may DROP it
-- once no environment references it.
--
-- Evidence-ask store — saved corpus-retrieval answers backing the v2 Evidence
-- surface's GET read. Each row is one grounded ask: the natural-language
-- question, the retrieval pedigree, the composed answer, its numeric citation
-- refs, the retrieved source chunks (pgvector similarity hits), and the
-- suggested follow-up prompts. Org-scoped, FK-free, schema-only, idempotent.
-- Citation refs / chunks / suggestions are held as JSONB so the row rehydrates
-- straight into the surface's { pedigree, answer, cites, chunks, suggestions }
-- display shape. No PHI — study-subject codes and public-precedent docs only.

CREATE TABLE IF NOT EXISTS c2c_evidence_asks (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  question          TEXT,
  pedigree          TEXT,
  answer            TEXT,
  cites             JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunks            JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, id)
);
