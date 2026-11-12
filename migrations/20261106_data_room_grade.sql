-- =============================================================================
-- 20261106_data_room_grade.sql (S2, the data room catalog, 2026-11-06)
--
-- WHY. The founder, 2026-11-06: the data room's items are "graded", and a
-- project "subscribes" to them. Nothing graded a capture, and a project could
-- pin a Vault document, an artifact, a precedent or a guidance as evidence but
-- not a data-room capture.
--
-- WHAT.
--   * Five nullable columns on cre_evidence_sources: grade (A-D), grade_score
--     (0-100), grade_basis (the criteria, each with its points and the fact it
--     read, and the facts' fingerprint), grade_engine, graded_at. Written only
--     by server/services/clinical-regulatory-evidence/data-room-grade.ts, a
--     deterministic engine (RULE 2), and only when the facts changed. Derived
--     data: the capture guard (20261001) leaves them mutable; the record (the
--     checksum, the capture, its supersession) is untouched.
--   * c2c_pinned_ev_kind_check admits 'data_room' (a capture a project uses).
--     The creator (migrations/20260529_phase10_schema.sql, fresh installs only)
--     is amended in place to the same list; here the CHECK is replaced only
--     when its live definition differs (RULE 1, first corollary), NOT VALID so
--     a replay never scans the table. It only widens.
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS; the CHECK
-- replaced conditionally on pg_get_constraintdef; no table, no DROP of
-- anything this set creates elsewhere. Both tables are public with an existing
-- tenant policy (cre_evidence_sources: organization_id; the pinned evidence:
-- derived through its project, scripts/ci/unkeyed-request-tables-baseline.json).
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources absent - grade columns skipped';
  ELSE
    ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS grade        TEXT;
    ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS grade_score  INTEGER;
    ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS grade_basis  JSONB;
    ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS grade_engine TEXT;
    ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS graded_at    TIMESTAMPTZ;
  END IF;

  IF to_regclass('public.c2c_project_pinned_evidence') IS NULL THEN
    RAISE NOTICE 'c2c_project_pinned_evidence absent - kind check skipped';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.c2c_project_pinned_evidence'::regclass AND conname = 'c2c_pinned_ev_kind_check'
       AND pg_get_constraintdef(oid) LIKE $def$CHECK ((evidence_kind = ANY (ARRAY['artifact'::text, 'vault_doc'::text, 'rim_precedent'::text, 'guidance'::text, 'data_room'::text])))%$def$
  ) THEN
    ALTER TABLE public.c2c_project_pinned_evidence DROP CONSTRAINT IF EXISTS c2c_pinned_ev_kind_check;
    ALTER TABLE public.c2c_project_pinned_evidence
      ADD CONSTRAINT c2c_pinned_ev_kind_check
      CHECK (evidence_kind IN ('artifact','vault_doc','rim_precedent','guidance','data_room')) NOT VALID;
  END IF;
END
$mig$;
