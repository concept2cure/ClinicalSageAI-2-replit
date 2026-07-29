-- Decision-lineage store — the governed-artifact decision-trail worklist backing
-- the v2 DecisionLineage surface's GET read. Each row is one governed artifact
-- (BX-204 program) with its immutable, Part-11 hash-chained decision graph:
-- the ordered decision/document_state/workflow_step/evidence_link/delegation
-- nodes (who decided what, when, on what evidence), the auto-wired edges, and
-- the roll-up metadata. Nodes/edges/metadata are held as JSONB so the row
-- rehydrates straight into the surface's LineageGraph shape. Org-scoped,
-- FK-free, schema-only, idempotent. sort_order preserves the fixture's artifact
-- ordering for the picker default.

CREATE TABLE IF NOT EXISTS c2c_decision_lineage (
  id                 TEXT    NOT NULL,
  organization_id    INTEGER NOT NULL,
  root_entity_type   TEXT    NOT NULL,
  root_entity_id     INTEGER NOT NULL,
  artifact_label     TEXT    NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  nodes              JSONB   NOT NULL DEFAULT '[]'::jsonb,
  edges              JSONB   NOT NULL DEFAULT '[]'::jsonb,
  metadata           JSONB   NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, id)
);
