-- ════════════════════════════════════════════════════════════════════════════
-- eCTD REGULATORY AUDIT CONTEXT
--
-- rendered_leaf_files — the retained bytes of a server-rendered filing document.
--
-- THE GAP (finding LIFE-01). The IND lifecycle filing routes rendered the
-- 312.32 safety report and the 312.33 annual report to PDF, computed an md5 of
-- those bytes, attached the md5 to the leaf, and threw the bytes away. The leaf
-- carried no document_table/document_id at all, so the canonical assembler
-- skipped it before resolution: every filed lifecycle sequence assembled with
-- ZERO leaf files, and the dispatch gate flagged each leaf UNRESOLVED_DOCUMENT,
-- which is a permanent block. A sponsor could "file" a 15-day safety report and
-- hold a sequence that can never be transmitted.
--
-- An md5 of discarded bytes is also the wrong record for 21 CFR 11.10(b)/(c):
-- the rule asks for accurate and complete copies and for protection of records
-- throughout their retention period. A checksum with no referent is neither.
--
-- THE CHANGE. One integer-keyed, organization-scoped row per rendered document.
-- The bytes themselves live behind the storage provider (the only tenant
-- boundary for object bytes, since object storage sits outside RLS); this table
-- holds the pointer and the digests, so a leaf can point at it, the resolver can
-- fetch and re-verify it, and the filed bytes are retrievable after the request
-- that made them has ended.
--
-- WHAT THIS DOES NOT DO. It does not backfill. Rows filed before this migration
-- have no retained bytes — nothing records what they contained — so they keep
-- their md5-only leaves and stay honestly unresolvable rather than being
-- re-pointed at bytes nobody can produce.
--
-- Idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS (deploy-migrate replays
-- the whole set).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rendered_leaf_files (
  id                SERIAL PRIMARY KEY,
  organization_id   INTEGER NOT NULL,
  -- Storage-provider handle. The bytes are fetched with get(vault_version_id,
  -- organization_id); that call IS the tenant gate for the bytes.
  vault_version_id  TEXT NOT NULL,
  -- Digests of the bytes as rendered. sha256 is re-verified on materialization;
  -- md5 is what the eCTD index carries, so it is stored rather than recomputed
  -- from a fetch that could disagree with what was filed.
  sha256            TEXT NOT NULL,
  md5               TEXT NOT NULL,
  mime              TEXT NOT NULL,
  byte_size         INTEGER NOT NULL,
  file_name         TEXT NOT NULL,
  -- Which renderer produced this: ind_safety_report | e2b_r3_icsr |
  -- ind_annual_report | ind_letter_of_authorization. Free text, not a CHECK: a
  -- new renderer must not require a migration to file.
  rendered_from     TEXT NOT NULL,
  -- The CTD section the bytes were rendered for, when known (e.g. 'm1.13').
  section_code      TEXT,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per stored object: a retry that re-puts the same version must not
-- create a second record of the same bytes.
CREATE UNIQUE INDEX IF NOT EXISTS rendered_leaf_files_org_version_idx
  ON rendered_leaf_files (organization_id, vault_version_id);

CREATE INDEX IF NOT EXISTS rendered_leaf_files_org_idx
  ON rendered_leaf_files (organization_id);
