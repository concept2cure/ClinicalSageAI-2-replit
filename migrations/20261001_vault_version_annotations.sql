-- Review annotations on a Vault version (plan critique 15, rows D2 and D5, 2026-10-01).
--
-- A reviewer annotates one Vault version with a comment or a change request,
-- anchored to the whole version, to a page of a version whose page count is
-- recorded, or to a passage of its extracted text. Others reply. An open
-- annotation is resolved with a note, or retracted by its author with a
-- reason; never both. Every act is a chained audit row written by
-- server/services/vault/vault-annotations.ts in the same transaction.
-- Evidence: docs/evidence/D2-VAULT-ANNOTATIONS/2026-10-01/.
--
-- The rules, for every role:
--   Posted:      checked here, not only by the writer. The version must exist,
--                be live, belong to the program and to the organisation; the
--                stored content hash, the body's SHA-256, a passage's position
--                in the stored text (in characters, i.e. code points) and that
--                text's SHA-256, and a page against the recorded page count
--                are all re-checked. A reply goes under an open root of the
--                same version. An annotation is posted open.
--   Frozen:      the words, their SHA-256, the anchor, the author and when.
--   Write-once:  the resolution and the retraction (NULL -> value only); one
--                outcome; only its author retracts; a resolved annotation, or a
--                reply under a closed root, is not retracted.
--   DELETE:      only by the table's owner, and only once the version is gone:
--                the tenant purge deletes vault.documents and the rows follow by
--                cascade. A foreign key's cascade runs as the table owner, so an
--                owner check alone would admit a runtime-role DELETE of the
--                program cascading here while the version survives; the
--                version check refuses it. pg_trigger_depth() is never read: a
--                session can raise it with a trigger of its own
--                (docs/evidence/D5/2026-10-01-trigger-depth-bypass/).
--   TRUNCATE:    refused.
--
-- public, organization_id INTEGER NOT NULL (CLAUDE.md, Rule 1): the final
-- tenant sweep gives it row security. Reached by the tenant purge through
-- ON DELETE CASCADE from vault.documents and regulatory_programs.
--
-- Replays on every deploy: CREATE … IF NOT EXISTS, CREATE OR REPLACE for the
-- functions, each trigger created only when absent; no DROP. A later change to
-- a CHECK here is an in-place, conditional replacement (Rule 1, corollary 1).

