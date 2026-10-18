-- 2026-10-18: canonical tenant-keyed legal registry, replacing the settings array.
-- Production cutover requires company-document writes paused and EVERY API/job
-- worker updated before writes resume. Old workers are deliberately refused by
-- the organizations trigger; there is no rolling dual-write compatibility mode.
BEGIN;
LOCK TABLE public.organizations IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.company_legal_registry_document_valid(d JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k TEXT; v JSONB; day TEXT;
BEGIN
  IF d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['id','title','kind','programId','vaultDocumentId','contentHash','version','language','registeredAt','registeredBy'] LOOP
    IF jsonb_typeof(d->k) IS DISTINCT FROM 'string' OR length(trim(d->>k))=0 THEN RETURN false; END IF;
  END LOOP;
  IF d->>'kind' NOT IN ('authorization','power_of_attorney','declaration','certificate','agreement','cover_letter','other')
     OR d->>'programId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
     OR d->>'vaultDocumentId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
     OR d->>'contentHash' !~* '^[a-f0-9]{64}$'
     OR jsonb_typeof(d->'active') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['agencies','countries','submissionTypes'] LOOP
    IF jsonb_typeof(d->k) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(d->k) LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(trim(v#>>'{}'))=0 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['effectiveOn','expiresOn'] LOOP
    IF NOT d ? k THEN RETURN false; END IF;
    IF jsonb_typeof(d->k) <> 'null' THEN
      day := d->>k;
      IF jsonb_typeof(d->k) IS DISTINCT FROM 'string' OR day !~ '^\d{4}-\d{2}-\d{2}$'
         OR to_char(day::date,'YYYY-MM-DD') <> day THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF d->>'effectiveOn' > d->>'expiresOn' THEN RETURN false; END IF;
  PERFORM (d->>'registeredAt')::timestamptz;
  IF d ? 'workflow' AND jsonb_typeof(d->'workflow') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF d ? 'sourceOriginal' THEN
    IF jsonb_typeof(d->'sourceOriginal') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    FOREACH k IN ARRAY ARRAY['registryId','vaultDocumentId','programId','version','contentHash'] LOOP
      IF jsonb_typeof(d->'sourceOriginal'->k) IS DISTINCT FROM 'string' OR length(trim(d->'sourceOriginal'->>k))=0 THEN RETURN false; END IF;
    END LOOP;
    IF d->'sourceOriginal'->>'vaultDocumentId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
       OR d->'sourceOriginal'->>'programId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
       OR d->'sourceOriginal'->>'contentHash' !~* '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.company_legal_registry (
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  id TEXT NOT NULL,
  document JSONB NOT NULL,
  PRIMARY KEY (organization_id,id),
  CONSTRAINT company_legal_registry_document_valid CHECK (
    public.company_legal_registry_document_valid(document) AND document->>'id'=id
  )
);
CREATE INDEX IF NOT EXISTS company_legal_registry_program_idx
  ON public.company_legal_registry (organization_id,(document->>'programId'));
CREATE INDEX IF NOT EXISTS company_legal_registry_vault_idx
  ON public.company_legal_registry (organization_id,lower(document->>'vaultDocumentId'));
CREATE INDEX IF NOT EXISTS company_legal_registry_inventory_idx
  ON public.company_legal_registry (organization_id,(document->>'registeredAt'),id);

DO $$
DECLARE o RECORD; d JSONB; ids TEXT[];
BEGIN
  FOR o IN SELECT id,settings::jsonb AS settings FROM public.organizations
    WHERE settings::jsonb #> '{companyDocuments}' ? 'legalDocuments' LOOP
    IF jsonb_typeof(o.settings #> '{companyDocuments,legalDocuments}') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Malformed legacy company legal registry for organization %',o.id;
    END IF;
    ids := ARRAY[]::text[];
    FOR d IN SELECT value FROM jsonb_array_elements(o.settings #> '{companyDocuments,legalDocuments}') LOOP
      IF NOT public.company_legal_registry_document_valid(d) OR d->>'id'=ANY(ids) THEN
        RAISE EXCEPTION 'Invalid or duplicate legacy company legal registry record for organization %',o.id;
      END IF;
      ids := array_append(ids,d->>'id');
      INSERT INTO public.company_legal_registry(organization_id,id,document)
        VALUES(o.id,d->>'id',d) ON CONFLICT (organization_id,id) DO NOTHING;
      IF NOT EXISTS (SELECT 1 FROM public.company_legal_registry r
        WHERE r.organization_id=o.id AND r.id=d->>'id' AND r.document=d) THEN
        RAISE EXCEPTION 'Conflicting company legal registry record for organization %',o.id;
      END IF;
    END LOOP;
    -- Preserve all other settings and the profile revision exactly. This is a
    -- storage migration, not a user mutation, approval or presentation change.
    UPDATE public.organizations SET settings=(o.settings #- '{companyDocuments,legalDocuments}')::json WHERE id=o.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_company_legal_settings_array() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.settings::jsonb #> '{companyDocuments}' ? 'legalDocuments' THEN
    RAISE EXCEPTION 'Company legal documents use the canonical registry; legacy settings arrays are refused';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_company_legal_registry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE k TEXT;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Company legal registry identity is immutable';
    END IF;
    FOREACH k IN ARRAY ARRAY['id','programId','vaultDocumentId','contentHash','version','registeredAt','registeredBy','sourceOriginal'] LOOP
      IF OLD.document->k IS DISTINCT FROM NEW.document->k THEN
        RAISE EXCEPTION 'Company legal original version and provenance are immutable';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  IF NULLIF(current_setting('app.rls_enforce',true),'')='on'
     AND current_setting('app.current_user_role',true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'Company legal disposal requires platform purge scope';
  END IF;
  IF EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id AND status='pending_deletion')
     AND NOT EXISTS(SELECT 1 FROM vault.legal_holds WHERE organization_id=OLD.organization_id AND lifted_at IS NULL) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Company legal records must be archived; disposal requires eligible tenant purge';
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='company_legal_settings_array_refused' AND tgrelid='public.organizations'::regclass) THEN
    CREATE TRIGGER company_legal_settings_array_refused BEFORE INSERT OR UPDATE OF settings ON public.organizations
      FOR EACH ROW EXECUTE FUNCTION public.guard_company_legal_settings_array();
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='company_legal_registry_guard' AND tgrelid='public.company_legal_registry'::regclass) THEN
    CREATE TRIGGER company_legal_registry_guard BEFORE UPDATE OR DELETE ON public.company_legal_registry
      FOR EACH ROW EXECUTE FUNCTION public.guard_company_legal_registry();
  END IF;
END $$;
COMMIT;
