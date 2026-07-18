-- Protocol-development authoring hub — backs the v2 ProtocolDev surface.
--
-- The route (server/routes/protocol-dev.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/111-protocol-dev.mjs) were already shipped, but the
-- table they read/seed was never created by any migration, so the surface fell
-- back to its fixture. This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id
-- is the client-supplied protocol key ('PROT-2041'). Header scalars are text /
-- integer (updated is a relative string like '2 min ago'; completeness is a
-- percent). Every nested structure (sections, content, objectives, eligibility,
-- soa, risks, milestones, budget, amendments, deviations, reviews, consent,
-- completeness_findings) is JSONB.

CREATE TABLE IF NOT EXISTS c2c_protocol_dev (
  id                    text    NOT NULL,
  organization_id       integer NOT NULL,
  seq                   integer,
  title                 text,
  short_title           text,
  kind                  text,
  version               text,
  status                text,
  sponsor               text,
  pi                    text,
  updated               text,
  completeness          integer,
  open_section          text,
  sections              jsonb,
  content               jsonb,
  objectives            jsonb,
  eligibility           jsonb,
  soa                   jsonb,
  risks                 jsonb,
  milestones            jsonb,
  budget                jsonb,
  amendments            jsonb,
  deviations            jsonb,
  reviews               jsonb,
  consent               jsonb,
  completeness_findings jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_protocol_dev_org
  ON c2c_protocol_dev (organization_id);
