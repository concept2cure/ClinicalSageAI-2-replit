-- 2026-10-18: named company presentations reuse canonical template specs.
-- Publication records an independently retained variant; it never changes the organization default.
CREATE TABLE IF NOT EXISTS public.company_document_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  template_id TEXT NOT NULL REFERENCES c2c_template_specs(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  program_id UUID,
  market TEXT CHECK (market IS NULL OR market IN ('US','EU','JP','CA','CN','KR','UK','AU','CH','BR','IN','SG')),
  language TEXT,
  subsidiary TEXT,
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity)='object' AND NOT identity ? 'letterhead' AND NOT identity ? 'legalDocuments'),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','reviewed','published')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  published_by INTEGER REFERENCES users(id),
  published_at TIMESTAMPTZ,
  published_revision INTEGER CHECK (published_revision > 0),
  published_profile_hash TEXT CHECK (published_profile_hash ~ '^[a-f0-9]{64}$'),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
  CHECK (
    (state='draft' AND reviewed_by IS NULL AND reviewed_at IS NULL AND published_by IS NULL AND published_at IS NULL AND published_revision IS NULL AND published_profile_hash IS NULL)
    OR (state='reviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_by IS NULL AND published_at IS NULL AND published_revision IS NULL AND published_profile_hash IS NULL)
    OR (state='published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL AND published_revision IS NOT NULL AND published_profile_hash IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS company_document_designs_list_idx
  ON public.company_document_designs(organization_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS company_document_designs_program_idx
  ON public.company_document_designs(organization_id,program_id,state);

CREATE OR REPLACE FUNCTION public.guard_company_document_design() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'Company design records are retained evidence';
  END IF;
  IF TG_OP='DELETE' THEN
    IF NULLIF(current_setting('app.rls_enforce',true),'')='on'
       AND current_setting('app.current_user_role',true) IS DISTINCT FROM 'app_super_admin' THEN
      RAISE EXCEPTION 'Company design disposal requires platform purge scope';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id=OLD.organization_id AND status='pending_deletion')
       AND NOT EXISTS (SELECT 1 FROM vault.legal_holds WHERE organization_id=OLD.organization_id AND lifted_at IS NULL) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Company design records are retained evidence';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['state','reviewed_by','reviewed_at','published_by','published_at','published_revision','published_profile_hash'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','reviewed_by','reviewed_at','published_by','published_at','published_revision','published_profile_hash']) THEN
    RAISE EXCEPTION 'Company design candidates are immutable; stage a new design';
  END IF;
  IF OLD.state='draft' AND NEW.state='reviewed'
     AND NEW.reviewed_by<>OLD.created_by AND NEW.reviewed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.state='reviewed' AND NEW.state='published'
     AND NEW.reviewed_by=OLD.reviewed_by AND NEW.reviewed_at=OLD.reviewed_at
     AND NEW.published_by IS NOT NULL AND NEW.published_revision IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Company design review and publication must follow the governed state transitions';
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_design_governed' AND tgrelid='public.company_document_designs'::regclass) THEN
    CREATE TRIGGER company_document_design_governed BEFORE UPDATE OR DELETE
      ON public.company_document_designs FOR EACH ROW EXECUTE FUNCTION public.guard_company_document_design();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_design_no_truncate' AND tgrelid='public.company_document_designs'::regclass) THEN
    CREATE TRIGGER company_document_design_no_truncate BEFORE TRUNCATE
      ON public.company_document_designs FOR EACH STATEMENT EXECUTE FUNCTION public.guard_company_document_design();
  END IF;
END $$;
