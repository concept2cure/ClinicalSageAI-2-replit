-- Shadow-review store — backs the v2 ShadowReview surface.
--
-- The route (server/routes/shadow-review.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/107-shadow-review.mjs) were already shipped, but the
-- table they read never existed, so the surface fell back to its fixture
-- ("Sample data"). This creates it, matching exactly the columns the route
-- projects (lens, findings) and the seed inserts.
--
-- Tenant model: integer organization_id (RLS). Composite PK (organization_id,
-- lens) matches the seed's ON CONFLICT target; `lens` is the reviewer lens key
-- ('fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr'). seq is the integer
-- ordering key (route ORDER BY seq, lens). findings is JSONB (the per-lens
-- ShadowFinding array).

CREATE TABLE IF NOT EXISTS c2c_shadow_review (
  organization_id integer NOT NULL,
  lens            text    NOT NULL,
  seq             integer NOT NULL,
  findings        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, lens)
);

CREATE INDEX IF NOT EXISTS idx_c2c_shadow_review_org
  ON c2c_shadow_review (organization_id);
