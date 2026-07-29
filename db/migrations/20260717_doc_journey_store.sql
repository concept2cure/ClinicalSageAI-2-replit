-- Document-journey store — the per-document lifecycle worklist (ideation →
-- submission) backing the v2 DocJourney surface's GET read. Each row is one
-- stage of a single document's journey (§2.5 Clinical Overview on the BX-204
-- BLA); the surface renders the stage rail (DjStage fields) and, per stage, a
-- content snapshot (brief / outline / doc / redline / qc / assemble / submit)
-- held as JSONB so the row rehydrates straight into the surface's DjSnap shape.
-- Org-scoped, FK-free, schema-only, idempotent. `when` and `ord` are quoted-safe
-- column names (when_label / ord) to avoid the SQL reserved words.

CREATE TABLE IF NOT EXISTS c2c_doc_journeys (
  id               TEXT    NOT NULL,
  organization_id  INTEGER NOT NULL,
  ord              INTEGER NOT NULL DEFAULT 0,
  label            TEXT,
  ic               TEXT,
  when_label       TEXT,
  who              TEXT,
  ver              TEXT,
  done             BOOLEAN NOT NULL DEFAULT FALSE,
  active           BOOLEAN NOT NULL DEFAULT FALSE,
  sub              TEXT,
  kind             TEXT,
  snap             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, id)
);
