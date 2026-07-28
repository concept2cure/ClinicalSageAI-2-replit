-- ─────────────────────────────────────────────────────────────────────────────
-- eCTD REGULATORY AUDIT CONTEXT
--
-- Change:      Add created_at / updated_at to c2c_document_sections.
-- Regulation:  21 CFR Part 11 §11.10(e) — time-stamped audit trails for record
--              changes. The section table recorded no time of change at all.
-- Records:     c2c_document_sections (CTD section bodies and their status).
-- Reversible:  Yes (DROP COLUMN), but dropping them re-breaks four shipped
--              queries — see below.
--
-- ── WHY: FOUR SHIPPED QUERIES REFERENCE A COLUMN THAT DOES NOT EXIST ─────────
-- migrations/20260528_phase9_document_schema.sql:88-112 creates
-- c2c_document_sections with fifteen columns. None of them is updated_at or
-- created_at. These four read or write one anyway:
--
--   server/routes/c2c/projects.ts:334      MAX(ds.updated_at) AS last_updated
--                                          → GET /:id/workstreams
--   server/routes/c2c/projects.ts:371,377  ds.updated_at, ORDER BY ds.updated_at
--                                          → GET /:id/drafts
--   server/routes/c2c/project-vault.ts:365 ds.updated_at
--                                          → GET /api/c2c/project-vault/:id
--   server/routes/c2c/documents.ts:441     SET updated_at = now()
--                                          → the UPDATE branch of
--                                            PATCH /documents/:id/sections/:key
--
-- Postgres rejects an unknown column at PLAN time, so this is not an
-- empty-result edge case — it is an unconditional 42703. Verified by executing
-- each statement against a database built from the real migration:
--
--   ERROR:  column ds.updated_at does not exist
--   HINT:   Perhaps you meant to reference the column "d.updated_at".
--
-- The hint names the cause: c2c_documents HAS updated_at, c2c_document_sections
-- never did, and the alias is one character apart.
--
-- CONSEQUENCE. ProjectHome calls /workstreams and /drafts on every render
-- (client/.../ProjectHome.tsx:827-831), so both panels have always 500'd —
-- rendered as an error card, not as "nothing here yet". The vault read fails the
-- moment any document exists. And documents.ts's UPDATE branch — the canonical
-- Part 11 section save, the one that is transactional and writes an audit row —
-- fails on the first RE-save of any section. It has not been hit yet only
-- because nothing creates sections; it would fail the instant anything did.
--
-- ── WHY NO TRIGGER ───────────────────────────────────────────────────────────
-- Tempting, but wrong here. documents.ts:441 already sets updated_at explicitly
-- inside its transaction, and c2c_document_sections already carries a BEFORE
-- UPDATE trigger — c2c_snapshot_section_version(), which enforces Part 11
-- attribution by refusing an unattributed content change. A second BEFORE UPDATE
-- trigger would compete with it for ordering on the same rows. The column
-- defaults to now() on insert and the writer maintains it on update.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run, and a no-op on any
-- database that already has the columns.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.c2c_document_sections') IS NULL THEN
        RAISE NOTICE 'c2c_document_sections is not present on this database; nothing to add.';
        RETURN;
    END IF;

    ALTER TABLE public.c2c_document_sections
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE public.c2c_document_sections
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    -- Serves /drafts' access pattern: newest-changed first within a document set.
    CREATE INDEX IF NOT EXISTS c2c_doc_sections_updated_idx
      ON public.c2c_document_sections (updated_at DESC);
END $$;

COMMIT;
