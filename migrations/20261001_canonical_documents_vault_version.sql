-- VR-13 (D5, 2026-10-01): one lifecycle record per Vault version.
--
-- A canonical_documents row made from a Vault version names that version in
-- source_refs.vault_documents.nativeId. Starting a version's lifecycle
-- (POST /api/regulatory/documents) looks for an existing record under an
-- advisory lock and returns it, so the route never starts a second one. This
-- index makes the database refuse a second one from any writer.
--
-- Created only when no version already has two records. Otherwise it raises a
-- NOTICE with the count and skips, so a data condition never stops a deploy,
-- and the next deploy creates the index once the pairs are resolved. None is
-- expected: until VR-13 the lifecycle route had no client caller.
--
-- Replays on every deploy (CLAUDE.md, Rule 1): an index created when absent;
-- no table, no column, no DROP.

DO $$
DECLARE
  dup integer;
BEGIN
  IF to_regclass('public.canonical_documents') IS NULL THEN
    RAISE NOTICE 'canonical_documents absent: the Vault version index is skipped';
    RETURN;
  END IF;
  IF to_regclass('public.canonical_documents_vault_version_uq') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dup FROM (
    SELECT 1
      FROM canonical_documents
     WHERE source_refs ? 'vault_documents'
     GROUP BY organization_id, source_refs -> 'vault_documents' ->> 'nativeId'
    HAVING count(*) > 1
  ) pairs;
  IF dup > 0 THEN
    RAISE NOTICE 'canonical_documents_vault_version_uq not created: % Vault version(s) already have more than one lifecycle record. The route still returns the first; resolve the others and the next deploy creates the index.', dup;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX canonical_documents_vault_version_uq
    ON canonical_documents (organization_id, ((source_refs -> 'vault_documents' ->> 'nativeId')))
    WHERE source_refs ? 'vault_documents';
END $$;
