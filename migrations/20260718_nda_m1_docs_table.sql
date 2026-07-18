-- NDA/BLA Module-1 admin worklist store — backs the v2 NdaCockpit "Module 1 admin" list.
--
-- Route: server/routes/nda-cockpit.routes.ts (GET/POST /api/nda-cockpit/m1).
-- Seed:  scripts/seed/ga-demo.d/115-nda-m1-docs.mjs.
--
-- The route + demo seed were already shipped, but the table they read/write was
-- never created by any migration, so the surface fell back to its fixture. This
-- creates it, matching exactly the columns the route projects and the seed inserts.
--
-- Tenant model: integer organization_id (RLS rollout, 0021). Composite PK
-- (organization_id, id) matches the seed/route ON CONFLICT (organization_id, id);
-- id is a client/route-supplied text key ('356h', 'cover', ..., 'm1-<ts>').
-- `st` is a text status ('complete'|'review'|'draft'|'na'); route defaults it to
-- 'draft'. `note` is nullable (many rows have no note). `seq` fixes list order
-- (route reads ORDER BY seq, id; appends via MAX(seq)+1).

CREATE TABLE IF NOT EXISTS c2c_nda_m1_docs (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  label           text    NOT NULL,
  st              text    NOT NULL DEFAULT 'draft',
  blocker         boolean NOT NULL DEFAULT false,
  note            text,
  seq             integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_nda_m1_docs_org
  ON c2c_nda_m1_docs (organization_id);
