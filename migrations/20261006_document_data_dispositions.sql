-- W2/D2 + D5: file availability and extracted-data eligibility are separate.
-- Replay-safe, public + integer org for the final tenant sweep. No source,
-- extraction, Vault version or lineage row is changed by a disposition.
CREATE TABLE IF NOT EXISTS public.document_data_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL CHECK (organization_id > 0),
  program_id UUID NOT NULL,
  captured_source_id INTEGER,
  vault_document_id UUID,
  choice TEXT NOT NULL CHECK (choice IN ('keep_data','remove_data','supersede')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 4000),
  actor_id INTEGER NOT NULL CHECK (actor_id > 0),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  preview_hash TEXT NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  linked_ids JSONB NOT NULL CHECK (linked_ids ?& ARRAY['capturedSourceIds','vaultDocumentIds','artifactIds','uploadIds'] AND jsonb_typeof(linked_ids) = 'object'
    AND jsonb_typeof(linked_ids->'capturedSourceIds') = 'array'
    AND jsonb_typeof(linked_ids->'vaultDocumentIds') = 'array'
    AND jsonb_typeof(linked_ids->'artifactIds') = 'array'
    AND jsonb_typeof(linked_ids->'uploadIds') = 'array'),
  replacement_captured_source_id INTEGER,
  replacement_vault_document_id UUID,
  impact_snapshot JSONB NOT NULL CHECK (jsonb_typeof(impact_snapshot) = 'object'),
  audit_receipt JSONB NOT NULL CHECK (jsonb_typeof(audit_receipt) = 'object'
    AND audit_receipt ?& ARRAY['id','sha256Chain'] AND audit_receipt->>'id' IS NOT NULL AND COALESCE(audit_receipt->>'sha256Chain' ~ '^[0-9a-f]{64}$',FALSE)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_disposition_id UUID REFERENCES public.document_data_dispositions(id),
  disposition_sequence INTEGER NOT NULL DEFAULT 1 CHECK (disposition_sequence > 0),
  CONSTRAINT document_data_dispositions_typed_target CHECK (num_nonnulls(captured_source_id,vault_document_id) = 1 AND (
    (captured_source_id > 0 AND vault_document_id IS NULL) OR
    (captured_source_id IS NULL AND vault_document_id IS NOT NULL))),
  CONSTRAINT document_data_dispositions_typed_successor CHECK (
    (choice <> 'supersede' AND replacement_captured_source_id IS NULL AND replacement_vault_document_id IS NULL) OR
    (choice = 'supersede' AND num_nonnulls(replacement_captured_source_id,replacement_vault_document_id)=1 AND ((captured_source_id IS NOT NULL AND replacement_captured_source_id > 0 AND replacement_vault_document_id IS NULL AND replacement_captured_source_id <> captured_source_id) OR
      (vault_document_id IS NOT NULL AND replacement_vault_document_id IS NOT NULL AND replacement_captured_source_id IS NULL AND replacement_vault_document_id <> vault_document_id))))
);
CREATE INDEX IF NOT EXISTS document_data_dispositions_capture_idx ON public.document_data_dispositions (organization_id,program_id,captured_source_id,disposition_sequence DESC) WHERE captured_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_data_dispositions_vault_idx ON public.document_data_dispositions (organization_id,program_id,vault_document_id,disposition_sequence DESC) WHERE vault_document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_data_dispositions_hash_sequence ON public.document_data_dispositions (organization_id,program_id,source_sha256,disposition_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS document_data_dispositions_no_fork ON public.document_data_dispositions (previous_disposition_id) WHERE previous_disposition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_data_dispositions_linked_ids ON public.document_data_dispositions USING gin (linked_ids);
CREATE OR REPLACE FUNCTION public.document_data_dispositions_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: document data dispositions and audit receipts are append-only' USING ERRCODE = '55000';
END;
$guard$;
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.document_data_dispositions'::regclass AND tgname = 'document_data_dispositions_append_only') THEN
    CREATE TRIGGER document_data_dispositions_append_only BEFORE UPDATE OR DELETE ON public.document_data_dispositions FOR EACH ROW EXECUTE FUNCTION public.document_data_dispositions_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.document_data_dispositions'::regclass AND tgname = 'document_data_dispositions_no_truncate') THEN
    CREATE TRIGGER document_data_dispositions_no_truncate BEFORE TRUNCATE ON public.document_data_dispositions FOR EACH STATEMENT EXECUTE FUNCTION public.document_data_dispositions_append_only();
  END IF;
END;
$migration$;
COMMENT ON TABLE public.document_data_dispositions IS 'Append-only logical file withdrawal and extracted-data eligibility. Holds/retention and immutable historical lineage survive. Physical purge is a separate governed process.';

-- A direct INSERT has to tell the same typed source identity as the API.
-- Functions resolve names at execution, so additive installation is safe even
-- when a partial environment lacks a source store; that environment cannot act.
CREATE OR REPLACE FUNCTION public.document_data_dispositions_identity_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $identity$
DECLARE source_hash TEXT; predecessor TEXT; extraction TEXT; replacement_hash TEXT; prior public.document_data_dispositions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext(NEW.organization_id::text||':'||NEW.program_id::text));
  SELECT * INTO prior FROM public.document_data_dispositions WHERE organization_id=NEW.organization_id AND program_id=NEW.program_id
    AND source_sha256=NEW.source_sha256 ORDER BY disposition_sequence DESC LIMIT 1;
  IF prior.id IS NULL THEN
    IF NEW.previous_disposition_id IS NOT NULL OR NEW.disposition_sequence<>1 THEN
      RAISE EXCEPTION 'DISPOSITION_TRANSITION_REFUSED: first disposition must start this source history' USING ERRCODE='23514';
    END IF;
  ELSIF prior.choice<>'keep_data' OR NEW.choice='keep_data' OR NEW.previous_disposition_id IS DISTINCT FROM prior.id
      OR NEW.disposition_sequence<>prior.disposition_sequence+1 OR NEW.captured_source_id IS DISTINCT FROM prior.captured_source_id
      OR NEW.vault_document_id IS DISTINCT FROM prior.vault_document_id OR NEW.linked_ids IS DISTINCT FROM prior.linked_ids THEN
    RAISE EXCEPTION 'DISPOSITION_TRANSITION_REFUSED: only retained data may be withdrawn or superseded through the same source; reactivation and history forks are forbidden' USING ERRCODE='23514';
  END IF;
  IF NEW.captured_source_id IS NOT NULL THEN
    SELECT checksum INTO source_hash FROM public.cre_evidence_sources
      WHERE id=NEW.captured_source_id AND organization_id=NEW.organization_id
        AND client_program_id=NEW.program_id AND source_type='client_document' AND deleted_at IS NULL;
    IF NOT (NEW.linked_ids->'capturedSourceIds' @> jsonb_build_array(NEW.captured_source_id)) THEN
      RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: snapshot does not name its captured source' USING ERRCODE='23514';
    END IF;
    IF NEW.choice='supersede' THEN
      SELECT previous_version_id::text,extraction_status,checksum INTO predecessor,extraction,replacement_hash FROM public.cre_evidence_sources
        WHERE id=NEW.replacement_captured_source_id AND organization_id=NEW.organization_id
          AND client_program_id=NEW.program_id AND source_type='client_document' AND ingestion_status='ingested'
          AND is_current=TRUE AND deleted_at IS NULL;
      IF predecessor IS DISTINCT FROM NEW.captured_source_id::text OR extraction NOT IN ('extracted','reconciled','verified') THEN
        RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: captured successor is not verified' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    SELECT d.content_hash INTO source_hash FROM vault.documents d JOIN public.regulatory_programs rp ON rp.id=d.program_id WHERE d.id=NEW.vault_document_id
      AND rp.organization_id=NEW.organization_id AND d.program_id=NEW.program_id AND d.deleted_at IS NULL
      AND (d.organization_id IS NULL OR d.organization_id=rp.organization_id);
    IF NOT (NEW.linked_ids->'vaultDocumentIds' @> jsonb_build_array(NEW.vault_document_id::text)) THEN
      RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: snapshot does not name its Vault version' USING ERRCODE='23514';
    END IF;
    IF NEW.choice='supersede' THEN
      SELECT d.supersedes_id::text,d.extracted_text,d.content_hash INTO predecessor,extraction,replacement_hash FROM vault.documents d JOIN public.regulatory_programs rp ON rp.id=d.program_id
        WHERE d.id=NEW.replacement_vault_document_id AND rp.organization_id=NEW.organization_id AND d.program_id=NEW.program_id
          AND d.processing_status='INDEXED' AND d.deleted_at IS NULL AND (d.organization_id IS NULL OR d.organization_id=rp.organization_id);
      IF predecessor IS DISTINCT FROM NEW.vault_document_id::text OR COALESCE(length(btrim(extraction)),0)=0 THEN
        RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: Vault successor is not verified' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF source_hash IS NULL OR source_hash IS DISTINCT FROM NEW.source_sha256 THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: organization, project, typed source and SHA-256 must agree' USING ERRCODE='23514';
  END IF;
  IF NEW.choice='supersede' AND (replacement_hash IS NULL OR replacement_hash=source_hash OR EXISTS (
      SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=NEW.organization_id AND dd.program_id=NEW.program_id AND dd.source_sha256=replacement_hash)) THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: successor bytes must be different and available' USING ERRCODE='23514';
  END IF;
  IF jsonb_array_length(NEW.linked_ids->'capturedSourceIds') > 1 OR jsonb_array_length(NEW.linked_ids->'vaultDocumentIds') > 1 THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: multiple source or Vault identities are ambiguous' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.linked_ids->'capturedSourceIds') k WHERE NOT EXISTS (
      SELECT 1 FROM public.cre_evidence_sources s WHERE s.id::text=k.value AND s.organization_id=NEW.organization_id
        AND s.client_program_id=NEW.program_id AND s.checksum=source_hash AND s.source_type='client_document' AND s.deleted_at IS NULL))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.linked_ids->'vaultDocumentIds') k WHERE NOT EXISTS (
      SELECT 1 FROM vault.documents d JOIN public.regulatory_programs rp ON rp.id=d.program_id WHERE d.id::text=k.value AND rp.organization_id=NEW.organization_id
        AND d.program_id=NEW.program_id AND d.content_hash=source_hash AND d.deleted_at IS NULL
        AND (d.organization_id IS NULL OR d.organization_id=rp.organization_id))) THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: linked target scope and original hash must agree' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.linked_ids->'uploadIds') k WHERE NOT EXISTS (
      SELECT 1 FROM public.file_uploads u JOIN public.cre_evidence_sources s ON s.provenance->>'fileUploadId'=u.id
      WHERE u.id=k.value AND u.organization_id=NEW.organization_id AND u.checksum_sha256=source_hash
        AND s.organization_id=NEW.organization_id AND s.client_program_id=NEW.program_id AND s.checksum=source_hash
        AND u.storage_path LIKE 'uploads/org-'||NEW.organization_id::text||'/%')) THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: linked upload scope and original hash must agree' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.linked_ids->'artifactIds') k WHERE NOT EXISTS (
      SELECT 1 FROM public.concept2cure_artifacts a JOIN public.projects p ON p.id=a.project_id AND p.organization_id=a.organization_id
      WHERE (a.id::text=k.value OR a.artifact_id=k.value) AND a.organization_id=NEW.organization_id AND p.regulatory_program_id=NEW.program_id
        AND (a.content_hash=source_hash OR NEW.linked_ids->'uploadIds' @> jsonb_build_array(a.metadata->>'fileId')))) THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: linked artifact must name the proven upload in this project' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulatory_programs WHERE id=NEW.program_id AND organization_id=NEW.organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DISPOSITION_IDENTITY_REFUSED: project scope is not live' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$identity$;
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.document_data_dispositions'::regclass AND tgname='document_data_dispositions_identity_guard') THEN
    CREATE TRIGGER document_data_dispositions_identity_guard BEFORE INSERT ON public.document_data_dispositions FOR EACH ROW EXECUTE FUNCTION public.document_data_dispositions_identity_guard();
  END IF;
