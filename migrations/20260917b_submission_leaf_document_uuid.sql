-- ============================================================================
-- submission_leaves.document_uuid — address a uuid-keyed document from a leaf
-- ============================================================================
--
-- THE PROBLEM. `submission_leaves.document_id` is INTEGER and the reference is
-- polymorphic over stores with different key types. `vault.documents.id` is a
-- UUID, so a vault document could not be named by a leaf at all — the gap
-- VAULT_DATA_ROOM_ASSESSMENT §4.5 calls the most important parity gap on its
-- list: a customer can upload a CSR and then cannot put it in the NDA.
--
-- WHAT THIS IS NOT. It is NOT widening `document_id`. That is Option A of
-- docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md, weighed and REJECTED on
-- 2026-08-13 because it rewrites `submission_leaves` and
-- `concept2cure_artifacts` — "the two tables where a migration error is least
-- recoverable" — and because ~128 `Number()` coercion sites each fail by
-- yielding NaN, resolving to no leaf, and shipping an incomplete sequence with
-- a valid-looking checksum. That column is untouched here and keeps its type,
-- exactly as §4 of that contract requires.
--
-- WHAT THIS IS. One nullable sibling column. Additive: no rewrite, no coercion
-- site, no backfill, no existing row changed. Every leaf written before this
-- has `document_uuid IS NULL` and continues to resolve through `document_id`
-- precisely as before. A uuid-keyed store is named by the new column; an
-- integer-keyed one by the old. A leaf never needs both, and the pair is the
-- honest shape of a polymorphic reference across two key spaces.
--
-- WHY NOT THE ALIAS MAP. `c2c_document_aliases` remains the identity map — what
-- a document is called in each store, for lineage. It could have carried this
-- (alias the leaf, put the vault uuid in `canonical_id`), and that was weighed:
-- it needs no schema change, but it makes `document_id` hold the leaf's OWN id,
-- which is clever rather than obvious, and it puts a lookup in front of every
-- resolution. Adjudicated 2026-09-17 in favour of the explicit column. The
-- alias map keeps its job; this column is placement, which the contract is
-- explicit does NOT belong in it.
--
-- NULLABLE, AND NO CHECK PAIRING IT WITH `document_table`. A CHECK of the shape
-- "vault leaves must have a uuid" would have to name tables, which is exactly
-- the vocabulary `server/services/ectd/leaf-document-tables.ts` owns and keeps
-- in step with the resolver's real branches. Splitting that rule across a
-- migration and a module is how the two drift; the write boundary
-- (`upsertLeaf`) enforces it in one place, against that vocabulary.
--
-- Additive and IF NOT EXISTS-guarded, so it re-runs cleanly on every deploy
-- (CLAUDE.md RULE 1). It drops nothing.
--
-- ROLLBACK
--   ALTER TABLE public.submission_leaves DROP COLUMN IF EXISTS document_uuid;
-- Rollback loses the ability to name a uuid-keyed document; every leaf that
-- pointed at one becomes unresolvable and is surfaced as such, which is the
-- state before this column existed. No integer-addressed leaf is affected.
-- ============================================================================

DO $leaf_document_uuid$
BEGIN
  IF to_regclass('public.submission_leaves') IS NULL THEN
    RAISE NOTICE 'submission_leaves absent — document_uuid skipped';
    RETURN;
  END IF;

  ALTER TABLE public.submission_leaves ADD COLUMN IF NOT EXISTS document_uuid UUID;

  -- Mirrors idx_subleaves_document, which serves the integer half of the same
  -- polymorphic reference. Partial: the column is NULL on every leaf that names
  -- an integer-keyed store, which is all of them today.
  CREATE INDEX IF NOT EXISTS idx_subleaves_document_uuid
    ON public.submission_leaves (document_table, document_uuid)
    WHERE document_uuid IS NOT NULL;

  EXECUTE $q$COMMENT ON COLUMN public.submission_leaves.document_uuid IS
    'The uuid half of the polymorphic document reference, for stores whose key is a UUID (vault.documents). NULL for integer-keyed stores, which use document_id. A leaf never needs both. Enforced at the write boundary (upsertLeaf) against server/services/ectd/leaf-document-tables.ts, not by a CHECK, so the table vocabulary lives in one place.'$q$;
END
$leaf_document_uuid$;
