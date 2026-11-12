-- =============================================================================
-- 20261112_vault_catalog_dataset_profile.sql (S2, the data catalog, 2026-11-12)
--
-- WHY. The data catalog lists the Vault's documents and grades them with the
-- data-room grade engine (server/services/clinical-regulatory-evidence/
-- data-room-vault.ts, 2026-11-11). A dataset captured in the data room carries
-- its profile (dataset-profile.ts: tables, columns, the CDISC standard its
-- columns show), and the grade runs the CDISC validators over it. A dataset
-- filed in the Vault had no profile, so its grade could only say "its
-- structure has not been read here".
--
-- WHAT. Two nullable columns on vault.document_catalog, the Vault's derived
-- record of what a document's bytes are (keyed by document_id and
-- content_hash):
--   * dataset_profile       the profile dataset-profile.ts made of those bytes
--                           (about 2 KB), or a profile with no tables when the
--                           bytes are not a dataset this profiler reads;
--   * dataset_profiled_at   when it was made.
-- Written only by data-room-vault.ts, from bytes read through the Vault's own
-- verified read (readVerifiedVaultBytes: the recorded SHA-256 is checked
-- first). Derived data: no other column of the row is written, and nothing
-- reads these but the catalog's grade.
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS only: no table,
-- no constraint, no trigger, no DROP. vault.document_catalog keeps its
-- existing tenant policy; a column adds nothing for the sweeps to policy.
--
-- AMENDED IN PLACE 2026-11-12 (F1): the statements are now inside a DO block
-- that returns when vault.document_catalog does not exist yet. Nothing is
-- removed and nothing changes on a database that has the table: the same two
-- columns and the same comment are applied, exactly as before.
--   Why. On a database built from empty, install-fresh's step-3 overlay runs
--   this file before the table exists: its creator
--   (20260905_document_catalog.sql) itself waits on vault.documents, which the
--   governed-content tree creates at step 6. Unguarded, the ALTER failed on
--   every pass ("relation vault.document_catalog does not exist"), the file
--   was left unapplied, and the installer reported INCOMPLETE and exited 1, so
--   no database could be provisioned from blank. Guarded, it no-ops at step 3
--   and install-fresh re-applies it at step 6, as it does for every root file
--   carrying this guard (20261008e_document_catalog_attribution.sql is the
--   sibling this follows). deploy-migrate was never affected: there the
--   creator runs first.
--   Evidence: docs/evidence/D3/2026-11-12-live-tier-at-head/.
-- =============================================================================

DO $catalog_dataset_profile$
BEGIN
  IF to_regclass('vault.document_catalog') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE vault.document_catalog
    ADD COLUMN IF NOT EXISTS dataset_profile jsonb,
    ADD COLUMN IF NOT EXISTS dataset_profiled_at timestamptz;

  COMMENT ON COLUMN vault.document_catalog.dataset_profile IS
    'The dataset profile of this content (dataset-profile.ts), made by the data catalog (data-room-vault.ts) from verified bytes. Derived; never a person''s or a model''s statement.';
END
$catalog_dataset_profile$;
