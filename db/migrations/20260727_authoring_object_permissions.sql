-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — governed submission authoring
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision durable, tenant-safe document and section permissions for
--          the canonical authoring workflow.
--
-- eCTD/CTD Context:
--   - Module(s): Modules 1-5 authoring and dossier content lifecycle
--   - Integrity Risk Addressed: same-tenant unauthorized mutation, false actor
--     authority, permission drift, and cross-tenant parentage
--
-- Determinism Contract:
--   - Permission decisions are derived from durable rows and exact object scope.
--   - Document creators are seeded as OWNER + AUTHOR in the same DB operation.
--   - Any schema change to role/action semantics requires service and test update.
--
-- Notes:
--   - This file is the fifth member of the atomic authoring subsystem.
--   - RLS and composite foreign keys enforce tenant consistency.
--   - The migration is idempotent and safe to re-run.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- Concept2Cure authoring object permissions
--
-- Purpose
--   Make document/section authorization durable and tenant-safe. Document
--   creators become explicit OWNER + AUTHOR principals. REVIEWER and APPROVER
--   access is granted explicitly; no global QA/RA shortcut is encoded here.
--
-- The table belongs to the atomic authoring subsystem and is provisioned by
-- scripts/db/authoring-subsystem.mjs. All statements are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.doc_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL,
  section_id UUID,
  tenant_id INTEGER NOT NULL,
  principal_id TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  grant_reason TEXT,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Converge a pre-existing development table to the canonical shape rather than
