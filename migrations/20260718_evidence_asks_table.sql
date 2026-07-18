-- Evidence-ask store — backs the v2 Evidence corpus-retrieval surface.
--
-- The route (server/routes/evidence-asks.routes.ts, GET /api/evidence-asks) and
-- the demo seed (scripts/seed/ga-demo.d/98-evidence-asks.mjs) were already
-- shipped, but the table they read/insert was never created by any migration, so
-- the surface fell back to its honest fixture. This creates it, matching exactly
-- the columns the route projects ({ pedigree, answer, cites, chunks, suggestions })
-- and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is
-- a client-supplied text key ('ask-bx204-cgm'). question/pedigree/answer are text.
-- cites (int array), chunks (array of { n, doc, page, sim, snip }), and
-- suggestions (string array) are JSONB (inserted via ::jsonb) and rehydrate
-- straight into the display shape. The route returns one ask (ORDER BY id LIMIT 1).

CREATE TABLE IF NOT EXISTS c2c_evidence_asks (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  question        text    NOT NULL,
  pedigree        text    NOT NULL,
  answer          text    NOT NULL,
  cites           jsonb,
  chunks          jsonb,
  suggestions     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_evidence_asks_org
  ON c2c_evidence_asks (organization_id);
