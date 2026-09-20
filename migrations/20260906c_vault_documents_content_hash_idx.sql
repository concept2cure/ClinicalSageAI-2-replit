-- ============================================================================
-- vault.documents — index the per-program content_hash lookup
-- ============================================================================
--
-- WHAT THIS IS FOR. The Vault surface answers, for every source in a program's
-- Data Room, "are these bytes already filed in the vault?" — the `filed` stage
-- in server/routes/c2c/project-vault.ts. That question used to be answered in
-- application memory: the route fetched EVERY vault.documents row for the
-- program, built a Set of their content hashes, and probed it. Two costs, both
-- growing with the vault:
--
--   1. every tree render materialised the whole cabinet, and
--   2. the vault has no index on content_hash at all, so moving the probe into
--      SQL — which is what makes the answer correct once the row fetch is
--      capped — would have replaced a memory blow-up with a sequential scan
--      per render.
--
-- This index is what makes the SQL form cheap. Leading with program_id matches
-- the predicate the route actually issues (program, then `content_hash = ANY`),
-- and mirrors the two indexes migrations/20260823_vault_document_placement.sql
-- already adds for the same surface's other two reads.
--
-- PARTIAL on deleted_at IS NULL: every read of this table carries that
-- predicate, and a soft-deleted document is not filed. Keeping tombstones out
-- keeps the index proportional to the live vault rather than to its history.
--
-- Additive and IF NOT EXISTS-guarded, so it re-runs cleanly on every deploy
-- (CLAUDE.md RULE 1). It creates no column and drops nothing.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS vault.vault_documents_program_content_hash_idx;
-- Rollback loses only the access path; the query stays correct and gets slow.
-- ============================================================================

DO $vault_content_hash$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents absent — content_hash index skipped';
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS vault_documents_program_content_hash_idx
    ON vault.documents (program_id, content_hash)
    WHERE deleted_at IS NULL;
END
$vault_content_hash$;