END;
$mig$;

-- Jobs already in flight must not revise the confirmed impact or reinsert data
-- after withdrawal. keep_data preserves exactly the stored derived data; it
-- does not authorize a new OCR/provider pass over an unavailable original.
-- The single typed atom-reference recipe serves preview counting, eligibility
-- and the database late-write guard; adding an atom source form cannot fix one
-- path while accidentally leaving another eligible.
CREATE OR REPLACE FUNCTION public.document_disposition_atom_references(
  atom_source_type TEXT, atom_source_id TEXT, atom_structured_data JSONB, ids JSONB
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $references$
  SELECT COALESCE(
    (atom_source_type IN ('captured_source','cre_evidence_source') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(ids->'capturedSourceIds') k WHERE k.value=atom_source_id)) OR
    (atom_source_type='chat_upload' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(ids->'capturedSourceIds') k WHERE atom_source_id='cre_source:'||k.value)) OR
    (atom_source_type='chat_upload' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(ids->'uploadIds') k WHERE atom_source_id='upload:'||k.value)) OR
    (atom_source_type='clinical_regulatory_evidence' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(ids->'capturedSourceIds') k WHERE atom_structured_data->>'sourceId'=k.value OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(atom_structured_data->'supportingSourceIds')='array' THEN atom_structured_data->'supportingSourceIds' ELSE '[]'::jsonb END) s WHERE s.value=k.value) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(atom_structured_data->'contradictingSourceIds')='array' THEN atom_structured_data->'contradictingSourceIds' ELSE '[]'::jsonb END) s WHERE s.value=k.value))) OR
    (atom_source_type IN ('vault_document','vault_documents') AND ids->'vaultDocumentIds' @> jsonb_build_array(atom_source_id)) OR
    (atom_source_type IN ('artifact','chat_upload','data_room_upload','concept2cure_artifact','concept2cure_artifacts','upload','file_upload','file_uploads','uploaded_document','uploaded-file')
      AND (ids->'artifactIds' @> jsonb_build_array(atom_source_id) OR ids->'uploadIds' @> jsonb_build_array(atom_source_id))),FALSE);
