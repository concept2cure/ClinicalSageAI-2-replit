-- ============================================================================
-- 20261029_vault_documents_restored_from.sql
--
-- A restored version holds the bytes of the version it restores (MR-08 Stage 5
-- step 2, CAT1-04, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
--
-- WHY. A Vault version is a write-once row, so going back to version 1 after
-- version 2 means adding version 3 with version 1's bytes. But
-- db/migrations/044c_gcc_vault_schema.sql makes (program_id, content_hash)
-- unique, so the same bytes are recorded once per program. That rule stops one
-- file being admitted twice under two names, and it stays. It also refused
-- every restore. So a restore is marked by the version it restores, and the
-- rule is narrowed to rows that are not restores:
--
--   vault.documents.restored_from_id uuid: the version whose bytes this row
--     holds, set by the restore (server/services/vault/vault-version-restore.ts)
--     and NULL on every other row.
--
--   vault.documents_restore_guard(), BEFORE INSERT OR UPDATE OF restored_from_id:
--     a row that names a version must name a live version of the same program,
--     organization and document code that holds the same bytes. Otherwise it
--     raises VAULT_RESTORE_INVALID, so no writer can mark a row a restore to
--     admit a second copy of a file. The column is write-once: an UPDATE that
--     changes it is refused.
--
--   idx_vault_documents_program_hash_unique: where it is the index 044c
--     creates, with no predicate, it is rebuilt under the same name as the same
--     index WHERE restored_from_id IS NULL. The replacement is created first,
--     then the old index is dropped and the new one renamed, in one
--     transaction, so a program is never without the rule. Keeping the name
--     means 044c's CREATE UNIQUE INDEX IF NOT EXISTS stays a no-op, and the
--     ingest still answers a second copy DUPLICATE_CONTENT. Where the index
--     does not exist (a database that never ran the governed-content tree),
--     nothing is created; the check-in planner (vault-version-checkin.ts) is
--     the rule there, as before.
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS; CREATE OR
-- REPLACE for the function; the trigger only when absent; the index replaced
-- only while its definition has no predicate (the corollary: a replacement is
-- conditional on the definition), so a replay is a no-op. The DROP INDEX
-- removes an index no file in C2C_MIGRATION_FILES creates. Its one creator,
-- 044c, runs in install-fresh's governed-content step and never on a deploy,
-- so there is no create-then-drop cycle. Guarded on to_regclass, so
-- install-fresh re-applies this file after 044c creates the table.
--
-- AMENDED IN PLACE 2026-10-29 (security review of the same change): the guard
-- also refuses a row with no document code. IS DISTINCT FROM treats two NULL
-- codes as equal, so one uncoded row could have "restored" another uncoded
-- document's identical bytes. CREATE OR REPLACE, so every deploy installs it.
--
-- Pinned by tests/db/vault-version-restore.dbtest.ts.
-- ============================================================================

DO $mig$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents absent: restored_from_id skipped';
    RETURN;
  END IF;

  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS restored_from_id uuid;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION vault.documents_restore_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      src record;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.restored_from_id IS DISTINCT FROM OLD.restored_from_id THEN
          RAISE EXCEPTION 'VAULT_RESTORE_INVALID: which version % restores is recorded once.', NEW.id
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END IF;
      IF NEW.restored_from_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT s.program_id, s.organization_id, s.document_code, s.content_hash, s.deleted_at
        INTO src
        FROM vault.documents s
       WHERE s.id = NEW.restored_from_id;

      IF NOT FOUND OR src.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'VAULT_RESTORE_INVALID: version % restores %, which is not a live Vault version.',
          NEW.id, NEW.restored_from_id
          USING ERRCODE = 'check_violation';
      END IF;
      IF src.program_id IS DISTINCT FROM NEW.program_id
         OR src.organization_id IS DISTINCT FROM NEW.organization_id
         OR NEW.organization_id IS NULL
         OR NEW.document_code IS NULL
         OR src.document_code IS DISTINCT FROM NEW.document_code
         OR src.content_hash IS DISTINCT FROM NEW.content_hash THEN
        RAISE EXCEPTION 'VAULT_RESTORE_INVALID: version % does not hold the bytes of %, a version of the same document.',
          NEW.id, NEW.restored_from_id
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $body$;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'vault_documents_restore_guard'
       AND tgrelid = 'vault.documents'::regclass
  ) THEN
    CREATE TRIGGER vault_documents_restore_guard
      BEFORE INSERT OR UPDATE OF restored_from_id ON vault.documents
      FOR EACH ROW EXECUTE FUNCTION vault.documents_restore_guard();
  END IF;
END
$mig$;

DO $idx$
DECLARE
  def text;
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RETURN;
  END IF;
  SELECT pg_get_indexdef(i.indexrelid) INTO def
    FROM pg_index i
   WHERE i.indexrelid = to_regclass('vault.idx_vault_documents_program_hash_unique');
  IF def IS NULL OR def ~* '\sWHERE\s' THEN
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS vault_documents_program_hash_unique_next
    ON vault.documents (program_id, content_hash)
    WHERE restored_from_id IS NULL;
  DROP INDEX vault.idx_vault_documents_program_hash_unique;
  ALTER INDEX vault.vault_documents_program_hash_unique_next RENAME TO idx_vault_documents_program_hash_unique;
END
$idx$;
