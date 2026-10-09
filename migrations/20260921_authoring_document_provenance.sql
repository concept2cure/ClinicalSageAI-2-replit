-- ═══════════════════════════════════════════════════════════════════════════
-- authoring_documents.provenance — where an authoring document came from
-- (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md "Provenance is honest")
--
-- PROBLEM THIS FIXES
-- The authoring store is the one document store for the launch catalog, and
-- an AnA-drafted document is an authoring document like any other — but the
-- row could not say so. authoring_documents carries who created it
-- (created_by, a user id) and nothing about HOW: a document the model drafted
-- in a conversation, a seeded demo document and a human-authored one were
-- indistinguishable, and a canvas that says "AnA drafted this" needs a fact to
-- point at, not a guess from the title.
--
-- DECISION
-- One nullable JSONB column, written at create time by
-- server/services/authoring/authoring-documents.ts (createDocumentFromDraft)
-- and returned by GET /api/authoring/docs/:docId. Shape, validated in code:
--
--   { "source": "ana" | "seed" | "import",
--     "conversationId"?: string, "turnId"?: string,
--     "model"?: string,            -- the model id the gateway reported
--     "note"?: string,
--     "recordedAt": ISO-8601 }
--
-- NULL means "a person authored this through the editor" — the existing
-- documents keep that meaning without a backfill, because nothing can prove
-- otherwise about them. Nothing claims model origin without a model: `model`
-- is present only when the gateway reported one.
--
-- SAFETY (CLAUDE.md Rule 1)
-- Additive and idempotent; re-runs on every deploy as a no-op. No existing
-- column is altered and no row is rewritten. Guarded on to_regclass exactly
-- like migrations/20260727_authoring_document_program_scope.sql: the table
-- lives in db/migrations/ and is provisioned by scripts/db/authoring-subsystem.mjs
-- ahead of this set, so on a fresh database the ALTER applies for real; on a
-- database without the authoring bundle it no-ops with a NOTICE.
--
-- ROLLBACK
--   ALTER TABLE authoring_documents DROP COLUMN IF EXISTS provenance;
-- Rollback loses only the provenance, not the documents.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NULL THEN
    RAISE NOTICE 'authoring_documents is not present; skipping provenance. Apply db/migrations/20260725_authoring_document_loop_tables.sql first, then re-run this migration (it is idempotent).';
    RETURN;
  END IF;

  ALTER TABLE authoring_documents
    ADD COLUMN IF NOT EXISTS provenance JSONB;

  COMMENT ON COLUMN authoring_documents.provenance IS
    'How this document came to exist: {source: ana|seed|import, conversationId?, turnId?, model?, note?, recordedAt}. NULL = authored by a person through the editor. Written once at create time; see server/services/authoring/authoring-documents.ts.';
END $$;
