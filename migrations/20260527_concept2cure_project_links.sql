-- @migration-type: gcc-feature
-- @migration-author: system
-- @migration-description: concept2cure project link relationships
-- ============================================================================
-- concept2cure_project_links — project-to-project relationship registry
-- ============================================================================
--
-- Stores directional links between concept2cure projects. Each row represents
-- one typed relationship edge: predicate device, parent IND, child NDA,
-- cross-reference, or supplier. The GET /linked endpoint reads both sides
-- (source_id and target_id) and joins with the projects table for display.
-- ============================================================================

CREATE TABLE IF NOT EXISTS concept2cure_project_links (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL,
  source_id     INTEGER NOT NULL,  -- the project this link belongs to
  target_id     INTEGER NOT NULL,  -- the linked project
  kind          TEXT NOT NULL,     -- 'predicate' | 'parent_ind' | 'child_nda' | 'cross_ref' | 'supplier'
  direction     TEXT NOT NULL DEFAULT 'out',  -- 'out' (source→target) | 'in' (target→source)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    INTEGER,
  UNIQUE (org_id, source_id, target_id, kind)
);

CREATE INDEX IF NOT EXISTS concept2cure_project_links_source_idx
  ON concept2cure_project_links (org_id, source_id);
CREATE INDEX IF NOT EXISTS concept2cure_project_links_target_idx
  ON concept2cure_project_links (org_id, target_id);