$references$;
CREATE OR REPLACE FUNCTION public.document_disposition_rag_references(document_ref TEXT,ids JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $rag$
  SELECT COALESCE(ids->'vaultDocumentIds' @> jsonb_build_array(document_ref)
    OR ids->'artifactIds' @> jsonb_build_array(document_ref)
    OR ids->'uploadIds' @> jsonb_build_array(document_ref)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(ids->'capturedSourceIds') k WHERE document_ref='cre_source:'||k.value),FALSE);
$rag$;
CREATE OR REPLACE FUNCTION public.document_disposition_artifact_references(artifact_ref TEXT,native_ref TEXT,artifact_metadata JSONB,ids JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $artifact$
  SELECT COALESCE(ids->'artifactIds' @> jsonb_build_array(artifact_ref)
    OR ids->'artifactIds' @> jsonb_build_array(native_ref)
    OR ids->'uploadIds' @> jsonb_build_array(artifact_metadata->>'fileId'),FALSE);
$artifact$;
CREATE OR REPLACE FUNCTION public.document_data_dispositions_late_write_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $late$
DECLARE row_data JSONB := to_jsonb(NEW); old_data JSONB;
  org INTEGER; program UUID; doc UUID; source_hash TEXT; blocked BOOLEAN := FALSE;
BEGIN
  IF TG_OP='DELETE' THEN row_data := to_jsonb(OLD); old_data := row_data; END IF;
  IF TG_OP='UPDATE' THEN old_data := to_jsonb(OLD); END IF;
  IF TG_TABLE_SCHEMA='vault' AND TG_TABLE_NAME IN ('document_chunks','document_catalog') THEN
    doc := (row_data->>'document_id')::uuid;
    SELECT EXISTS (SELECT 1 FROM vault.documents d JOIN public.regulatory_programs rp ON rp.id=d.program_id
      JOIN public.document_data_dispositions dd ON dd.organization_id=rp.organization_id AND dd.program_id=d.program_id
      WHERE (d.id=doc OR d.id=(old_data->>'document_id')::uuid)
      AND (dd.vault_document_id=d.id OR dd.source_sha256=d.content_hash OR dd.linked_ids->'vaultDocumentIds' @> jsonb_build_array(d.id::text))) INTO blocked;
  ELSIF TG_TABLE_SCHEMA='vault' AND TG_TABLE_NAME='documents' THEN
    IF TG_OP='UPDATE' THEN
      old_data := to_jsonb(OLD);
      IF row_data->'extracted_text' IS NOT DISTINCT FROM old_data->'extracted_text'
          AND row_data->'processing_status' IS NOT DISTINCT FROM old_data->'processing_status'
          AND row_data->'processing_error' IS NOT DISTINCT FROM old_data->'processing_error' THEN RETURN NEW; END IF;
    END IF;
    SELECT rp.organization_id INTO org FROM public.regulatory_programs rp WHERE rp.id=(row_data->>'program_id')::uuid;
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=org
      AND dd.program_id=(row_data->>'program_id')::uuid AND dd.source_sha256=row_data->>'content_hash') INTO blocked;
  ELSIF TG_TABLE_NAME='cre_evidence_sources' THEN
    IF TG_OP='UPDATE' THEN
      old_data := to_jsonb(OLD);
      IF row_data->'extraction_status' IS NOT DISTINCT FROM old_data->'extraction_status'
          AND row_data->'ingestion_status' IS NOT DISTINCT FROM old_data->'ingestion_status'
          AND row_data->'metadata' IS NOT DISTINCT FROM old_data->'metadata'
          AND row_data->'provenance' IS NOT DISTINCT FROM old_data->'provenance' THEN RETURN NEW; END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=(row_data->>'organization_id')::integer
      AND dd.program_id=(row_data->>'client_program_id')::uuid AND dd.source_sha256=row_data->>'checksum') INTO blocked;
  ELSIF TG_TABLE_NAME='lumen_data_atoms' THEN
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE
      (dd.organization_id=(row_data->>'organization_id')::integer AND public.document_disposition_atom_references(row_data->>'source_type',row_data->>'source_id',row_data->'structured_data',dd.linked_ids))
      OR (dd.organization_id=(old_data->>'organization_id')::integer AND public.document_disposition_atom_references(old_data->>'source_type',old_data->>'source_id',old_data->'structured_data',dd.linked_ids))) INTO blocked;
  ELSIF TG_TABLE_NAME='concept2cure_artifacts' THEN
    IF TG_OP='UPDATE' AND row_data->'content' IS NOT DISTINCT FROM old_data->'content'
      AND row_data->'content_hash' IS NOT DISTINCT FROM old_data->'content_hash'
      AND row_data->'metadata' IS NOT DISTINCT FROM old_data->'metadata'
      AND row_data->'artifact_id' IS NOT DISTINCT FROM old_data->'artifact_id'
      AND row_data->'project_id' IS NOT DISTINCT FROM old_data->'project_id'
      AND row_data->'organization_id' IS NOT DISTINCT FROM old_data->'organization_id' THEN RETURN NEW; END IF;
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd
      CROSS JOIN LATERAL (SELECT row_data AS a UNION ALL SELECT old_data) candidate
      WHERE dd.organization_id=(candidate.a->>'organization_id')::integer AND (
        public.document_disposition_artifact_references(candidate.a->>'id',candidate.a->>'artifact_id',candidate.a->'metadata',dd.linked_ids)
        OR EXISTS (SELECT 1 FROM public.file_uploads u WHERE u.id=candidate.a->'metadata'->>'fileId' AND u.organization_id=dd.organization_id AND u.checksum_sha256=dd.source_sha256)
        OR (dd.source_sha256=candidate.a->>'content_hash' AND EXISTS (SELECT 1 FROM public.projects p
          WHERE p.id::text=candidate.a->>'project_id' AND p.organization_id=dd.organization_id AND p.regulatory_program_id=dd.program_id)))) INTO blocked;
  ELSIF TG_TABLE_NAME='rag_chunks' THEN
    SELECT EXISTS (SELECT 1 FROM public.rag_documents d JOIN public.document_data_dispositions dd ON dd.organization_id=d.organization_id
      WHERE (d.id=(row_data->>'document_id')::uuid OR d.id=(old_data->>'document_id')::uuid) AND (public.document_disposition_rag_references(d.document_id,dd.linked_ids)
        OR dd.source_sha256=to_jsonb(d)->>'file_hash')) INTO blocked;
  ELSIF TG_TABLE_NAME='rag_documents' THEN
    IF TG_OP='UPDATE' THEN
      old_data := to_jsonb(OLD);
      IF row_data-'last_accessed_at' IS NOT DISTINCT FROM old_data-'last_accessed_at' THEN RETURN NEW; END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE
      (dd.organization_id=(row_data->>'organization_id')::integer AND (public.document_disposition_rag_references(row_data->>'document_id',dd.linked_ids) OR dd.source_sha256=row_data->>'file_hash'))
      OR (dd.organization_id=(old_data->>'organization_id')::integer AND (public.document_disposition_rag_references(old_data->>'document_id',dd.linked_ids) OR dd.source_sha256=old_data->>'file_hash'))) INTO blocked;
  ELSIF TG_TABLE_NAME='authoring_citations' THEN
    SELECT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE (TG_OP='DELETE' OR dd.choice IN ('remove_data','supersede')) AND (
      (dd.organization_id=(row_data->>'tenant_id')::integer AND row_data->>'source'='cre_evidence_source'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(dd.linked_ids->'capturedSourceIds') k WHERE k.value=row_data->>'reference_id'))
      OR (dd.organization_id=(old_data->>'tenant_id')::integer AND old_data->>'source'='cre_evidence_source'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(dd.linked_ids->'capturedSourceIds') k WHERE k.value=old_data->>'reference_id')))) INTO blocked;
  END IF;
  IF blocked THEN RAISE EXCEPTION 'DOCUMENT_DISPOSITION_WRITE_REFUSED: original withdrawn; confirmed derived data and lineage are retained' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$late$;
DO $guards$
DECLARE target TEXT; rel REGCLASS;
BEGIN
  FOREACH target IN ARRAY ARRAY['vault.document_chunks','vault.document_catalog','vault.documents','public.cre_evidence_sources','public.lumen_data_atoms','public.concept2cure_artifacts','public.rag_documents','public.rag_chunks','public.authoring_citations'] LOOP
    rel := to_regclass(target);
    IF rel IS NOT NULL THEN
      -- CREATE OR REPLACE upgrades the event list on replay without dropping
      -- a guard. Historical extraction deletion is not governed physical purge.
      IF target IN ('vault.documents','public.cre_evidence_sources') THEN
        EXECUTE format('CREATE OR REPLACE TRIGGER document_disposition_late_write_guard BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.document_data_dispositions_late_write_guard()',rel);
      ELSE
        EXECUTE format('CREATE OR REPLACE TRIGGER document_disposition_late_write_guard BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.document_data_dispositions_late_write_guard()',rel);
      END IF;
    END IF;
  END LOOP;
END;
$guards$;
