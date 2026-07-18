-- Agency-meetings store — backs the v2 AgencyMeetings surface.
--
-- The route (server/routes/agency-meetings.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/100-agency-meetings.mjs) were already shipped, but the
-- table they read/write was never created by any migration, so the surface fell
-- back to its fixture ("Sample data"). This creates it, matching exactly the
-- columns the route projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id
-- is a client/route-supplied text key ('m1', 'mtg-<ts>'). Date-ish fields are
-- text on purpose — the surface renders them verbatim, incl. values like
-- '2026-09-15 (target)'. briefing_book / minutes are JSONB (nested detail).

CREATE TABLE IF NOT EXISTS c2c_agency_meetings (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  type            text    NOT NULL,
  agency          text    NOT NULL,
  cat             text,
  program         text,
  status          text    NOT NULL DEFAULT 'requested',
  requested       text,
  granted         text,
  meets           text,
  clock           text,
  format          text,
  goal            text,
  briefing_book   jsonb,
  minutes         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_agency_meetings_org
  ON c2c_agency_meetings (organization_id);
