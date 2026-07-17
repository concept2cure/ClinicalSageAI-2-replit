-- Research-administration CITI training store — the personnel training matrix
-- backing the v2 ResearchAdmin surface's Training section read. Each row is one
-- staff member (PI, sub-I, coordinator, biostat, veterinarian, lab tech) with
-- their per-module CITI completion state. The per-module status vector (cells[])
-- is held as JSONB so the row rehydrates straight into the surface's CitiPerson
-- shape and stays aligned to the fixture's training-column order. Org-scoped,
-- FK-free, schema-only, idempotent. This is per-org instance data — who is on
-- the org's studies and where each person stands on required training — not a
-- static catalog of training modules (those column labels stay in the surface
-- fixture). `seq` preserves the surface's fixture row order.

CREATE TABLE IF NOT EXISTS c2c_research_admin (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  seq               INTEGER NOT NULL DEFAULT 0,
  name              TEXT,
  role              TEXT,
  cells             JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, id)
);
