-- 2026-10-18: recoverable company presentation revisions and delegated duties.
-- Public integer organization keys: canonical deploy sweeps apply tenant RLS.
CREATE TABLE IF NOT EXISTS public.company_document_revisions (
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  variant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  profile JSONB NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, revision, variant_id)
);
CREATE TABLE IF NOT EXISTS public.company_document_grants (
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  manage_brand BOOLEAN NOT NULL DEFAULT false,
  manage_legal BOOLEAN NOT NULL DEFAULT false,
  updated_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.company_document_identity_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  sequence_id INTEGER NOT NULL,
  profile_revision INTEGER NOT NULL,
  profile_sha256 TEXT NOT NULL CHECK (profile_sha256 ~ '^[a-f0-9]{64}$'),
  filing_sha256 TEXT NOT NULL CHECK (filing_sha256 ~ '^[a-f0-9]{64}$'),
  company_role TEXT NOT NULL CHECK (company_role IN ('sponsor','applicant','legal_manufacturer','local_representative','parent_brand')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 8),
  reviewed_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_document_identity_current_idx
  ON public.company_document_identity_reviews(organization_id,sequence_id,reviewed_at DESC);
DO $$ BEGIN
  IF to_regclass('public.mdx_notifications') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS company_legal_reminder_once_idx
      ON public.mdx_notifications(organization_id,(metadata->>'companyLegalReminderKey'))
      WHERE metadata ? 'companyLegalReminderKey';
  END IF;
END $$;
-- Exact-copy ancestry is read at the canonical Vault gate. Keep that lookup
-- tenant/record bounded rather than scanning the tenant's full audit history.
DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS audit_company_legal_copy_lineage_idx
      ON public.audit_logs(tenant_id,record_id)
      WHERE table_name='vault_document'
        AND action IN ('vault.document.ingest','vault.document.reupload');
  END IF;
END $$;
-- Revision rows are retained evidence. Disposal uses the existing tenant
-- purge's platform scope, pending-deletion state and active-hold checks.
CREATE OR REPLACE FUNCTION public.guard_company_document_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
       AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
      RAISE EXCEPTION 'Company presentation disposal requires platform purge scope';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id=OLD.organization_id AND status='pending_deletion')
       AND NOT EXISTS (SELECT 1 FROM vault.legal_holds WHERE organization_id=OLD.organization_id AND lifted_at IS NULL) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'Company presentation revisions are immutable';
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_revision_immutable' AND tgrelid='public.company_document_revisions'::regclass) THEN
    CREATE TRIGGER company_document_revision_immutable BEFORE UPDATE OR DELETE
      ON public.company_document_revisions FOR EACH ROW
      EXECUTE FUNCTION public.guard_company_document_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_revision_no_truncate' AND tgrelid='public.company_document_revisions'::regclass) THEN
    CREATE TRIGGER company_document_revision_no_truncate BEFORE TRUNCATE
      ON public.company_document_revisions FOR EACH STATEMENT
      EXECUTE FUNCTION public.guard_company_document_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_identity_immutable' AND tgrelid='public.company_document_identity_reviews'::regclass) THEN
    CREATE TRIGGER company_document_identity_immutable BEFORE UPDATE OR DELETE
      ON public.company_document_identity_reviews FOR EACH ROW
      EXECUTE FUNCTION public.guard_company_document_revision();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='company_document_identity_no_truncate' AND tgrelid='public.company_document_identity_reviews'::regclass) THEN
    CREATE TRIGGER company_document_identity_no_truncate BEFORE TRUNCATE
      ON public.company_document_identity_reviews FOR EACH STATEMENT
      EXECUTE FUNCTION public.guard_company_document_revision();
  END IF;
END $$;
