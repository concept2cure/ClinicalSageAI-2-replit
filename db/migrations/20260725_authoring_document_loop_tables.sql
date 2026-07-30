-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Authoring document-loop storage (code-derived reconstruction)
-- Date: 2026-07-25
-- Conflict: C-11 (docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md)
--
-- WHY THIS EXISTS
-- The flagship authoring loop (server/routes/authoring.router.ts: document
-- create, sections, revisions, revert, comments, citations, PIN, freeze,
-- e-sign) reads and writes tables that had NO CREATE TABLE statement anywhere
-- in the repository — not dead lineage, no lineage. The DDL only ever existed
-- inside whichever development database the loop was demonstrated against. On
-- a freshly deployed environment every one of these handlers throws.
--
-- METHOD: this DDL is reconstructed from the code's own column enumerations —
-- the handlers' INSERT column lists and full-column SELECTs. Where the code
-- implies a constraint (ON CONFLICT targets, ::uuid casts, defaults used),
-- the constraint is included. Golden Journey A drives the real router against
-- exactly this DDL, so any divergence between reconstruction and code fails
-- the journey.
--
-- DELIBERATE EXCLUSION: electronic_signatures. The code writes a shape
-- (doc_id, signature_intent, document_hash, pin_verified, ip_address,
-- user_agent, tenant_id) that CONFLICTS with the deployed push-surface table
-- of the same name in shared/schema.ts (document_id, version_id,
-- signature_purpose, signer_id, …). Creating a second shape here would
-- recreate conflict C-1. That reconciliation needs its own decision; until it
-- lands, the e-sign INSERT fails against deployed environments and Journey A
-- carries the code shape as TEST-ONLY DDL. See ledger C-11.
--
-- ROLLBACK: all tables are new and start empty.
--   DROP TABLE IF EXISTS user_pins, frozen_documents, authoring_citations,
--     authoring_comments, doc_revisions, authoring_sections, authoring_documents;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS authoring_documents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  module TEXT,
  product_code TEXT,
  locale TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  template_id UUID,
  -- columns enumerated by the freeze handler's full-row SELECT
  submitted_at TIMESTAMPTZ,
  current_workflow_id UUID,
  approved_at TIMESTAMPTZ,
  frozen_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  version TEXT,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_documents_tenant_idx
  ON authoring_documents (tenant_id);

