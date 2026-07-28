-- authoring_documents.c2c_document_id — bind an authored document to the
-- governed document it is authoring.
--
-- ── The split this closes ────────────────────────────────────────────────────
-- The platform has two document stores and they do not model the same thing:
--
--   c2c_documents        a regulatory filing. Bound to a project, a document
--                        class (IND / 510(k) / …), an agency, and the rule pack
--                        that defines its required sections. Its sections carry
--                        a BEFORE UPDATE trigger that RAISES without an actor,
--                        so Part 11 attribution cannot be bypassed by a code
--                        path that forgets.
--
--   authoring_documents  the editing surface — comments, citations, tracked
--                        changes, e-signature, freeze, export, collaboration.
--                        Rich, and until now with no idea which filing it was
--                        contributing to.
--
-- The editor a user actually reaches writes the second. The compliance spine
-- lives in the first. The same section edited in two places landed in two
-- tables with two different audit stories.
--
-- ── Direction: converge forward, never backfill ──────────────────────────────
-- c2c_documents is the system of record; the authoring stack becomes the
-- editing layer over it. This column is the join.
--
-- Existing authoring documents are NOT backfilled and cannot be: they carry no
-- doc_type, agency or rule_pack_version, and there is no honest way to derive
-- one. Inventing a regulatory class for a historical record would be a far
-- worse defect than an unbound one. They stay readable and editable, NULL here,
-- and are bound by a human the next time someone works on them.
--
-- 20260727_authoring_document_program_scope.sql already added client_program_id
-- (which project) with the same NULL-means-unbound convention. This adds which
-- governed document within that project. The pair is the binding.
--
-- ── Safety ───────────────────────────────────────────────────────────────────
-- Additive and nullable, so every existing row stays valid and no backfill
-- runs. ON DELETE SET NULL rather than CASCADE: deleting a governed document
-- must not silently destroy the authored content and its comment history —
-- unbinding is recoverable, deletion is not.
--
-- Guarded on BOTH tables. deploy-migrate runs with stopOnFirstFailure, so an
-- unguarded reference on a database missing either bundle would abort the whole
-- migration set.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS authoring_documents_c2c_document_idx;
--   ALTER TABLE authoring_documents DROP COLUMN IF EXISTS c2c_document_id;
-- Rollback loses only the binding, not the documents.

DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NULL
     OR to_regclass('public.c2c_documents') IS NULL THEN
    RAISE NOTICE 'authoring_documents or c2c_documents absent; skipping governed binding';
    RETURN;
  END IF;

  ALTER TABLE public.authoring_documents
    ADD COLUMN IF NOT EXISTS c2c_document_id text;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'authoring_documents_c2c_document_fkey'
  ) THEN
    ALTER TABLE public.authoring_documents
      ADD CONSTRAINT authoring_documents_c2c_document_fkey
      FOREIGN KEY (c2c_document_id)
      REFERENCES public.c2c_documents (id) ON DELETE SET NULL;
  END IF;

  -- The access path that matters: "what is authored against this filing?"
  CREATE INDEX IF NOT EXISTS authoring_documents_c2c_document_idx
    ON public.authoring_documents (c2c_document_id)
    WHERE c2c_document_id IS NOT NULL;
END $$;
