-- NDA/BLA Refuse-to-File (RtF) risk-log store — backs the v2 NdaCockpit "Refuse-to-File risk" list.
--
-- Route: server/routes/nda-cockpit.routes.ts (GET/POST /api/nda-cockpit/rtf).
-- Seed:  scripts/seed/ga-demo.d/116-nda-rtf.mjs.
--
-- The route + demo seed were already shipped, but the table they read/write was
-- never created by any migration, so the surface fell back to its fixture. This
-- creates it, matching exactly the columns the route projects and the seed inserts.
--
-- Tenant model: integer organization_id (RLS rollout, 0021). Composite PK
-- (organization_id, id) matches the seed/route ON CONFLICT (organization_id, id);
-- id is a client/route-supplied text key ('rtf-1', ..., 'rtf-<ts>'). `sev` is a
-- text severity ('high'|'med'|'low'); route defaults it to 'med'. `text` is the
-- risk narrative (column literally named "text", a valid identifier). `fix` is
-- nullable (route stores null when omitted). `seq` fixes list order (route reads
-- ORDER BY seq, id; appends via MAX(seq)+1).

CREATE TABLE IF NOT EXISTS c2c_nda_rtf (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  sev             text    NOT NULL DEFAULT 'med',
  area            text    NOT NULL,
  text            text    NOT NULL,
  fix             text,
  seq             integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_nda_rtf_org
  ON c2c_nda_rtf (organization_id);
