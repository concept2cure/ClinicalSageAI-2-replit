-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Extend ivdr_binder_evidence to support atom-sourced evidence
-- Date: 2026-02-24
-- Purpose: Fix improper usage of vault_file_id/vault_version_id for atom sources.
--          Instead of stuffing "atom:..." strings into vault columns, we add proper
--          source_type discrimination and nullable atom/retrieval_chunk FKs.
--
-- Integrity rule (strict mutual exclusivity):
--   vault evidence → vault_file_id + vault_version_id required, atom fields NULL
--   atom  evidence → source_atom_id + source_retrieval_chunk_id required, vault fields NULL
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Schema additions ────────────────────────────────────────────────────────

-- source_type column (default 'vault' for backward compat with existing rows)
ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'vault'
    CHECK (source_type IN ('vault', 'atom'));

-- Atom-specific nullable columns
ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_atom_id TEXT NULL;

ALTER TABLE ivdr_binder_evidence
  ADD COLUMN IF NOT EXISTS source_retrieval_chunk_id UUID NULL;

-- Make vault columns nullable (required only when source_type='vault')
ALTER TABLE ivdr_binder_evidence
  ALTER COLUMN vault_file_id DROP NOT NULL;

ALTER TABLE ivdr_binder_evidence
  ALTER COLUMN vault_version_id DROP NOT NULL;


-- ── 2. Normalize existing data BEFORE adding constraints ───────────────────────

-- Fix pre-fix rows that stuffed "atom:..." / "unversioned:..." into vault columns
UPDATE ivdr_binder_evidence
SET
  source_type = 'atom',
  source_atom_id = CASE
    WHEN vault_file_id LIKE 'atom:%' THEN SUBSTRING(vault_file_id FROM 6)
    ELSE vault_file_id  -- preserve whatever was there as atom_id
  END,
  -- We can't recover retrieval_chunk_id from old data; leave NULL temporarily
  vault_file_id = NULL,
  vault_version_id = NULL
WHERE vault_file_id LIKE 'atom:%'
   OR vault_file_id LIKE 'unversioned:%';

-- Ensure atom rows have vault fields cleared
UPDATE ivdr_binder_evidence
SET vault_file_id = NULL,
    vault_version_id = NULL
WHERE source_type = 'atom'
  AND (vault_file_id IS NOT NULL OR vault_version_id IS NOT NULL);

-- Ensure vault rows have atom fields cleared
UPDATE ivdr_binder_evidence
SET source_atom_id = NULL,
    source_retrieval_chunk_id = NULL
WHERE source_type = 'vault'
  AND (source_atom_id IS NOT NULL OR source_retrieval_chunk_id IS NOT NULL);


-- ── 3. Tightened CHECK constraint (strict mutual exclusivity) ──────────────────

ALTER TABLE ivdr_binder_evidence
  DROP CONSTRAINT IF EXISTS chk_binder_evidence_source_integrity;

ALTER TABLE ivdr_binder_evidence
  ADD CONSTRAINT chk_binder_evidence_source_integrity
  CHECK (
    CASE source_type
      WHEN 'vault' THEN
        vault_file_id IS NOT NULL
        AND vault_version_id IS NOT NULL
        AND source_atom_id IS NULL
        AND source_retrieval_chunk_id IS NULL
      WHEN 'atom' THEN
        source_atom_id IS NOT NULL
        AND source_retrieval_chunk_id IS NOT NULL
        AND vault_file_id IS NULL
        AND vault_version_id IS NULL
      ELSE FALSE
    END
  );


-- ── 4. Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_source_type
  ON ivdr_binder_evidence(source_type);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_atom
  ON ivdr_binder_evidence(source_atom_id)
  WHERE source_type = 'atom';

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_chunk
  ON ivdr_binder_evidence(source_retrieval_chunk_id)
  WHERE source_retrieval_chunk_id IS NOT NULL;

COMMIT;
