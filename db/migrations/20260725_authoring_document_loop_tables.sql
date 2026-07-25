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