-- silently accepting whichever ad-hoc shape happened to be created first.
ALTER TABLE public.doc_permissions
  ADD COLUMN IF NOT EXISTS section_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
  ADD COLUMN IF NOT EXISTS principal_id TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS granted_by TEXT,
  ADD COLUMN IF NOT EXISTS grant_reason TEXT,
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by TEXT,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- The base loop-tables migration created doc_permissions with email TEXT NOT NULL.
-- This subsystem's SECURITY DEFINER seed trigger inserts email = creator_email,
-- which is NULL whenever authoring_documents.created_by has no matching
-- public.users row. Under the old NOT NULL, that AFTER-INSERT trigger row would
-- violate the constraint and roll back the parent document create (a 500 on the
-- flagship authoring loop). Converge to this file's own nullable-email intent
-- (CREATE TABLE above declares email TEXT); base router INSERTs remain valid.
ALTER TABLE public.doc_permissions ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doc_permissions_role_check'
      AND conrelid = 'public.doc_permissions'::regclass
  ) THEN
    ALTER TABLE public.doc_permissions
      ADD CONSTRAINT doc_permissions_role_check
      CHECK (role IN ('OWNER', 'AUTHOR', 'REVIEWER', 'APPROVER', 'VIEWER'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doc_permissions_validity_check'
      AND conrelid = 'public.doc_permissions'::regclass
  ) THEN
    ALTER TABLE public.doc_permissions
      ADD CONSTRAINT doc_permissions_validity_check
      CHECK (valid_until IS NULL OR valid_until > valid_from);
  END IF;

  -- The composite parent keys and the doc_permissions tenant-parentage FKs only
  -- make sense once the authoring parent tables exist. In the authoring-subsystem
  -- lineage the loop-tables migration creates them first, so these run normally.
  -- When this file is applied standalone before loop-tables (e.g. the preview-DB
  -- new-migration apply job), the parent tables may be absent — to_regclass()
  -- yields NULL instead of throwing, so the parent-dependent DDL is skipped
  -- rather than hard-erroring on a missing relation.
  IF to_regclass('public.authoring_documents') IS NOT NULL THEN
    -- Existing authoring migrations create the composite document key. Keep this
    -- guard for retrofits that predate the tenant-parentage remediation.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'authoring_documents_id_tenant_key'
        AND conrelid = 'public.authoring_documents'::regclass
    ) THEN
      ALTER TABLE public.authoring_documents
        ADD CONSTRAINT authoring_documents_id_tenant_key UNIQUE (id, tenant_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'doc_permissions_doc_tenant_fkey'
        AND conrelid = 'public.doc_permissions'::regclass
    ) THEN
      ALTER TABLE public.doc_permissions
        ADD CONSTRAINT doc_permissions_doc_tenant_fkey
        FOREIGN KEY (doc_id, tenant_id)
        REFERENCES public.authoring_documents (id, tenant_id)
        ON DELETE CASCADE;
    END IF;
  END IF;

  -- A section-scoped permission must structurally belong to the declared
  -- document and tenant, not merely point at a section id visible under RLS.
  IF to_regclass('public.authoring_sections') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'authoring_sections_id_doc_tenant_key'
        AND conrelid = 'public.authoring_sections'::regclass
    ) THEN
      ALTER TABLE public.authoring_sections
        ADD CONSTRAINT authoring_sections_id_doc_tenant_key
        UNIQUE (id, doc_id, tenant_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'doc_permissions_section_doc_tenant_fkey'
        AND conrelid = 'public.doc_permissions'::regclass
    ) THEN
      ALTER TABLE public.doc_permissions
        ADD CONSTRAINT doc_permissions_section_doc_tenant_fkey
        FOREIGN KEY (section_id, doc_id, tenant_id)
        REFERENCES public.authoring_sections (id, doc_id, tenant_id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS doc_permissions_lookup_idx
  ON public.doc_permissions (tenant_id, doc_id, principal_id, role)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS doc_permissions_email_lookup_idx
  ON public.doc_permissions (tenant_id, doc_id, lower(email), role)
  WHERE revoked_at IS NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS doc_permissions_section_lookup_idx
  ON public.doc_permissions (tenant_id, section_id, principal_id, role)
  WHERE revoked_at IS NULL AND section_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS doc_permissions_active_doc_role_uq
  ON public.doc_permissions (tenant_id, doc_id, principal_id, role)
  WHERE section_id IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS doc_permissions_active_section_role_uq
  ON public.doc_permissions (tenant_id, doc_id, section_id, principal_id, role)
  WHERE section_id IS NOT NULL AND revoked_at IS NULL;

-- Seed the creator as the durable document OWNER and AUTHOR in the same database
-- operation that creates the document. OWNER carries management authority;
-- AUTHOR carries ordinary editing authority and keeps compatibility with the
-- earlier authoring role vocabulary.
CREATE OR REPLACE FUNCTION public.seed_authoring_document_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  creator_email TEXT;
BEGIN
  -- Resolve the creator email from public.users when that table is present. The
  -- email is a nullable convenience for permission display; the authoring
  -- subsystem can be provisioned independently of the core users table (the
  -- durable applier does exactly this), so a missing users table must never
  -- break document creation — seed with a NULL email in that case.
  IF to_regclass('public.users') IS NOT NULL THEN
    SELECT lower(u.email::text)
      INTO creator_email
      FROM public.users u
     WHERE u.id::text = NEW.created_by::text
     LIMIT 1;
  END IF;

  INSERT INTO public.doc_permissions
    (doc_id, section_id, tenant_id, principal_id, email, role,
     granted_by, grant_reason)
  VALUES
    (NEW.id, NULL, NEW.tenant_id, NEW.created_by::text, creator_email,
     'OWNER', NEW.created_by::text, 'Document creator'),
    (NEW.id, NULL, NEW.tenant_id, NEW.created_by::text, creator_email,
     'AUTHOR', NEW.created_by::text, 'Document creator')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- The seed trigger and the historical backfill both target authoring_documents.
-- In the authoring-subsystem lineage the loop-tables migration creates that table
-- first, so both run normally. When this file is applied standalone before
-- loop-tables (e.g. the preview-DB new-migration apply job), authoring_documents
-- may be absent — guard so the trigger/backfill are skipped rather than hard-
-- erroring on a missing relation.
DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS authoring_document_seed_permissions
      ON public.authoring_documents;
    CREATE TRIGGER authoring_document_seed_permissions
    AFTER INSERT ON public.authoring_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.seed_authoring_document_permissions();

    -- Retrofit existing documents. Idempotent; records the original creator as
    -- the grantor so historical ownership remains attributable. The creator
    -- email is read from public.users, so the backfill runs only when that
    -- table exists: the durable authoring-subsystem applier provisions this
    -- subsystem independently of (and before) the core users table, and must
    -- not hard-require it at apply time. In a real deploy users exists, so the
    -- backfill runs with the email join; the seed trigger keeps ownership
    -- attributable for documents created afterward.
    IF to_regclass('public.users') IS NOT NULL THEN
      INSERT INTO public.doc_permissions
        (doc_id, section_id, tenant_id, principal_id, email, role,
         granted_by, grant_reason)
      SELECT d.id, NULL, d.tenant_id, d.created_by::text, lower(u.email::text), role_name,
             d.created_by::text, 'Backfilled document creator'
        FROM public.authoring_documents d
        LEFT JOIN public.users u ON u.id::text = d.created_by::text
       CROSS JOIN (VALUES ('OWNER'), ('AUTHOR')) AS roles(role_name)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- Tenant isolation mirrors the canonical authoring policy installed by the
-- subsystem helper. FORCE RLS prevents table owners from accidentally bypassing
-- tenant policy during ordinary application queries.
ALTER TABLE public.doc_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.doc_permissions;
CREATE POLICY tenant_isolation_policy ON public.doc_permissions
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR tenant_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR tenant_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );
