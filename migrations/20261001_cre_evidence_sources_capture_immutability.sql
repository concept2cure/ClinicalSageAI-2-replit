-- VR-16 (D2, with D5, 2026-10-01): the data room's capture record is append-only.
--
-- cre_evidence_sources is the data room's intake record: what was captured,
-- with which bytes (checksum), and which capture it revises
-- (previous_version_id, is_current). The checksum was "written once" only by
-- convention (migrations/20260829_cre_source_versioning.sql), and any UPDATE
-- could rewrite it, re-point a revision, or bring a retired capture back. Then
-- "filed" (a checksum join against the Vault) and "changed since cited" could
-- be falsified after the fact.
--
-- The rules, for every role but the table's owner:
--   Frozen:      id, organization_id, source_type, created_at.
--   Write-once:  checksum, previous_version_id, client_program_id,
--                client_workspace_id, deleted_at, and (VR-16b) created_by and
--                stored_artifact_ref. NULL → value only; value → other value,
--                or back to NULL, is refused.
--   One-way:     is_current may go TRUE → FALSE (a revision retires its
--                predecessor: createSupersedingSource), never back.
--   TRUNCATE is refused. DELETE is refused unless the caller is the table's
--   owner (no purge deletes this table today; one that does extends VR-07's
--   owner-run function, amended in place).
--   Everything else (title, metadata, extraction and ingestion status,
--   updated_at …) is mutable and governed by its writer.
--
-- The writers, enumerated before this landed: createSource (INSERT) and
-- createSupersedingSource (UPDATE … SET is_current = FALSE), both in
-- server/services/clinical-regulatory-evidence/evidence-spine.service.ts. The
-- data room's adopt creates a new source through createSource. No migration
-- UPDATEs this table. Each writer's suite stays green.
--
-- Replays on every deploy (CLAUDE.md, Rule 1): CREATE OR REPLACE for the
-- functions, each trigger created only when absent; no table, no column, no
-- DROP.
--
-- AMENDED 2026-10-01 (VR-16b, rows D2 and D5; plan critique 14), in place as
-- Rule 1 asks: a capture now records who made it. Adds
-- `created_by INTEGER` (ADD COLUMN IF NOT EXISTS; NULL for captures made
-- before this, and for system writes such as an ingested CRL), written by
-- createSource from the session that captured the file. `created_by` and
-- `stored_artifact_ref` join the write-once list. No writer changes either
-- after the INSERT (the one UPDATE is createSupersedingSource's is_current),
-- and a capture re-pointed at other bytes, or re-attributed, would falsify the
-- record the same way a rewritten checksum would. The capture and the
-- supersession are also written to the audit chain now, by the writers, in
-- their own transactions (data_room.capture, data_room.supersede). The
-- journal records this file as drift once; this note is why.

DO $vr16$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources not present - capture guard not installed';
    RETURN;
  END IF;

  -- Who captured the file (VR-16b). Additive; existing rows stay NULL.
  ALTER TABLE public.cre_evidence_sources ADD COLUMN IF NOT EXISTS created_by INTEGER;

  -- Columns are compared through to_jsonb so a column a given database does
  -- not carry is simply absent from the comparison rather than an error.
  CREATE OR REPLACE FUNCTION public.cre_evidence_sources_capture_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
    col text;
  BEGIN
    FOREACH col IN ARRAY ARRAY['id', 'organization_id', 'source_type', 'created_at'] LOOP
      IF o ? col AND (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: cre_evidence_sources.% of source % is recorded and cannot change (21 CFR 11.10(e)).', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    FOREACH col IN ARRAY ARRAY['checksum', 'previous_version_id', 'client_program_id',
                               'client_workspace_id', 'deleted_at', 'created_by',
                               'stored_artifact_ref'] LOOP
      IF o ? col AND (o -> col) IS DISTINCT FROM (n -> col) THEN
        CONTINUE WHEN jsonb_typeof(o -> col) = 'null';
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: cre_evidence_sources.% of source % is set once and cannot be changed or cleared (21 CFR 11.10(e)). Capture the file again instead.', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    IF o ? 'is_current' AND (o -> 'is_current') = 'false'::jsonb AND (n -> 'is_current') = 'true'::jsonb THEN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: source % was superseded and cannot be made current again (21 CFR 11.10(e)).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;

    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cre_evidence_sources_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: cre_evidence_sources holds the data room''s capture record and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cre_evidence_sources_delete_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: source % is part of the data room''s capture record and cannot be deleted (21 CFR 11.10(c)).', OLD.id
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cre_evidence_sources'::regclass AND tgname = 'cre_evidence_sources_capture_guard'
  ) THEN
    CREATE TRIGGER cre_evidence_sources_capture_guard
      BEFORE UPDATE ON public.cre_evidence_sources
      FOR EACH ROW EXECUTE FUNCTION public.cre_evidence_sources_capture_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cre_evidence_sources'::regclass AND tgname = 'cre_evidence_sources_truncate_guard'
  ) THEN
    CREATE TRIGGER cre_evidence_sources_truncate_guard
      BEFORE TRUNCATE ON public.cre_evidence_sources
      FOR EACH STATEMENT EXECUTE FUNCTION public.cre_evidence_sources_truncate_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.cre_evidence_sources'::regclass AND tgname = 'cre_evidence_sources_delete_guard'
  ) THEN
    CREATE TRIGGER cre_evidence_sources_delete_guard
      BEFORE DELETE ON public.cre_evidence_sources
      FOR EACH ROW EXECUTE FUNCTION public.cre_evidence_sources_delete_guard();
  END IF;
END $vr16$;
