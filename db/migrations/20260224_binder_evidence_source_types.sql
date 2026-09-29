-- 2026-09-25 AMENDED IN PLACE (W2 / D1, docs/evidence/W2/2026-09-25-replay-rebuilds-nothing/):
-- chk_binder_evidence_source_integrity is now replaced only when the live definition
-- (pg_get_constraintdef) differs from the one below. Unconditional, every deploy dropped
-- and re-added it — a full validation scan under lock (ACCESS EXCLUSIVE for a CHECK;
-- writes blocked on child and parent for a FOREIGN KEY) while the application served.
-- The definitions are unchanged. Pinned by npm run ci:replay-rebuilds-nothing.
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

-- to_regclass-guarded, like every file this set applies: a bare ALTER raises
-- 42P01 on a lineage without the table. The file's own transaction is kept —
-- a DO block runs inside it fine. Wired into C2C_MIGRATION_FILES on 2026-09-20
-- after these columns were measured ABSENT on a database built by install-fresh
-- plus the whole set, while the IVDR pack manifest SELECTs all three and the
-- evidence route INSERTs source_type.
DO $$
BEGIN
  IF to_regclass('public.ivdr_binder_evidence') IS NULL THEN
    RAISE NOTICE 'ivdr_binder_evidence not present in this schema; skipping.';
    RETURN;
  END IF;

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

  -- Replaced only when the live definition differs (2026-09-25, see the header):
  -- unconditionally, every deploy re-validated it under lock while the app served.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.ivdr_binder_evidence') AND conname = 'chk_binder_evidence_source_integrity'
       AND pg_get_constraintdef(oid) = $def$CHECK (
CASE source_type
    WHEN 'vault'::text THEN ((vault_file_id IS NOT NULL) AND (vault_version_id IS NOT NULL) AND (source_atom_id IS NULL) AND (source_retrieval_chunk_id IS NULL))
    WHEN 'atom'::text THEN ((source_atom_id IS NOT NULL) AND (source_retrieval_chunk_id IS NOT NULL) AND (vault_file_id IS NULL) AND (vault_version_id IS NULL))
    ELSE false
END)$def$
  ) THEN
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
  END IF;


  -- ── 4. Indexes ─────────────────────────────────────────────────────────────────

  CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_source_type
  ON ivdr_binder_evidence(source_type);

  CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_atom
  ON ivdr_binder_evidence(source_atom_id)
  WHERE source_type = 'atom';

  CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_chunk
  ON ivdr_binder_evidence(source_retrieval_chunk_id)
  WHERE source_retrieval_chunk_id IS NOT NULL;
END $$;

COMMIT;
