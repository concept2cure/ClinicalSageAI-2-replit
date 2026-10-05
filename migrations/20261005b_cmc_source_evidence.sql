-- CMC source evidence: the Vault document a CMC record was taken from
-- (2026-10-05, row D2; docs/evidence/CMC-M3-GA/2026-10-05/08-cmc-evidence-from-the-vault/).
--
-- Discovery map 2026-10-04, no-data-room-to-cmc-source-path: no CMC record
-- could cite a document. A batch's results, a specification, a stability study
-- were typed into the registers and composed into Module 3, while the
-- certificate of analysis, the stability report and the validation report they
-- came from sat in the same program's Vault with nothing recorded between them.
-- A reissued certificate superseding the one a batch was transcribed from left
-- the approved §3.2.P.5.4 reading current.
--
-- One row per link, from one CMC source (cmc_source_objects, by its key under
-- the program) to one Vault version of the same program and organisation.
-- The link records the version's content hash, version label and title as they
-- were when a person linked it, and the reason they gave. A link is removed,
-- never deleted: removal is one-way, names who removed it and requires a
-- reason. Every link and unlink is a chained audit row, written by
-- server/services/cmc/source-evidence.ts in the same transaction.
--
-- The rules, for every role:
--   Frozen:      id, organization_id, program_id, source_type, source_key,
--                vault_document_id, content_hash_at_link, version_at_link,
--                title_at_link, reason, linked_by, linked_at.
--   Write-once:  unlinked_at, unlinked_by, unlink_reason (NULL → value only).
--   DELETE:      the table's owner only, and only once the linked version is
--                gone: the tenant purge deletes the versions and their links
--                follow by cascade. A program DELETE that leaves the version is
--                refused.
--   TRUNCATE:    refused.
--
-- public, organization_id INTEGER NOT NULL (CLAUDE.md, Rule 1): the final
-- tenant sweep gives it row security. Reached by the tenant purge through
-- ON DELETE CASCADE from regulatory_programs and vault.documents.
--
-- Replays on every deploy: CREATE … IF NOT EXISTS, CREATE OR REPLACE for the
-- functions, each trigger created only when absent; no DROP.

DO $cse$
BEGIN
  IF to_regclass('vault.documents') IS NULL OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'vault.documents or regulatory_programs absent: cmc_source_evidence not created';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.cmc_source_evidence (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       INTEGER NOT NULL,
    program_id            UUID NOT NULL REFERENCES public.regulatory_programs(id) ON DELETE CASCADE,
    source_type           TEXT NOT NULL,
    source_key            TEXT NOT NULL,
    vault_document_id     UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    content_hash_at_link  TEXT NOT NULL,
    version_at_link       TEXT,
    title_at_link         TEXT,
    reason                TEXT NOT NULL,
    linked_by             INTEGER NOT NULL,
    linked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    unlinked_at           TIMESTAMPTZ,
    unlinked_by           INTEGER,
    unlink_reason         TEXT,
    CONSTRAINT cmc_source_evidence_reason_ck CHECK (length(btrim(reason)) > 0),
    CONSTRAINT cmc_source_evidence_unlink_ck
      CHECK ((unlinked_at IS NULL) = (unlink_reason IS NULL) AND (unlinked_at IS NULL) = (unlinked_by IS NULL))
  );

  -- One live link between a source and a version.
  CREATE UNIQUE INDEX IF NOT EXISTS cmc_source_evidence_live_uq
    ON public.cmc_source_evidence (organization_id, program_id, source_key, vault_document_id)
    WHERE unlinked_at IS NULL;
  CREATE INDEX IF NOT EXISTS cmc_source_evidence_program_idx
    ON public.cmc_source_evidence (organization_id, program_id);
  CREATE INDEX IF NOT EXISTS cmc_source_evidence_document_idx
    ON public.cmc_source_evidence (vault_document_id);

  CREATE OR REPLACE FUNCTION public.cmc_source_evidence_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
    col text;
  BEGIN
    FOREACH col IN ARRAY ARRAY['id', 'organization_id', 'program_id', 'source_type', 'source_key',
                               'vault_document_id', 'content_hash_at_link', 'version_at_link',
                               'title_at_link', 'reason', 'linked_by', 'linked_at'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: cmc_source_evidence.% of link % is recorded and cannot change (21 CFR 11.10(e)). Remove the link and link the document again.', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    FOREACH col IN ARRAY ARRAY['unlinked_at', 'unlinked_by', 'unlink_reason'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) AND jsonb_typeof(o -> col) <> 'null' THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: evidence link % was removed and its removal cannot change (21 CFR 11.10(e)).', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cmc_source_evidence_delete_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    -- The table's owner, once the linked version is gone: the purge's cascade
    -- from vault.documents. A foreign key's cascade runs as the owner, so the
    -- version check is what refuses a runtime-role DELETE of the program
    -- cascading here while the version survives.
    IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID)
       AND NOT EXISTS (SELECT 1 FROM vault.documents x WHERE x.id = OLD.vault_document_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: evidence link % is recorded and cannot be deleted (21 CFR 11.10(c)). Remove it, with a reason, instead.', OLD.id
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.cmc_source_evidence_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: cmc_source_evidence is a record of where CMC data came from and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cmc_source_evidence'::regclass AND tgname = 'cmc_source_evidence_guard') THEN
    CREATE TRIGGER cmc_source_evidence_guard
      BEFORE UPDATE ON public.cmc_source_evidence
      FOR EACH ROW EXECUTE FUNCTION public.cmc_source_evidence_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cmc_source_evidence'::regclass AND tgname = 'cmc_source_evidence_delete_guard') THEN
    CREATE TRIGGER cmc_source_evidence_delete_guard
      BEFORE DELETE ON public.cmc_source_evidence
      FOR EACH ROW EXECUTE FUNCTION public.cmc_source_evidence_delete_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cmc_source_evidence'::regclass AND tgname = 'cmc_source_evidence_truncate_guard') THEN
    CREATE TRIGGER cmc_source_evidence_truncate_guard
      BEFORE TRUNCATE ON public.cmc_source_evidence
      FOR EACH STATEMENT EXECUTE FUNCTION public.cmc_source_evidence_truncate_guard();
  END IF;
END $cse$;
