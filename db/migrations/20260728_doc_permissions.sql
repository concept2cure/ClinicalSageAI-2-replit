-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: doc_permissions — object-level authoring permission store (G-01)
-- Date: 2026-07-28
--
-- WHY THIS EXISTS
-- server/routes/authoring.router.ts enforces section-edit permission by querying
-- `doc_permissions` (and the admin grant endpoints INSERT/SELECT it), but NOTHING
-- in the repository ever created the table — it sat on the unbacked-tables
-- baseline. Consequently turning the control on (AUTH_ENFORCE_SECTION_PERMS=1)
-- made every guarded section POST/PATCH/DELETE raise 42P01 and the grant endpoint
-- 500. A security control that cannot be switched on is not a control (G-01).
--
-- This provisions the store the code already expects, TENANT-SCOPED, with the
-- same composite tenant-parent foreign key the other authoring children carry
-- (20260725_authoring_document_loop_tables.sql): a grant's (doc_id, tenant_id)
-- must reference a document in the SAME tenant. Referential integrity bypasses
-- RLS, so this is a physical cross-tenant guard, not a session-var filter.
--
-- Idempotent (CREATE ... IF NOT EXISTS + pg_constraint-guarded FK): safe on a
-- fresh DB, an already-provisioned DB, and to re-run.
--
-- ROLLBACK: DROP TABLE IF EXISTS doc_permissions;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     UUID NOT NULL,
  section_id UUID,                       -- NULL = document-level grant
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,              -- AUTHOR | REVIEWER | ...
  tenant_id  INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The enforcement predicate looks up by (tenant_id, doc_id, email); the grant
-- list reads by (tenant_id, doc_id).
CREATE INDEX IF NOT EXISTS doc_permissions_lookup_idx
  ON doc_permissions (tenant_id, doc_id, email);

DO $$
BEGIN
  -- Composite tenant-parent FK. Requires authoring_documents_id_tenant_key
  -- (created by the authoring loop-tables migration). Guarded so this file is
  -- harmless if the authoring subsystem is not yet present — the applier
  -- provisions that subsystem BEFORE this file runs, so on a fresh DB the guard
  -- finds the key and the constraint actually lands.
  IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'authoring_documents_id_tenant_key'
          AND conrelid = 'public.authoring_documents'::regclass
     )
     AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'doc_permissions_doc_tenant_fkey'
          AND conrelid = 'public.doc_permissions'::regclass
     ) THEN
    ALTER TABLE public.doc_permissions
      ADD CONSTRAINT doc_permissions_doc_tenant_fkey
      FOREIGN KEY (doc_id, tenant_id)
      REFERENCES public.authoring_documents (id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;
