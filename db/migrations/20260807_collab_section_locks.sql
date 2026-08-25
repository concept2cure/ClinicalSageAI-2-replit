-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — durable collaborative section locks
-- Compliance: 21 CFR Part 11 (auditability of governed authoring), ALCOA+
-- Purpose: Section edit locks lived in a process-local Map
--          (server/routes/realtime-collab.ts DocumentLockManager): lost on
--          every restart, and — behind more than one replica — two authors
--          could hold the same "exclusive" lock at once (collaboration/
--          tasking assessment D25). This table is the shared, durable lock
--          store. Expiry stays TTL-based (expires_at); takeover is an
--          explicit, audited action.
--
-- Determinism Contract:
--   - New table + indexes only, all IF NOT EXISTS; no existing object touched.
--   - lock_key is the tenant-prefixed address (t<tenant>:<doc>[:<section>])
--     the in-memory manager already used, so the route's keying is unchanged.
--   - tenant_id is the integer org key; the tenant-isolation sweep
--     (20260801_tenant_isolation_sweep.sql, always last in the apply set)
--     attaches the standard RLS policy on its next run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS collab_section_locks (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  document_id     TEXT NOT NULL,
  section_id      TEXT,
  lock_key        TEXT NOT NULL UNIQUE,
  locked_by       TEXT NOT NULL,
  locked_by_label TEXT NOT NULL,
  lock_type       TEXT NOT NULL DEFAULT 'advisory',
  reason          TEXT,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS collab_locks_tenant_doc_idx
  ON collab_section_locks (tenant_id, document_id);
CREATE INDEX IF NOT EXISTS collab_locks_expires_idx
  ON collab_section_locks (expires_at);

COMMENT ON TABLE collab_section_locks IS
  'Durable section edit locks for collaborative authoring — shared across replicas, TTL-expired, takeover audited. Replaces the process-local lock Map.';