CREATE TABLE IF NOT EXISTS authoring_sections (
  id UUID PRIMARY KEY,
  doc_id UUID NOT NULL REFERENCES authoring_documents(id) ON DELETE CASCADE,
  code TEXT,
  title TEXT,
  content TEXT,
  order_index INTEGER DEFAULT 0,
  track_changes BOOLEAN DEFAULT FALSE,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_sections_doc_idx
  ON authoring_sections (doc_id, tenant_id);

-- Revision trail for authoring_sections (the history handler LEFT JOINs
-- users ON u.id = created_by::uuid, so created_by stores a user id string).
CREATE TABLE IF NOT EXISTS doc_revisions (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES authoring_sections(id) ON DELETE CASCADE,
  content TEXT,
  created_by TEXT,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_revisions_section_idx
  ON doc_revisions (section_id, tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS authoring_comments (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL,
  doc_id UUID,
  body TEXT NOT NULL,
  anchor JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_comments_section_idx
  ON authoring_comments (section_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_citations (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL,
  source TEXT,
  anchor JSONB,
  citation_text TEXT,
  reference_id TEXT,
  created_by TEXT,
  -- written by the citation-token flow; enumerated by the list handler
  payload_sha256 TEXT,
  frozen_at TIMESTAMPTZ,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_citations_section_idx
  ON authoring_citations (section_id, tenant_id);

-- Immutable freeze snapshots. UNIQUE target required by the e-sign handler's
-- ON CONFLICT (document_id, version, tenant_id) DO NOTHING.
CREATE TABLE IF NOT EXISTS frozen_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  version TEXT NOT NULL,
  frozen_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_reason TEXT,
  tenant_id INTEGER NOT NULL,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version, tenant_id)
);

-- Bcrypt-hashed signing PINs with lockout counters. UNIQUE target required by
-- the create-pin handler's ON CONFLICT (email, tenant_id).
CREATE TABLE IF NOT EXISTS user_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  tenant_id INTEGER NOT NULL,
  pin_expires_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, tenant_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Tenant-consistent parentage at the DB boundary (P0 #4).
--
-- The reconstructed FKs above reference only the parent id (or, for comments and
-- citations, nothing). RLS (tenant_isolation_policy) filters each row by its OWN
-- tenant_id but never checks that a child and its parent share a tenant — so a
-- request authenticated for tenant A could create a child that structurally
-- points at a tenant-B parent. Referential-integrity checks BYPASS RLS, so a
-- composite (parent_id, tenant_id) → (id, tenant_id) foreign key is a physical
-- invariant that holds independent of session vars: defense in depth beneath
-- FORCE ROW LEVEL SECURITY.
--
-- The Part 11 EVIDENCE tables (frozen_documents, authoring_signatures,
-- authoring_audit_trail, authoring_workflow_steps) are DELIBERATELY excluded —
-- their own migration headers state the evidence must outlive the records it
-- describes, so they carry no FK by design. This constrains only the four
-- working-content child links.
--
-- Idempotent (guarded on pg_constraint), so it is safe on a fresh DB, on an
-- already-provisioned DB, and to re-run. On a retrofit where pre-existing rows
-- violate a new FK the validated ADD CONSTRAINT raises and the whole
-- provisioning transaction rolls back (fail-closed at provision time); see the
-- retrofit runbook in docs/pilot/PILOT_PLAN.md.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Composite-FK targets: parents need a UNIQUE(id, tenant_id) to be referenced.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_documents_id_tenant_key' AND conrelid = 'public.authoring_documents'::regclass) THEN
    ALTER TABLE public.authoring_documents ADD CONSTRAINT authoring_documents_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_sections_id_tenant_key' AND conrelid = 'public.authoring_sections'::regclass) THEN
    ALTER TABLE public.authoring_sections ADD CONSTRAINT authoring_sections_id_tenant_key UNIQUE (id, tenant_id);
  END IF;

  -- sections.doc_id → documents(id, tenant_id): replace the single-column inline
  -- FK (Postgres auto-names it authoring_sections_doc_id_fkey); keep ON DELETE CASCADE.
  ALTER TABLE public.authoring_sections DROP CONSTRAINT IF EXISTS authoring_sections_doc_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_sections_doc_tenant_fkey' AND conrelid = 'public.authoring_sections'::regclass) THEN
    ALTER TABLE public.authoring_sections ADD CONSTRAINT authoring_sections_doc_tenant_fkey FOREIGN KEY (doc_id, tenant_id) REFERENCES public.authoring_documents (id, tenant_id) ON DELETE CASCADE;
  END IF;

  -- doc_revisions.section_id → sections(id, tenant_id): replace single-column inline FK.
  ALTER TABLE public.doc_revisions DROP CONSTRAINT IF EXISTS doc_revisions_section_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doc_revisions_section_tenant_fkey' AND conrelid = 'public.doc_revisions'::regclass) THEN
    ALTER TABLE public.doc_revisions ADD CONSTRAINT doc_revisions_section_tenant_fkey FOREIGN KEY (section_id, tenant_id) REFERENCES public.authoring_sections (id, tenant_id) ON DELETE CASCADE;
  END IF;

  -- comments.section_id → sections(id, tenant_id): NO prior FK; adds RI + tenant match.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_comments_section_tenant_fkey' AND conrelid = 'public.authoring_comments'::regclass) THEN
    ALTER TABLE public.authoring_comments ADD CONSTRAINT authoring_comments_section_tenant_fkey FOREIGN KEY (section_id, tenant_id) REFERENCES public.authoring_sections (id, tenant_id) ON DELETE CASCADE;
  END IF;

  -- citations.section_id → sections(id, tenant_id): NO prior FK.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_citations_section_tenant_fkey' AND conrelid = 'public.authoring_citations'::regclass) THEN
    ALTER TABLE public.authoring_citations ADD CONSTRAINT authoring_citations_section_tenant_fkey FOREIGN KEY (section_id, tenant_id) REFERENCES public.authoring_sections (id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Section-level authoring permissions (C2C-AUTHOR-001 / C2C-AUTHOR-002).
--
-- WHY THIS EXISTS
-- server/routes/authoring.router.ts has always queried `doc_permissions` from
-- the section write gate (canEditSection) and written to it from
-- POST /docs/:docId/permissions — and NOTHING in the repository created it. It
-- was carried in scripts/ci/unbacked-tables-baseline.json as a phantom. The
-- consequence was not a cosmetic gap: the fine-grained gate could only ever
-- deny (relation does not exist → fail closed), so the feature flag that turns
-- per-user section permissions ON could never be turned on, which is exactly
-- why the insecure allow-all default survived.
--
-- SHAPE is derived from the code's own usage, same method as the tables above:
-- the INSERT column list (doc_id, section_id, email, role, tenant_id) and the
-- gate's predicates (`p.section_id IS NULL` = a grant over the whole document;
-- role in AUTHOR/REVIEWER).
--
-- TENANT KEY is INTEGER, matching every other authoring table and the app RLS
-- policy (`tenant_id = current_setting(...)::INT`). RLS itself is NOT declared
-- here — this file creates tables only; scripts/db/authoring-subsystem.mjs
-- applies tenant_isolation_policy to every table of the unit, and
-- migrations/0021_enable_rls_everywhere.sql covers the install-fresh path.
--
-- The composite FK follows the tenant-consistent-parentage rule established in
-- the DO-block above: a grant cannot structurally point at another tenant's
-- document. It is declared here, AFTER that block, because it depends on the
-- UNIQUE (id, tenant_id) the block adds to authoring_documents.
--
-- ROLLBACK:  DROP TABLE IF EXISTS doc_permissions;
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS doc_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL,
  -- NULL = a document-level grant covering every section of the document.
  section_id UUID,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_permissions_doc_tenant_fkey
    FOREIGN KEY (doc_id, tenant_id)
    REFERENCES public.authoring_documents (id, tenant_id) ON DELETE CASCADE,
  -- MATCH SIMPLE: a NULL section_id (document-level grant) is exempt, while a
  -- section-scoped grant must point at a section of the SAME tenant.
  CONSTRAINT doc_permissions_section_tenant_fkey
    FOREIGN KEY (section_id, tenant_id)
    REFERENCES public.authoring_sections (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS doc_permissions_doc_idx
  ON doc_permissions (doc_id, tenant_id);
-- The gate looks a grant up by tenant + grantee on every section write.
CREATE INDEX IF NOT EXISTS doc_permissions_grantee_idx
  ON doc_permissions (tenant_id, email);
