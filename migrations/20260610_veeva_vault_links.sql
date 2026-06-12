-- ============================================================================
-- Veeva Vault coexistence — local ↔ Vault document linkage
-- One row per (org, local document) ↔ Vault document pairing. The sync
-- service upserts here on every push/pull so coexistence is idempotent and
-- auditable ("which Vault document is this artifact?", and vice versa).
-- Idempotent; safe on any schema state (Neon preview or bare CI DB).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS veeva_vault_links (
  id                  SERIAL PRIMARY KEY,
  organization_id     INTEGER NOT NULL,
  -- Polymorphic local reference (same convention as submission_leaves).
  document_table      TEXT NOT NULL,
  document_id         INTEGER NOT NULL,
  vault_document_id   BIGINT NOT NULL,
  vault_major_version INTEGER,
  vault_minor_version INTEGER,
  -- SHA-256 of the bytes last exchanged, for drift detection.
  content_sha256      TEXT,
  last_direction      TEXT NOT NULL CHECK (last_direction IN ('push', 'pull')),
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_vault_links_local UNIQUE (organization_id, document_table, document_id),
  CONSTRAINT uq_vault_links_vault UNIQUE (organization_id, vault_document_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_links_org ON veeva_vault_links (organization_id);
CREATE INDEX IF NOT EXISTS idx_vault_links_vault_doc ON veeva_vault_links (vault_document_id);

COMMIT;
