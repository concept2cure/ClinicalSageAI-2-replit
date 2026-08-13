-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give the 21 CFR Part 11 tamper-evident audit store a real table, so
--          it exists on a provisioned, least-privileged database.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting — every module whose records are audited
--   - Integrity Risk Addressed: absent audit trail. The store a QA unit
--     inspects first did not exist, and the platform reported itself healthy.
--
-- Determinism Contract:
--   - The hash chain (previous_hash / content_hash / chain_hash) is the
--     evidence pointer; the immutability trigger and withheld UPDATE/DELETE
--     grants are what make it non-repudiable.
-- =============================================================================
--
-- 20260813_audit_tamper_proof_log.sql
--
-- Own audit.tamper_proof_log in a migration, so the 21 CFR Part 11 tamper-proof
-- store EXISTS on a provisioned database.
--
-- ── The defect this closes ───────────────────────────────────────────────────
-- This table's only creator was runtime DDL in server/lib/tamper-proof-audit.ts
-- (`initialize()`), executed on the request pool the first time the audit
-- service was touched. On a correctly provisioned, correctly least-privileged
-- deployment that can never succeed:
--
--   • the runtime connects as the non-superuser `app_service` role, which is
--     deliberately NOT the schema owner and holds no CREATE. Worse, `audit` is
--     granted append-only (SELECT, INSERT — see SCHEMA_PRIVILEGE_OVERRIDES in
--     scripts/db/provision-app-role.mjs) precisely to preserve tamper-evidence,
--     so DDL there is exactly what must be refused;
--   • the attempt raised `permission denied for schema audit`, which the caller
--     logged as "Failed to initialize tamper-proof audit table (non-fatal)" and
--     swallowed, falling back to a console writer.
--
-- Reproduced by booting the production build against a database provisioned by
-- install-fresh + deploy-migrate: `SELECT to_regclass('audit.tamper_proof_log')`
-- returned MISSING, and the boot log carried the permission-denied line. The
-- store a pharma QA unit audits first did not exist, and the platform reported
-- itself healthy — a silent-pass control, which is the failure mode the audit
-- trail exists to prevent.
--
-- ── user_id is TEXT, deliberately ───────────────────────────────────────────
-- The runtime DDL declared `user_id UUID`. `public.users.id` is INTEGER, and
-- `log()` binds the caller's id straight through, so every attributed write
-- raised `invalid input syntax for type uuid` — the log accepted only
-- unattributed entries, which for an audit trail is the least useful row it
-- could keep. TEXT records whatever identifier the caller actually held
-- (integer today, UUID on the identity paths) without ever rejecting a write.
-- There is no FK by design: an immutable audit record must survive the deletion
-- of the actor it names, and must never fail to record because a referenced row
-- moved. `session_id` is TEXT for the same reason.
--
-- Idempotent: every statement is IF NOT EXISTS / OR REPLACE, and the trigger is
-- dropped before it is recreated. Safe to re-run on every deploy.

BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.tamper_proof_log (
  id              UUID PRIMARY KEY,
  sequence_number BIGSERIAL UNIQUE NOT NULL,
  event_type      TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor identification. TEXT, not UUID — see the header.
  user_id         TEXT,
  user_name       TEXT,
  session_id      TEXT,
  correlation_id  TEXT,

  -- Resource identification
  resource_type   TEXT,
  resource_id     TEXT,

  -- Event details
  action          TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}',

  -- Hash chain (tamper detection)
  previous_hash   TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  chain_hash      TEXT NOT NULL,

  -- Digital signature (optional, for high-security deployments)
  signature       TEXT,

  -- Client context
  ip_address      INET,
  user_agent      TEXT
);

-- A pre-existing deployment may carry the old UUID-typed columns from the
-- runtime DDL. Widen them rather than leaving a table that rejects attributed
-- writes; USING ::text is lossless for both UUID and integer-shaped values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
       AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE audit.tamper_proof_log ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    RAISE NOTICE '[audit] widened tamper_proof_log.user_id uuid -> text';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'audit' AND table_name = 'tamper_proof_log'
       AND column_name = 'session_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE audit.tamper_proof_log ALTER COLUMN session_id TYPE TEXT USING session_id::text;
    RAISE NOTICE '[audit] widened tamper_proof_log.session_id uuid -> text';
  END IF;

  -- The runtime DDL carried `CONSTRAINT prevent_updates CHECK (TRUE)`, which
  -- enforces nothing at all — it is satisfied by every row. The real protection
  -- is the trigger below plus the revoked UPDATE/DELETE grants. Drop the
  -- decoration so nothing reads it as immutability.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'audit.tamper_proof_log'::regclass AND conname = 'prevent_updates'
  ) THEN
    ALTER TABLE audit.tamper_proof_log DROP CONSTRAINT prevent_updates;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_audit_sequence    ON audit.tamper_proof_log(sequence_number);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp   ON audit.tamper_proof_log(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user        ON audit.tamper_proof_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource    ON audit.tamper_proof_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit.tamper_proof_log(correlation_id);

-- Immutability. Enforced in the database rather than by convention, so it holds
-- against any connection — including a compromised application process.
CREATE OR REPLACE FUNCTION audit.prevent_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable. Modifications are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON audit.tamper_proof_log;
CREATE TRIGGER trg_prevent_audit_mutation
  BEFORE UPDATE OR DELETE ON audit.tamper_proof_log
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_log_mutation();

-- Append-only for the runtime role. provision-app-role.mjs re-applies this on
-- every deploy (audit is in SCHEMA_PRIVILEGE_OVERRIDES); granting here too means
-- the table is usable the moment it exists, regardless of step ordering.
DO $$
DECLARE
  app_role text := current_setting('app.service_role', TRUE);
BEGIN
  IF app_role IS NULL OR app_role = '' THEN app_role := 'app_service'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA audit TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT ON audit.tamper_proof_log TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE audit.tamper_proof_log_sequence_number_seq TO %I', app_role);
    -- Explicitly NOT granted: UPDATE, DELETE. The trigger above raises on both,
    -- and withholding the privilege means the attempt is refused a layer earlier.
    RAISE NOTICE '[audit] append-only grants applied to %', app_role;
  END IF;
END
$$;

COMMIT;
