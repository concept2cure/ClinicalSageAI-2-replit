-- Migration 0007: Tenant Isolation Fixes
-- Fix organizationId type mismatch in unified_workflow tables (text -> integer)
-- This ensures JOIN compatibility with organizations.id (integer) across the platform.
--
-- ── Idempotence (added after the re-run hard failure) ─────────────────────────
-- Every statement below was unconditional. That is fine exactly once, on the
-- database shape this file was written for, and wrong on every re-run:
--
--   • ALTER COLUMN ... TYPE integer on a column that is ALREADY integer is a
--     no-op semantically but NOT syntactically — once the tenant RLS rollout
--     (0021) has attached tenant_isolation_policy to unified_documents, Postgres
--     refuses with "cannot alter type of a column used in a policy definition",
--     and the whole file aborts. install-fresh applies this file in the overlay
--     (step 3) and the policies in step 5, so the FIRST run succeeds and every
--     subsequent run fails. That failure was being printed and then ignored —
--     the installer still declared success.
--   • ADD CONSTRAINT has no IF NOT EXISTS, so the second run errors on a
--     duplicate FK.
--   • CREATE INDEX (step 4) has no IF NOT EXISTS.
--
-- So each operation is now guarded on the catalog state it is trying to reach.
-- The file's EFFECT is unchanged on a database that has not had it applied; it
-- simply stops failing on one that has. Guards are on information_schema /
-- pg_constraint rather than on error-swallowing DO blocks, so a genuine failure
-- (a text column holding a non-numeric value) still aborts loudly.

-- Step 1: Drop dependent indexes that reference organization_id
-- Only when a type change is actually pending: dropping them unconditionally on
-- a re-run would delete indexes the earlier run created and step 4 would then
-- recreate them, churning the catalog for nothing.
DO $$
DECLARE needs_cast boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('unified_documents', 'module_documents', 'workflow_templates', 'document_workflows')
       AND column_name = 'organization_id'
       AND data_type NOT IN ('integer', 'bigint', 'smallint')
  ) INTO needs_cast;

  IF needs_cast THEN
    DROP INDEX IF EXISTS idx_unified_docs_org_status;
    DROP INDEX IF EXISTS idx_doc_workflows_org_status;
  END IF;
END $$;

-- Step 2: Alter column type from text to integer
-- USING clause casts existing text values to integer.
-- Skipped per table when the column is already an integer type — see the header.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unified_documents', 'module_documents', 'workflow_templates', 'document_workflows']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t
         AND column_name = 'organization_id'
         AND data_type NOT IN ('integer', 'bigint', 'smallint')
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN organization_id TYPE integer USING organization_id::integer',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Step 3: Add foreign key constraints to organizations table
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('unified_documents',  'fk_unified_docs_org'),
      ('module_documents',   'fk_module_docs_org'),
      ('workflow_templates', 'fk_workflow_templates_org'),
      ('document_workflows', 'fk_doc_workflows_org')
    ) AS v(tbl, conname)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = 'public' AND rel.relname = r.tbl AND c.conname = r.conname
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES organizations(id)',
        r.tbl, r.conname
      );
    END IF;
  END LOOP;
END $$;

-- Step 4: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_unified_docs_org_status ON unified_documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_workflows_org_status ON document_workflows(organization_id, status);

-- Step 5: Fix audit_logs tenant_id to match standard naming (add alias index)
-- The audit_logs table uses tenant_id (integer) which is semantically the same as organization_id.
-- Adding a comment for documentation rather than renaming (to avoid breaking existing queries).
COMMENT ON COLUMN audit_logs.tenant_id IS 'Organization ID (same as organization_id in other tables). Legacy naming retained for backward compatibility.';
