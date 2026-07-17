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
