-- Regulatory-change intelligence store — backs the v2 RegChange (horizon-scan) surface.
--
-- The route (server/routes/reg-change.routes.ts, GET /api/reg-change) and the demo
-- seed (scripts/seed/ga-demo.d/103-reg-change.mjs) were already shipped, but the table
-- they read was never created by any migration, so the surface fell back to its fixture
-- ("Sample data"). This creates it, matching exactly the columns the route projects and
-- the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is a
-- client-supplied text key ('QMSR', 'AIACT', ...). seq is the integer sort key the
-- route's `ORDER BY seq, id` reads. when_label is text (the seed's `when` value, e.g.
-- 'Effective 2 Feb 2026', rendered verbatim as `when`). live is boolean. affects (the
-- per-device impact list) is JSONB, seeded with ::jsonb.

CREATE TABLE IF NOT EXISTS c2c_reg_changes (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  seq             integer NOT NULL DEFAULT 0,
  src             text,
  kind            text,
  when_label      text,
  sev             text,
  live            boolean NOT NULL DEFAULT false,
  title           text    NOT NULL,
  summary         text,
  affects         jsonb,
  action          text,
  doc             text,
  owner           text,
  due             text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_reg_changes_org
  ON c2c_reg_changes (organization_id);