DO $vva$
BEGIN
  IF to_regclass('vault.documents') IS NULL OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'vault.documents or regulatory_programs absent: vault_version_annotations not created';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.vault_version_annotations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           INTEGER NOT NULL,
    program_id                UUID NOT NULL REFERENCES public.regulatory_programs(id) ON DELETE CASCADE,
    document_id               UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    parent_id                 UUID REFERENCES public.vault_version_annotations(id) ON DELETE CASCADE,
    kind                      TEXT NOT NULL CONSTRAINT vva_kind_ck CHECK (kind IN ('comment', 'request_changes')),
    body                      TEXT NOT NULL CONSTRAINT vva_body_ck CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
    body_sha256               TEXT NOT NULL CONSTRAINT vva_body_sha_ck CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
    content_hash              TEXT NOT NULL,
    lifecycle_stage           TEXT,
    anchor_kind               TEXT CONSTRAINT vva_anchor_kind_ck CHECK (anchor_kind IN ('document', 'page', 'text')),
    page_number               INTEGER,
    pages_at_post             INTEGER,
    quote                     TEXT,
    char_start                INTEGER,
    char_end                  INTEGER,
    text_sha256               TEXT,
    author_id                 INTEGER NOT NULL,
    author_name               TEXT NOT NULL CONSTRAINT vva_author_name_ck CHECK (btrim(author_name) <> ''),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at               TIMESTAMPTZ,
    resolved_by               INTEGER,
    resolved_by_name          TEXT,
    resolution_note           TEXT,
    -- No foreign key: a referential action would fight the write-once and
    -- delete guards during the purge. The update guard checks it.
    addressed_in_document_id  UUID,
    retracted_at              TIMESTAMPTZ,
    retracted_by              INTEGER,
    retracted_by_name         TEXT,
    retraction_reason         TEXT,
    CONSTRAINT vva_root_anchor_ck CHECK ((parent_id IS NULL) = (anchor_kind IS NOT NULL)),
    CONSTRAINT vva_reply_kind_ck CHECK (parent_id IS NULL OR kind = 'comment'),
    CONSTRAINT vva_anchor_shape_ck CHECK (
         ((anchor_kind IS NULL OR anchor_kind = 'document') AND page_number IS NULL AND pages_at_post IS NULL
           AND quote IS NULL AND char_start IS NULL AND char_end IS NULL AND text_sha256 IS NULL)
      OR (anchor_kind = 'page' AND page_number >= 1 AND pages_at_post >= page_number
           AND quote IS NULL AND char_start IS NULL AND char_end IS NULL AND text_sha256 IS NULL)
      OR (anchor_kind = 'text' AND char_length(quote) BETWEEN 1 AND 2000 AND char_start >= 0
           AND char_end = char_start + char_length(quote) AND text_sha256 ~ '^[0-9a-f]{64}$'
           AND page_number IS NULL AND pages_at_post IS NULL)),
    CONSTRAINT vva_resolution_ck CHECK (
         (resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolved_by_name IS NULL)
     AND (resolved_at IS NULL) = (resolution_note IS NULL) AND (resolved_at IS NULL OR parent_id IS NULL)
     AND (addressed_in_document_id IS NULL OR resolved_at IS NOT NULL)),
    CONSTRAINT vva_retraction_ck CHECK (
         (retracted_at IS NULL) = (retracted_by IS NULL) AND (retracted_at IS NULL) = (retracted_by_name IS NULL)
     AND (retracted_at IS NULL) = (retraction_reason IS NULL)),
    CONSTRAINT vva_one_outcome_ck CHECK (resolved_at IS NULL OR retracted_at IS NULL)
  );

  CREATE INDEX IF NOT EXISTS vva_document_idx ON public.vault_version_annotations (document_id, created_at);
  CREATE INDEX IF NOT EXISTS vva_org_idx ON public.vault_version_annotations (organization_id);
  CREATE INDEX IF NOT EXISTS vva_parent_idx ON public.vault_version_annotations (parent_id);
  CREATE INDEX IF NOT EXISTS vva_open_idx ON public.vault_version_annotations (document_id)
    WHERE parent_id IS NULL AND resolved_at IS NULL AND retracted_at IS NULL;

  CREATE OR REPLACE FUNCTION public.vault_version_annotations_insert_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    d RECORD;
    p RECORD;
    prog_org INTEGER;
  BEGIN
    IF NEW.resolved_at IS NOT NULL OR NEW.resolved_by IS NOT NULL OR NEW.resolved_by_name IS NOT NULL
       OR NEW.resolution_note IS NOT NULL OR NEW.addressed_in_document_id IS NOT NULL
       OR NEW.retracted_at IS NOT NULL OR NEW.retracted_by IS NOT NULL OR NEW.retracted_by_name IS NOT NULL
       OR NEW.retraction_reason IS NOT NULL THEN
      RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: an annotation is posted open.' USING ERRCODE = 'raise_exception';
    END IF;

    -- Read under the caller's row security: a version the caller cannot read is refused.
    SELECT x.program_id, x.organization_id, x.content_hash, x.page_count, x.extracted_text, x.deleted_at
      INTO d FROM vault.documents x WHERE x.id = NEW.document_id;
    IF NOT FOUND OR d.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: version % is not a live Vault version.', NEW.document_id
        USING ERRCODE = 'raise_exception';
    END IF;
    SELECT rp.organization_id INTO prog_org FROM public.regulatory_programs rp
     WHERE rp.id = d.program_id AND rp.deleted_at IS NULL;
    IF NEW.program_id IS DISTINCT FROM d.program_id OR prog_org IS DISTINCT FROM NEW.organization_id
       OR (d.organization_id IS NOT NULL AND d.organization_id <> NEW.organization_id) THEN
      RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: the annotation names a program or organisation that is not its version''s.'
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.content_hash IS DISTINCT FROM btrim(d.content_hash) THEN
      RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: the annotation names other bytes than its version''s.'
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.body_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex') THEN
      RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: body_sha256 is not the SHA-256 of the body.'
        USING ERRCODE = 'raise_exception';
    END IF;

    IF NEW.parent_id IS NULL AND NEW.anchor_kind = 'page' THEN
      IF d.page_count IS NULL OR NEW.page_number > d.page_count OR NEW.pages_at_post IS DISTINCT FROM d.page_count THEN
        RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: page % is not a page of this version.', NEW.page_number
          USING ERRCODE = 'raise_exception';
      END IF;
    ELSIF NEW.parent_id IS NULL AND NEW.anchor_kind = 'text' THEN
      IF d.extracted_text IS NULL
         OR substr(d.extracted_text, NEW.char_start + 1, char_length(NEW.quote)) IS DISTINCT FROM NEW.quote
         OR NEW.text_sha256 IS DISTINCT FROM encode(sha256(convert_to(d.extracted_text, 'UTF8')), 'hex') THEN
        RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: the quoted passage is not at that position in this version''s text.'
          USING ERRCODE = 'raise_exception';
      END IF;
    END IF;

    IF NEW.parent_id IS NOT NULL THEN
      SELECT a.parent_id, a.document_id, a.organization_id, a.resolved_at, a.retracted_at
        INTO p FROM public.vault_version_annotations a WHERE a.id = NEW.parent_id;
      IF NOT FOUND OR p.parent_id IS NOT NULL OR p.document_id <> NEW.document_id
         OR p.organization_id <> NEW.organization_id OR p.resolved_at IS NOT NULL OR p.retracted_at IS NOT NULL THEN
        RAISE EXCEPTION 'VAULT_ANNOTATION_REFUSED: a reply goes under an open annotation of the same version.'
          USING ERRCODE = 'raise_exception';
      END IF;
    END IF;

    NEW.created_at := now();
    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.vault_version_annotations_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
    col text;
    root RECORD;
  BEGIN
    FOREACH col IN ARRAY ARRAY['id', 'organization_id', 'program_id', 'document_id', 'parent_id', 'kind', 'body',
                               'body_sha256', 'content_hash', 'lifecycle_stage', 'anchor_kind', 'page_number',
                               'pages_at_post', 'quote', 'char_start', 'char_end', 'text_sha256', 'author_id',
                               'author_name', 'created_at'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault_version_annotations.% of annotation % is recorded and cannot change (21 CFR 11.10(e)).', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;
    FOREACH col IN ARRAY ARRAY['resolved_at', 'resolved_by', 'resolved_by_name', 'resolution_note',
                               'addressed_in_document_id', 'retracted_at', 'retracted_by', 'retracted_by_name',
                               'retraction_reason'] LOOP
      IF (o -> col) IS DISTINCT FROM (n -> col) AND jsonb_typeof(o -> col) <> 'null' THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: the outcome of annotation % is recorded and cannot change (21 CFR 11.10(e)).', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    IF OLD.retracted_by IS NULL AND NEW.retracted_by IS NOT NULL THEN
      IF NEW.retracted_by IS DISTINCT FROM OLD.author_id THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: only its author retracts annotation %.', OLD.id USING ERRCODE = 'raise_exception';
      END IF;
      IF OLD.resolved_at IS NOT NULL THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: annotation % is resolved and stays on the record as resolved.', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
      IF OLD.parent_id IS NOT NULL THEN
        SELECT a.resolved_at, a.retracted_at INTO root FROM public.vault_version_annotations a WHERE a.id = OLD.parent_id;
        IF root.resolved_at IS NOT NULL OR root.retracted_at IS NOT NULL THEN
          RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: the annotation reply % is under a closed annotation.', OLD.id
            USING ERRCODE = 'raise_exception';
        END IF;
      END IF;
      NEW.retracted_at := now();
    END IF;

    IF OLD.resolved_by IS NULL AND NEW.resolved_by IS NOT NULL THEN
      IF OLD.retracted_at IS NOT NULL OR OLD.parent_id IS NOT NULL THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: annotation % cannot be resolved.', OLD.id USING ERRCODE = 'raise_exception';
      END IF;
      NEW.resolved_at := now();
    END IF;

    IF OLD.addressed_in_document_id IS NULL AND NEW.addressed_in_document_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM vault.documents x
         WHERE x.id = NEW.addressed_in_document_id AND x.program_id = OLD.program_id AND x.deleted_at IS NULL
           AND x.document_code IS NOT DISTINCT FROM (SELECT y.document_code FROM vault.documents y WHERE y.id = OLD.document_id)
      ) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: the version named as addressing annotation % is not a version of its document.', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.vault_version_annotations_delete_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    -- The owner, once the version is gone: the purge's cascade from
    -- vault.documents. Never pg_trigger_depth(), which a session can raise.
    IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID)
       AND NOT EXISTS (SELECT 1 FROM vault.documents x WHERE x.id = OLD.document_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: annotation % is recorded and cannot be deleted while its version exists (21 CFR 11.10(c)). Retract it, with a reason, instead.', OLD.id
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.vault_version_annotations_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault_version_annotations is a review record and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_version_annotations'::regclass AND tgname = 'vault_version_annotations_insert_guard') THEN
    CREATE TRIGGER vault_version_annotations_insert_guard
      BEFORE INSERT ON public.vault_version_annotations
      FOR EACH ROW EXECUTE FUNCTION public.vault_version_annotations_insert_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_version_annotations'::regclass AND tgname = 'vault_version_annotations_guard') THEN
    CREATE TRIGGER vault_version_annotations_guard
      BEFORE UPDATE ON public.vault_version_annotations
      FOR EACH ROW EXECUTE FUNCTION public.vault_version_annotations_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_version_annotations'::regclass AND tgname = 'vault_version_annotations_delete_guard') THEN
    CREATE TRIGGER vault_version_annotations_delete_guard
      BEFORE DELETE ON public.vault_version_annotations
      FOR EACH ROW EXECUTE FUNCTION public.vault_version_annotations_delete_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.vault_version_annotations'::regclass AND tgname = 'vault_version_annotations_truncate_guard') THEN
    CREATE TRIGGER vault_version_annotations_truncate_guard
      BEFORE TRUNCATE ON public.vault_version_annotations
      FOR EACH STATEMENT EXECUTE FUNCTION public.vault_version_annotations_truncate_guard();
  END IF;
END $vva$;
