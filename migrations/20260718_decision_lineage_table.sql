-- Governed decision-lineage store — backs the v2 DecisionLineage surface.
--
-- The route (server/routes/decision-lineage.routes.ts, GET /api/decision-lineage) and
-- the demo seed (scripts/seed/ga-demo.d/104-decision-lineage.mjs) were already shipped,
-- but the table they read was never created by any migration, so the surface fell back
-- to its fixture ("Sample data"). This creates it, matching exactly the columns the
-- route projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is a
-- client-supplied text key (String(rootEntityId), e.g. '4025'). root_entity_id is the
-- integer artifact id and sort_order the integer sort key the route's
-- `ORDER BY sort_order, root_entity_id` reads. nodes / edges / metadata hold the
-- Part-11 hash-chained decision graph, seeded with ::jsonb and rehydrated from JSONB
-- straight into the surface's LineageGraph shape.

CREATE TABLE IF NOT EXISTS c2c_decision_lineage (
  id               text    NOT NULL,
  organization_id  integer NOT NULL,
  root_entity_type text    NOT NULL,
  root_entity_id   integer NOT NULL,
  artifact_label   text    NOT NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  nodes            jsonb,
  edges            jsonb,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_decision_lineage_org
  ON c2c_decision_lineage (organization_id);
