-- ============================================================================
-- Intelligent Licensing + End-User License (EULA) Acceptance
-- ----------------------------------------------------------------------------
-- Adds versioned legal agreements (EULA / ToS / DPA / BAA / Privacy) and an
-- append-only, 21 CFR Part 11-aligned acceptance ledger. The entitlements
-- layer (server/services/licensing/entitlements-service.ts) reads these to
-- compute per-user / per-org outstanding agreements and licensing posture.
--
-- Idempotent: safe to re-run. The EULA service also lazily ensures these
-- tables exist at runtime, so the feature works even before this migration
-- is applied by the canonical runner.
-- ============================================================================

-- Versioned legal agreement catalog ------------------------------------------
CREATE TABLE IF NOT EXISTS license_agreements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_key   TEXT NOT NULL,                       -- 'eula' | 'tos' | 'dpa' | 'baa' | 'privacy'
  version         TEXT NOT NULL,                       -- semver or ISO date
  title           TEXT NOT NULL,
  summary         TEXT,
  body            TEXT,                                -- inline markdown (optional)
  url             TEXT,                                -- external document link (optional)
  scope           TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'organization'
  audience        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- optional tier/industry targeting
  required        BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'active',       -- 'draft' | 'active' | 'superseded'
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at   TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_agreements_key_version_uniq UNIQUE (agreement_key, version),
  CONSTRAINT license_agreements_scope_chk CHECK (scope IN ('user', 'organization')),
  CONSTRAINT license_agreements_status_chk CHECK (status IN ('draft', 'active', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_license_agreements_active
  ON license_agreements (agreement_key, status) WHERE status = 'active';

-- Append-only acceptance ledger (immutable; one row per acceptance) -----------
CREATE TABLE IF NOT EXISTS license_acceptances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id       UUID NOT NULL REFERENCES license_agreements(id),
  agreement_key      TEXT NOT NULL,
  agreement_version  TEXT NOT NULL,
  user_id            INTEGER NOT NULL,
  organization_id    INTEGER,
  accepted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address         TEXT,
  user_agent         TEXT,
  acceptance_hash    TEXT,                              -- sha256(user|org|key|version|ts)
  method             TEXT NOT NULL DEFAULT 'clickwrap', -- 'clickwrap' | 'sso' | 'api'
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_license_acceptances_user
  ON license_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_license_acceptances_org
  ON license_acceptances (organization_id);
CREATE INDEX IF NOT EXISTS idx_license_acceptances_agreement
  ON license_acceptances (agreement_id);
CREATE INDEX IF NOT EXISTS idx_license_acceptances_user_agreement
  ON license_acceptances (user_id, agreement_id);

-- Seed the baseline agreements (only if none exist for that key) --------------
INSERT INTO license_agreements (agreement_key, version, title, summary, scope, required, status)
SELECT 'eula', '2026.06', 'End-User License Agreement',
       'Terms governing individual use of the Concept2Cure platform.', 'user', TRUE, 'active'
WHERE NOT EXISTS (SELECT 1 FROM license_agreements WHERE agreement_key = 'eula');

INSERT INTO license_agreements (agreement_key, version, title, summary, scope, required, status)
SELECT 'tos', '2026.06', 'Terms of Service',
       'Organization-level terms of service.', 'organization', TRUE, 'active'
WHERE NOT EXISTS (SELECT 1 FROM license_agreements WHERE agreement_key = 'tos');
