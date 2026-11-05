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
--
-- AMENDED IN PLACE 2026-11-05 (F1, trunk sweep): the file now no-ops when
-- public.capa_records is absent. Its creator, 20260504_capa_mdr.sql, is
-- overlay-only and not in C2C_MIGRATION_FILES, so a database that never got the
-- overlay has no capa_records, and the cast 'public.capa_records'::regclass
-- raised 42P01 there: the file failed, and with it every deploy, since the set
-- re-runs every file. tests/schema-contract/tenant-isolation-sweep.contract.test.ts
-- found it ("pass 1: ... relation "public.capa_records" does not exist"). The
-- guard is the one this creator's other companion uses
-- (20260919_capa_code_uniqueness_per_program.sql: "Absent table ... nothing to
-- convert"). Nothing is removed; where the table exists, the file does what it
-- did. Recorded in the journal as drift on databases that ran the old text.
-- =============================================================================

DO $$
BEGIN
  -- Absent table (a database that never got the CAPA overlay): nothing to widen.
  -- The creator owns creation; this file only widens.
  IF to_regclass('public.capa_records') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'capa_source_chk'
       AND c.conrelid = to_regclass('public.capa_records')
       AND pg_get_constraintdef(c.oid) NOT LIKE '%''deviation''%'
  ) THEN
    ALTER TABLE public.capa_records DROP CONSTRAINT capa_source_chk;
    ALTER TABLE public.capa_records ADD CONSTRAINT capa_source_chk CHECK (source IN
      ('complaint','internal_audit','external_audit','mdr','nonconformance',
       'management_review','supplier','inspection_finding','risk_review',
       'trend_signal','deviation','other'));
  END IF;
END $$;
