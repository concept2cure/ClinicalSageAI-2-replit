-- =============================================================================
-- 20261029h_capa_source_deviation.sql — a CAPA may be raised from a deviation
-- (D2, 2026-10-29, P-57)
-- =============================================================================
-- WHY. P-57 gives deviations their own record (20261029g_qc_deviations.sql).
-- A deviation is the commonest source of a GMP CAPA, and capa_records.source
-- is held to a closed list (capa_source_chk, migrations/20260504_capa_mdr.sql)
-- that has no 'deviation'. A CAPA raised from one had to say "other".
--
-- WHAT. capa_source_chk gains 'deviation', the same list
-- shared/schema/capa-mdr.ts CAPA_SOURCES holds. 20260504 defines the
-- constraint inside CREATE TABLE IF NOT EXISTS, so it is created only on a
-- fresh database and never re-imposed; this file replaces it only when its
-- definition does not yet admit 'deviation' (pg_get_constraintdef), so a
-- replay never re-validates (Rule 1's corollary). It only widens: every row the
-- old list admitted, the new one admits.
--
-- Rule 1 (CLAUDE.md): re-runs on every deploy; a no-op once applied. No table
-- is created; no data is changed.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'capa_source_chk'
       AND c.conrelid = 'public.capa_records'::regclass
       AND pg_get_constraintdef(c.oid) NOT LIKE '%''deviation''%'
  ) THEN
    ALTER TABLE public.capa_records DROP CONSTRAINT capa_source_chk;
    ALTER TABLE public.capa_records ADD CONSTRAINT capa_source_chk CHECK (source IN
      ('complaint','internal_audit','external_audit','mdr','nonconformance',
       'management_review','supplier','inspection_finding','risk_review',
       'trend_signal','deviation','other'));
  END IF;
END $$;
