-- Document-journey lifecycle store — backs the v2 DocJourney surface.
--
-- The route (server/routes/doc-journey.routes.ts, GET /api/doc-journey) and the
-- demo seed (scripts/seed/ga-demo.d/99-doc-journey.mjs) were already shipped, but
-- the table they read/insert was never created by any migration, so the surface
-- fell back to its fixture. This creates it, matching exactly the columns the
-- route projects (the DjStage rail fields { id, label, ic, when, who, ver, done,
-- active, sub, kind } plus the per-stage `snap`) and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is
-- a client-supplied text key ('ideate', 'outline', ...). `ord` is the integer
-- stage order the route sorts by (ORDER BY ord). The JS field `when` is stored as
-- when_label (a display string like 'May 28') — the route aliases it back to
-- `when` in its JSON projection. done/active are booleans. snap is the per-stage
-- content snapshot (brief / outline / doc / redline / qc / assemble / submit),
-- inserted via ::jsonb.

CREATE TABLE IF NOT EXISTS c2c_doc_journeys (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  ord             integer NOT NULL,
  label           text    NOT NULL,
  ic              text    NOT NULL,
  when_label      text    NOT NULL,
  who             text    NOT NULL,
  ver             text    NOT NULL,
  done            boolean NOT NULL,
  active          boolean NOT NULL,
  sub             text    NOT NULL,
  kind            text    NOT NULL,
  snap            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_doc_journeys_org
  ON c2c_doc_journeys (organization_id);
