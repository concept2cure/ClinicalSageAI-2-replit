-- ============================================================================
-- 20260930_vault_documents_version_lineage.sql
--
-- A Vault version names its predecessor only inside its own family, and a
-- version has at most one live successor (Vault parity plan VR-08, row D2).
--
-- WHY. vault.documents is row-per-version: UNIQUE (program_id, document_code,
-- version), with `supersedes_id` pointing at the version a row replaces. Until
-- VR-08 nothing checked that pointer. The ingest wrote whatever UUID the body
-- carried, so a "new version" could name another program's document, another
-- tenant's, or a version that already had a successor. VR-05 stopped the route
-- accepting it; VR-08 adds the check-in path (the server finds the head, locks
-- it, assigns the next version) and this guard, so the rule holds for every
-- writer, including a raw INSERT.
--
--   vault.documents_lineage_guard(), BEFORE INSERT OR UPDATE OF supersedes_id:
--     when the row names a predecessor, take a transaction advisory lock on it
--     (two-key form over hashtext, so concurrent successors of one version
--     queue), then require that the predecessor
--       * exists and is visible to the writer (another tenant's is not, under
--         RLS) and is not tombstoned,
--       * has the same program_id, document_code and organization_id. A NULL
--         organization on either side is "distinct", so a legacy row with no
--         tenant key cannot anchor a new version (plan critic item 16),
--       * has no other live successor;
--     otherwise it raises VAULT_LINEAGE_INVALID. An UPDATE that leaves the
--     pointer as it was is not re-checked. VR-06 already refuses a pointer
--     changing once it holds a value.
--
--   vault_documents_one_successor, a partial unique index on (supersedes_id)
--     for live rows. It is created only when no version already has two live
--     successors. Otherwise this file RAISEs NOTICE with the count and skips
--     it. deploy-migrate stops on the first failure, so a data condition must
--     never become an exception here, and the trigger enforces the rule for new
--     writes either way.
--
-- Deliberately NOT a self-referencing FK. Even NOT VALID, it would make the
-- tenant purge fail on a legacy cross-tenant pointer, and ON DELETE SET NULL
-- would break VR-06's write-once rule.
--
-- RULE 1: replayed on every deploy. CREATE OR REPLACE for the function; the
-- trigger and the index are created only when absent. No DROP. Guarded on
-- to_regclass so a lineage without the table skips it.
--
-- Pinned by tests/db/vault-version-checkin.dbtest.ts (the forged pointer, the
-- second successor, and a replay over seeded duplicate pointers).
-- ============================================================================

DO $mig$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents absent: version lineage guard skipped';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION vault.documents_lineage_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      pred record;
    BEGIN
      IF NEW.supersedes_id IS NULL THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.supersedes_id IS NOT DISTINCT FROM OLD.supersedes_id THEN
        RETURN NEW;
      END IF;

      PERFORM pg_advisory_xact_lock(hashtext('vault.documents.lineage'), hashtext(NEW.supersedes_id::text));

      SELECT d.id, d.program_id, d.document_code, d.organization_id, d.deleted_at
        INTO pred
        FROM vault.documents d
       WHERE d.id = NEW.supersedes_id;

      IF NOT FOUND OR pred.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'VAULT_LINEAGE_INVALID: version % names a predecessor % that is not a live Vault version.',
          NEW.id, NEW.supersedes_id
          USING ERRCODE = 'check_violation';
      END IF;

      IF pred.program_id IS DISTINCT FROM NEW.program_id
         OR pred.document_code IS DISTINCT FROM NEW.document_code
         OR pred.organization_id IS DISTINCT FROM NEW.organization_id
         OR NEW.organization_id IS NULL THEN
        RAISE EXCEPTION 'VAULT_LINEAGE_INVALID: version % and its predecessor % are not the same document (program, code and organization must match).',
          NEW.id, NEW.supersedes_id
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1 FROM vault.documents s
         WHERE s.supersedes_id = NEW.supersedes_id
           AND s.deleted_at IS NULL
           AND s.id IS DISTINCT FROM NEW.id
      ) THEN
        RAISE EXCEPTION 'VAULT_LINEAGE_INVALID: version % already has a successor; a version is succeeded once.',
          NEW.supersedes_id
          USING ERRCODE = 'check_violation';
      END IF;

      RETURN NEW;
    END;
    $body$;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'vault_documents_lineage_guard'
       AND tgrelid = 'vault.documents'::regclass
  ) THEN
    CREATE TRIGGER vault_documents_lineage_guard
      BEFORE INSERT OR UPDATE OF supersedes_id ON vault.documents
      FOR EACH ROW EXECUTE FUNCTION vault.documents_lineage_guard();
  END IF;
END
$mig$;

DO $idx$
DECLARE
  forked integer;
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('vault.vault_documents_one_successor') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO forked FROM (
    SELECT supersedes_id
      FROM vault.documents
     WHERE supersedes_id IS NOT NULL AND deleted_at IS NULL
     GROUP BY supersedes_id
    HAVING count(*) > 1
  ) f;

  IF forked > 0 THEN
    RAISE NOTICE 'vault_documents_one_successor not created: % Vault version(s) already have more than one live successor. The lineage trigger still refuses a new one; resolve the existing pairs and the next deploy creates the index.', forked;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX vault_documents_one_successor
    ON vault.documents (supersedes_id)
    WHERE supersedes_id IS NOT NULL AND deleted_at IS NULL;
END
$idx$;
