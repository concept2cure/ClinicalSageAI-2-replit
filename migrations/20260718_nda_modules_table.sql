-- NDA/BLA CTD module-readiness store — backs the v2 NdaCockpit "CTD readiness" panel.
--
-- The route (server/routes/nda-cockpit.routes.ts, GET /api/nda-cockpit/modules)
-- and the demo seed (scripts/seed/ga-demo.d/97-nda-cockpit.mjs) were already
-- shipped, but the table they read/insert was never created by any migration, so
-- the panel fell back to its fixture and the overall "% ready" was derived off
-- fixture rows. This creates it, matching exactly the columns the route projects
-- ({ m, label, pct, docs, open, gate }) and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, m) matches the seed's ON CONFLICT target — there
-- is no separate id; the CTD module number `m` ('1'..'5') is the natural per-org
-- key and is text (kept as a label, not an int). pct is a percent; docs and
-- open_count are counts. gate is nullable (Module 4 has no open gate). The route
-- maps open_count -> `open` in its JSON projection.
--
-- NOTE: the same NdaCockpit surface/route also reads+writes c2c_nda_m1_docs and
-- c2c_nda_rtf, which have their own dedicated seeds (115-nda-m1-docs.mjs,
-- 116-nda-rtf.mjs) and are provisioned by separate migrations.

CREATE TABLE IF NOT EXISTS c2c_nda_modules (
  organization_id integer NOT NULL,
  m               text    NOT NULL,
  label           text    NOT NULL,
  pct             integer NOT NULL,
  docs            integer NOT NULL,
  open_count      integer NOT NULL,
  gate            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, m)
);

CREATE INDEX IF NOT EXISTS idx_c2c_nda_modules_org
  ON c2c_nda_modules (organization_id);
