-- 21 CFR Part 11 audit trail for the authoring loop (ledger C-14 / C-15).
--
-- server/routes/authoring.router.ts:267 has always written a rich audit record —
-- operation, actor, before/after content, content hashes either side, change
-- reason, IP, user agent, session — for every authoring mutation. NOTHING in
-- this repository creates the table it writes to: no migration, and unlike the
-- router's seven ensure*TableExists helpers, no runtime DDL either.
--
-- The write sits inside createAuditTrail's try/catch, which logs
-- "CRITICAL: Failed to create audit trail" and continues, so the loss is silent:
-- every authoring operation appeared to succeed while its Part 11 audit record
-- went nowhere. This migration is code-derived — the column list and order are
-- taken verbatim from that INSERT.
--
-- Deliberately NO foreign keys. An audit trail must outlive the rows it
-- describes; an ON DELETE CASCADE here would let deleting a document destroy the
-- evidence that it existed. Deliberately no UPDATE/DELETE affordances either —
-- the application only ever INSERTs.
--
-- Rollback: DROP TABLE IF EXISTS authoring_audit_trail;

CREATE TABLE IF NOT EXISTS authoring_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID,
  section_id UUID,
  operation_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  before_content TEXT,
  after_content TEXT,
  content_hash_before TEXT,
  content_hash_after TEXT,
  change_reason TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The reader pattern is "everything that happened to this document, newest
-- first", always within a tenant.
CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_doc
  ON authoring_audit_trail (doc_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_tenant
  ON authoring_audit_trail (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authoring_audit_trail_section
  ON authoring_audit_trail (section_id, created_at DESC);
