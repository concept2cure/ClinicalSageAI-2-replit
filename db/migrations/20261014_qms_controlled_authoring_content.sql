-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Link controlled documents to canonical Authoring and retain immutable signed content versions.
--
-- eCTD/CTD Context:
--   - Module(s): QMS document control supporting governed regulatory authoring across CTD modules.
--   - Integrity Risk Addressed: Cross-tenant content linkage, post-signature editing and loss of signed document reconstruction.
--
-- Determinism Contract:
--   - Preserve exact content digests and signature references; guards lock governing rows during content writes.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- 2026-10-14 audit F01: controlled text uses canonical Authoring; signed versions are retained intact.
ALTER TABLE public.qms_documents ADD COLUMN IF NOT EXISTS authoring_document_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS qms_document_org_id_key ON public.qms_documents (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS authoring_document_id_tenant_key ON public.authoring_documents (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS qms_authoring_document_unique ON public.qms_documents (authoring_document_id) WHERE authoring_document_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qms_documents'::regclass AND conname = 'qms_authoring_document_tenant_fk') THEN
    ALTER TABLE public.qms_documents ADD CONSTRAINT qms_authoring_document_tenant_fk
      FOREIGN KEY (authoring_document_id, organization_id) REFERENCES public.authoring_documents (id, tenant_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.qms_document_versions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  document_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  authoring_document_id UUID,
  record_kind TEXT NOT NULL DEFAULT 'signed' CHECK (record_kind IN ('signed','legacy-registry')),
  controlled_document JSONB NOT NULL,
  sections JSONB NOT NULL,
  content_digest TEXT NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  signature_id BIGINT,
  approved_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (record_kind <> 'signed' OR (authoring_document_id IS NOT NULL AND signature_id IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE (document_id, version),
  FOREIGN KEY (document_id, organization_id) REFERENCES public.qms_documents (id, organization_id),
  FOREIGN KEY (authoring_document_id, organization_id) REFERENCES public.authoring_documents (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS qms_document_versions_org_idx ON public.qms_document_versions (organization_id, document_id);

CREATE OR REPLACE FUNCTION public.qms_signed_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A signed QMS version is immutable' USING ERRCODE = '55000'; END $$;
CREATE OR REPLACE TRIGGER qms_signed_version_immutable BEFORE UPDATE OR DELETE ON public.qms_document_versions
FOR EACH ROW EXECUTE FUNCTION public.qms_signed_version_immutable();

-- Lock the governing row inside every canonical section write, closing the review/approval race as well as direct writers.
CREATE OR REPLACE FUNCTION public.qms_authoring_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc UUID; org INTEGER; governed_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'authoring_sections' THEN
    doc := CASE WHEN TG_OP = 'DELETE' THEN OLD.doc_id ELSE NEW.doc_id END;
    org := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  ELSE
    doc := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    org := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - ARRAY['status','updated_at','approved_at','frozen_at','locked_at','locked_by']) =
                             (to_jsonb(OLD) - ARRAY['status','updated_at','approved_at','frozen_at','locked_at','locked_by']) THEN RETURN NEW; END IF;
  END IF;
  SELECT status INTO governed_status FROM public.qms_documents
    WHERE authoring_document_id = doc AND organization_id = org FOR SHARE;
  IF governed_status IS NOT NULL AND governed_status <> 'draft' OR EXISTS
    (SELECT 1 FROM public.qms_document_versions WHERE authoring_document_id = doc AND organization_id = org) OR EXISTS
    (SELECT 1 FROM public.qms_documents WHERE organization_id = org AND metadata->'retainedAuthoringDocuments' ? doc::text) THEN
    RAISE EXCEPTION 'QMS_DOCUMENT_CONTROLLED: open a controlled revision before changing this content' USING ERRCODE = '55000';
  END IF;
  -- Reparenting may not detach a controlled section from its old document.
  IF TG_TABLE_NAME = 'authoring_sections' THEN
    IF TG_OP = 'UPDATE' THEN
      IF (OLD.doc_id, OLD.tenant_id) IS DISTINCT FROM (NEW.doc_id, NEW.tenant_id) THEN
        IF EXISTS (SELECT 1 FROM public.qms_documents WHERE authoring_document_id = OLD.doc_id AND organization_id = OLD.tenant_id AND status <> 'draft') OR
           EXISTS (SELECT 1 FROM public.qms_document_versions WHERE authoring_document_id = OLD.doc_id AND organization_id = OLD.tenant_id) OR
           EXISTS (SELECT 1 FROM public.qms_documents WHERE organization_id = OLD.tenant_id AND metadata->'retainedAuthoringDocuments' ? OLD.doc_id::text) THEN
          RAISE EXCEPTION 'QMS_DOCUMENT_CONTROLLED: a retained section cannot be reparented' USING ERRCODE = '55000';
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER qms_section_content_guard BEFORE INSERT OR UPDATE OR DELETE ON public.authoring_sections
FOR EACH ROW EXECUTE FUNCTION public.qms_authoring_content_guard();
CREATE OR REPLACE TRIGGER qms_document_content_guard BEFORE UPDATE OR DELETE ON public.authoring_documents
FOR EACH ROW EXECUTE FUNCTION public.qms_authoring_content_guard();
