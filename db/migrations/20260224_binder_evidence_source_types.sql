-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Extend ivdr_binder_evidence to support atom-sourced evidence
-- Date: 2026-02-24
-- Purpose: Fix improper usage of vault_file_id/vault_version_id for atom sources.
--          Instead of stuffing "atom:..." strings into vault columns, we add proper
--          source_type discrimination and nullable atom/retrieval_chunk FKs.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add source_type enum column (default 'vault' for backward compat)
ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'vault'
    CHECK (source_type IN ('vault', 'atom'));

-- 2. Add atom-specific nullable columns
ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_atom_id TEXT NULL;

ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_retrieval_chunk_id UUID NULL;

-- 3. Make vault columns nullable (they stay NOT NULL only for source_type='vault')
ALTER TABLE ivdr_binder_evidence
  ALTER COLUMN vault_file_id DROP NOT NULL;

ALTER TABLE ivdr_binder_evidence
  ALTER COLUMN vault_version_id DROP NOT NULL;

-- 4. Add CHECK constraint: vault sources require vault IDs, atom sources require atom IDs
--    Drop first in case of re-run
ALTER TABLE ivdr_binder_evidence
  DROP CONSTRAINT IF EXISTS chk_binder_evidence_source_integrity;

ALTER TABLE ivdr_binder_evidence
  ADD CONSTRAINT chk_binder_evidence_source_integrity CHECK (
    CASE source_type
      WHEN 'vault' THEN
        vault_file_id IS NOT NULL
        AND vault_version_id IS NOT NULL
      WHEN 'atom' THEN
        source_atom_id IS NOT NULL
        AND source_retrieval_chunk_id IS NOT NULL
        AND vault_file_id IS NULL
        AND vault_version_id IS NULL
      ELSE FALSE
    END
  );

-- 5. Fix any existing rows that have "atom:..." in vault_file_id (from pre-fix inserts)
UPDATE ivdr_binder_evidence
SET
  source_type = 'atom',
  source_atom_id = CASE
    WHEN vault_file_id LIKE 'atom:%' THEN SUBSTRING(vault_file_id FROM 6)
    ELSE NULL
  END,
  source_retrieval_chunk_id = NULL,  -- we can't recover chunk IDs from old data
  vault_file_id = NULL,
  vault_version_id = NULL
WHERE vault_file_id LIKE 'atom:%'
   OR vault_file_id LIKE 'unversioned:%';

-- Note: rows fixed above will temporarily violate the atom CHECK (source_retrieval_chunk_id = NULL)
-- if the constraint was already added. That's OK because those rows are legacy data we can't fully
-- reconstruct. Drop and re-add the constraint to be lenient on legacy rows:
ALTER TABLE ivdr_binder_evidence
  DROP CONSTRAINT IF EXISTS chk_binder_evidence_source_integrity;

ALTER TABLE ivdr_binder_evidence
  ADD CONSTRAINT chk_binder_evidence_source_integrity CHECK (
    CASE source_type
      WHEN 'vault' THEN
        vault_file_id IS NOT NULL
        AND vault_version_id IS NOT NULL
      WHEN 'atom' THEN
        source_atom_id IS NOT NULL
        -- source_retrieval_chunk_id is desirable but not required for legacy rows
      ELSE FALSE
    END
  );

-- 6. Indexes for atom-sourced evidence lookups
CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_source_type
  ON ivdr_binder_evidence(source_type);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_atom
  ON ivdr_binder_evidence(source_atom_id)
  WHERE source_type = 'atom';

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_chunk
  ON ivdr_binder_evidence(source_retrieval_chunk_id)
  WHERE source_retrieval_chunk_id IS NOT NULL;
