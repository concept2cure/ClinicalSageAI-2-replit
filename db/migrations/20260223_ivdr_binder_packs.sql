-- ═══════════════════════════════════════════════════════════════════════════════
-- IVDR Evidence Binder + Pack Builder Schema
--
-- Creates:
--   1. ivdr_binder_claims        — structured requirements / claims for IVDR pack
--   2. ivdr_binder_evidence      — vault-linked evidence per claim (with excerpt offsets)
--   3. ivdr_pack_counters        — sequential pack version allocation (per org/project/type)
--   4. ivdr_pack_build_jobs      — async job queue for pack generation
--   5. ivdr_packs                — immutable pack output records
--   6. ivdr_pack_snapshots       — deterministic snapshot JSON per pack build
--
-- All tables enforce organization isolation via organization_id.
-- No physical deletes — evidence uses soft-delete (removed_at).
-- Pack rows are append-only; revocation is an event (revoked_at + reason).
--
-- Migration: 20260223_ivdr_binder_packs.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. EVIDENCE BINDER — CLAIMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_binder_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     BIGINT NOT NULL,
  project_id          TEXT   NOT NULL,   -- matches project identifier in submission center

  claim_key           TEXT   NOT NULL,   -- stable code e.g. ANALYTICAL_LOD_ESTABLISHED
  title               TEXT   NOT NULL,
  description         TEXT   NULL,

  status              TEXT   NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','BLOCKED')),

  required_for_pack   BOOLEAN NOT NULL DEFAULT FALSE,
  pack_scope          TEXT    NOT NULL DEFAULT 'IVDR_TECHDOC'
    CHECK (pack_scope IN ('IVDR_TECHDOC','IVDR_NB_PRECHECK','BOTH')),

  owner_user_id       TEXT NULL,

  approved_at         TIMESTAMPTZ NULL,
  approved_by_user_id TEXT NULL,
  approval_reason     TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id  TEXT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id  TEXT NULL,

  UNIQUE (organization_id, project_id, claim_key)
);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_claims_org_project
  ON ivdr_binder_claims(organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_claims_status
  ON ivdr_binder_claims(organization_id, project_id, status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. EVIDENCE BINDER — EVIDENCE LINKS (per-claim)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_binder_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     BIGINT NOT NULL,
  project_id          TEXT   NOT NULL,
  claim_id            UUID   NOT NULL REFERENCES ivdr_binder_claims(id) ON DELETE RESTRICT,

  vault_file_id       TEXT   NOT NULL,
  vault_version_id    TEXT   NOT NULL,

  excerpt_start       INTEGER NULL,
  excerpt_end         INTEGER NULL,
  excerpt_hash_sha256 TEXT NULL,       -- SHA-256 of excerpt bytes (canonical UTF-8)
  excerpt_preview     TEXT NULL,        -- short preview (max 500 chars)

  notes               TEXT NULL,

  -- Soft-delete: evidence is never physically deleted
  removed_at          TIMESTAMPTZ NULL,
  removed_by_user_id  TEXT NULL,
  removal_reason      TEXT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id  TEXT NULL,

  -- Offsets must be paired + valid
  CHECK (
    (excerpt_start IS NULL AND excerpt_end IS NULL)
    OR
    (excerpt_start IS NOT NULL AND excerpt_end IS NOT NULL AND excerpt_start >= 0 AND excerpt_end > excerpt_start)
  )
);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_claim
  ON ivdr_binder_evidence(claim_id);

CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_org_project
  ON ivdr_binder_evidence(organization_id, project_id);

-- Active-only index for standard queries
CREATE INDEX IF NOT EXISTS idx_ivdr_binder_evidence_active
  ON ivdr_binder_evidence(claim_id)
  WHERE removed_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. PACK VERSION COUNTERS (sequential per org/project/type)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_pack_counters (
  organization_id BIGINT NOT NULL,
  project_id      TEXT   NOT NULL,
  pack_type       TEXT   NOT NULL CHECK (pack_type IN ('IVDR_TECHDOC','IVDR_NB_PRECHECK')),
  next_version    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (organization_id, project_id, pack_type)
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PACK BUILD JOBS (async queue)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_pack_build_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       BIGINT NOT NULL,
  project_id            TEXT   NOT NULL,

  pack_type             TEXT   NOT NULL
    CHECK (pack_type IN ('IVDR_TECHDOC','IVDR_NB_PRECHECK')),

  requested_by_user_id  TEXT NULL,

  outputs               JSONB  NOT NULL DEFAULT '["MANIFEST"]',
  use_latest_approved   BOOLEAN NOT NULL DEFAULT TRUE,
  sign_build            BOOLEAN NOT NULL DEFAULT FALSE,

  status                TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),

  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ NULL,
  completed_at          TIMESTAMPTZ NULL,

  error_code            TEXT NULL,
  error_label           TEXT NULL,

  output_pack_id        UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_ivdr_pack_jobs_queue
  ON ivdr_pack_build_jobs(status, requested_at ASC)
  WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_ivdr_pack_jobs_org_project
  ON ivdr_pack_build_jobs(organization_id, project_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. PACKS (immutable output records)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_packs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       BIGINT NOT NULL,
  project_id            TEXT   NOT NULL,

  pack_type             TEXT   NOT NULL
    CHECK (pack_type IN ('IVDR_TECHDOC','IVDR_NB_PRECHECK')),

  pack_version          INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'SUCCEEDED'
    CHECK (status IN ('SUCCEEDED','REVOKED')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id    TEXT NULL,

  manifest_hash_sha256  TEXT NOT NULL,
  snapshot_hash_sha256  TEXT NOT NULL,

  -- Vault artifact references (nullable until build completes)
  manifest_vault_file_id    TEXT NULL,
  manifest_vault_version_id TEXT NULL,
  pdf_vault_file_id         TEXT NULL,
  pdf_vault_version_id      TEXT NULL,
  docx_vault_file_id        TEXT NULL,
  docx_vault_version_id     TEXT NULL,
  zip_vault_file_id         TEXT NULL,
  zip_vault_version_id      TEXT NULL,

  -- Revocation (event, not delete)
  revoked_at            TIMESTAMPTZ NULL,
  revoked_by_user_id    TEXT NULL,
  revoke_reason         TEXT NULL,

  UNIQUE (organization_id, project_id, pack_type, pack_version)
);

CREATE INDEX IF NOT EXISTS idx_ivdr_packs_org_project
  ON ivdr_packs(organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_ivdr_packs_latest
  ON ivdr_packs(organization_id, project_id, pack_type, pack_version DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PACK SNAPSHOTS (deterministic, hashable)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ivdr_pack_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       BIGINT NOT NULL,
  project_id            TEXT   NOT NULL,
  pack_id               UUID   NOT NULL REFERENCES ivdr_packs(id) ON DELETE RESTRICT,

  snapshot_json         JSONB  NOT NULL,
  snapshot_hash_sha256  TEXT   NOT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (pack_id)
);

CREATE INDEX IF NOT EXISTS idx_ivdr_pack_snapshots_org_project
  ON ivdr_pack_snapshots(organization_id, project_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. All binder + pack tables created.
-- ═══════════════════════════════════════════════════════════════════════════════
