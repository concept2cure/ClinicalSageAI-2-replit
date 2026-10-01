-- Vault document relationships (plan critique 15, row D2, 2026-10-01).
--
-- Amended in place 2026-10-01 (review annotations, docs/evidence/D2-VAULT-ANNOTATIONS/2026-10-01/):
-- the delete guard admitted any DELETE by the table owner. A foreign key's
-- cascade runs as the owner, so a runtime-role DELETE of a regulatory_programs
-- row cascaded here and erased relationships while both versions survived.
-- DELETE is now admitted to the owner only once either end's version is gone
-- (the purge's cascade from vault.documents). Function body only; no table,
-- constraint or trigger change, no DROP.
--
-- A Vault document names the documents that support it, that it references,
-- or that it is based on: Veeva's document relationships, and the replacement
-- for `parentDocumentId`, which VR-05 refused on upload because it took any
-- UUID unchecked and no client sent it.
--
-- One row per relationship, from one Vault version to another of the same
-- organisation. A relationship is removed, never deleted: removal is one-way,
-- names who removed it and requires a reason. Every relate and unrelate is a
-- chained audit row, written by server/services/vault/vault-relationships.ts in
-- the same transaction.
--
-- The rules, for every role:
--   Frozen:      id, organization_id, program_id, from_document_id,
--                to_document_id, relationship_type, note, created_by, created_at.
--   Write-once:  removed_at, removed_by, removal_reason (NULL → value only).
--   DELETE:      the table's owner only, and only once either end's version is
--                gone: the tenant purge deletes the versions and their
--                relationships follow by cascade. No session setting admits a
--                DELETE, and a program DELETE that leaves the versions is refused.
--   TRUNCATE:    refused.
--
-- public, organization_id INTEGER NOT NULL (CLAUDE.md, Rule 1): the final
-- tenant sweep gives it row security. Reached by the tenant purge through
-- ON DELETE CASCADE from regulatory_programs and vault.documents.
--
-- Replays on every deploy: CREATE … IF NOT EXISTS, CREATE OR REPLACE for the
-- functions, each trigger created only when absent; no DROP.

DO $rel$
BEGIN
  IF to_regclass('vault.documents') IS NULL OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'vault.documents or regulatory_programs absent: vault_document_relationships not created';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.vault_document_relationships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   INTEGER NOT NULL,
    program_id        UUID NOT NULL REFERENCES public.regulatory_programs(id) ON DELETE CASCADE,
    from_document_id  UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    to_document_id    UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL
      CONSTRAINT vault_document_relationships_type_ck CHECK (relationship_type IN ('supporting', 'references', 'based_on')),
    note              TEXT,
    created_by        INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at        TIMESTAMPTZ,
    removed_by        INTEGER,
    removal_reason    TEXT,
    CONSTRAINT vault_document_relationships_not_self_ck CHECK (from_document_id <> to_document_id),
    CONSTRAINT vault_document_relationships_removal_ck CHECK ((removed_at IS NULL) = (removal_reason IS NULL))
  );

  -- One live relationship of a kind between two versions.
  CREATE UNIQUE INDEX IF NOT EXISTS vault_document_relationships_live_uq
    ON public.vault_document_relationships (from_document_id, to_document_id, relationship_type)
    WHERE removed_at IS NULL;
  CREATE INDEX IF NOT EXISTS vault_document_relationships_to_idx
    ON public.vault_document_relationships (to_document_id);
  CREATE INDEX IF NOT EXISTS vault_document_relationships_org_idx
    ON public.vault_document_relationships (organization_id);

  CREATE OR REPLACE FUNCTION public.vault_document_relationships_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
    col text;
  BEGIN
    FOREACH col IN ARRAY ARRAY['id', 'organization_id', 'program_id', 'from_document_id', 'to_document_id',
                               'relationship_type', 'note', 'created_by', 'created_at'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault_document_relationships.% of relationship % is recorded and cannot change (21 CFR 11.10(e)). Remove it and relate the documents again.', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    FOREACH col IN ARRAY ARRAY['removed_at', 'removed_by', 'removal_reason'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) AND jsonb_typeof(o -> col) <> 'null' THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: relationship % was removed and its removal cannot change (21 CFR 11.10(e)).', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.vault_document_relationships_delete_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    -- The table's owner, once either end's version is gone: the purge's
    -- cascade from vault.documents. A foreign key's cascade runs as the owner,
    -- so the version check is what refuses a runtime-role DELETE of the program
    -- cascading here while both versions survive. Nothing a session can set
    -- changes current_user or the versions' existence.
    IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID)
       AND (NOT EXISTS (SELECT 1 FROM vault.documents x WHERE x.id = OLD.from_document_id)
            OR NOT EXISTS (SELECT 1 FROM vault.documents x WHERE x.id = OLD.to_document_id)) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: relationship % is recorded and cannot be deleted (21 CFR 11.10(c)). Remove it, with a reason, instead.', OLD.id
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.vault_document_relationships_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault_document_relationships is a record of how documents relate and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_document_relationships'::regclass AND tgname = 'vault_document_relationships_guard') THEN
    CREATE TRIGGER vault_document_relationships_guard
      BEFORE UPDATE ON public.vault_document_relationships
      FOR EACH ROW EXECUTE FUNCTION public.vault_document_relationships_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_document_relationships'::regclass AND tgname = 'vault_document_relationships_delete_guard') THEN
    CREATE TRIGGER vault_document_relationships_delete_guard
      BEFORE DELETE ON public.vault_document_relationships
      FOR EACH ROW EXECUTE FUNCTION public.vault_document_relationships_delete_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_document_relationships'::regclass AND tgname = 'vault_document_relationships_truncate_guard') THEN
    CREATE TRIGGER vault_document_relationships_truncate_guard
      BEFORE TRUNCATE ON public.vault_document_relationships
      FOR EACH STATEMENT EXECUTE FUNCTION public.vault_document_relationships_truncate_guard();
  END IF;
END $rel$;
