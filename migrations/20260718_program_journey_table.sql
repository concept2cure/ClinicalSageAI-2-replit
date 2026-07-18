-- Program-journey spine — backs the v2 BiopharmaJourney surface.
--
-- The route (server/routes/program-journey.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/109-program-journey.mjs) were already shipped, but the
-- table they read/seed was never created by any migration, so the surface fell
-- back to its fixture. This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- The seed carries no client id — its ON CONFLICT target is (organization_id,
-- seg), one program-journey instance per segment per org, so the composite PK is
-- (organization_id, seg). current_stage rehydrates to `current` in the route.
-- Nested arrays/objects (target, overlay, modules, clock, haqs, contra,
-- blockers) are JSONB.

CREATE TABLE IF NOT EXISTS c2c_program_journey (
  organization_id integer NOT NULL,
  seg             text    NOT NULL,
  seq             integer,
  code            text,
  name            text,
  app             text,
  modality        text,
  indication      text,
  pathway         text,
  sponsor         text,
  agency          text,
  readiness       integer,
  current_stage   text,
  target          jsonb,
  overlay         jsonb,
  modules         jsonb,
  clock           jsonb,
  haqs            jsonb,
  contra          jsonb,
  blockers        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, seg)
);

CREATE INDEX IF NOT EXISTS idx_c2c_program_journey_org
  ON c2c_program_journey (organization_id);
