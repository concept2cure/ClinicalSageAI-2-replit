-- DEPRECATED (2026-07): the v2 DecisionLineage surface no longer reads this blob.
-- GET /api/decision-lineage is now assembled ENTIRELY from the REAL workflow + audit
-- store via decisionLineageService.getLineageGraph (document_workflows /
-- workflow_approvals / workflow_history / document_audit_logs + hash-chained
-- audit_logs) — the same real service that backs the per-artifact
-- /api/decision-lineage/:entityType/:entityId, export, and verify-chain endpoints.
-- See server/services/workflow/decision-lineage-view-assembler.ts and
-- docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This table is retained
-- (non-destructive) but is no longer written by the demo seed nor read by any route.
-- A later migration may DROP it once no environment references it.
--
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
