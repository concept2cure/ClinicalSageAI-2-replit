-- Saved Precedent Queries migration
--
-- Mirrors shared/schema.ts savedPrecedentQueries pgTable definition
-- (added in commit fc5538d). Backs the MDX PrecedentSurface "Saved
-- queries" panel: org-scoped + optional user-owned saved searches over
-- the predicate / precedent intelligence corpus.

BEGIN;

CREATE TABLE IF NOT EXISTS saved_precedent_queries (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  user_id          integer REFERENCES users(id),
  label            text NOT NULL,
  query            text NOT NULL,
  scope            jsonb,
  hits             integer NOT NULL DEFAULT -1,
  last_run_at      timestamp,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spq_org_idx  ON saved_precedent_queries (organization_id);
CREATE INDEX IF NOT EXISTS spq_user_idx ON saved_precedent_queries (user_id);

COMMIT;
