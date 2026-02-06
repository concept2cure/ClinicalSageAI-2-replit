-- =============================================================================
-- Migration 018: Purge Requests + Approval Workflow
-- =============================================================================
-- Purpose: Implement end-of-lifecycle governance for regulated data
--
-- This migration provides:
--   1. Purge request table (append-only) with status workflow
--   2. Multi-role approval tracking (QA, Legal, Security)
--   3. Execution constraints (no purge without approvals + retention check)
--   4. Cryptographic tombstone mechanism (preserve hash, redact content)
--   5. Full audit trail for regulatory inspections
--
-- Part 11 alignment: Controlled destruction with documented approvals
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) Purge Request Status Enum
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purge_request_status') THEN
    CREATE TYPE audit.purge_request_status AS ENUM (
      'REQUESTED',      -- Initial request submitted
      'PENDING_APPROVAL', -- Waiting for required approvals
      'APPROVED',       -- All approvals received
      'REJECTED',       -- Request rejected
      'SCHEDULED',      -- Approved and scheduled for execution
      'EXECUTING',      -- Currently being processed
      'COMPLETED',      -- Successfully executed
      'FAILED',         -- Execution failed
      'CANCELED'        -- Canceled before execution
    );
  END IF;
END $$;

-- =============================================================================
-- B) Purge Action Type Enum
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purge_action_type') THEN
    CREATE TYPE audit.purge_action_type AS ENUM (
      'ARCHIVE',        -- Soft archive: status change, data preserved
      'TOMBSTONE',      -- Cryptographic tombstone: hash preserved, content redacted
      'FULL_PURGE'      -- Full deletion (only for non-regulated data)
    );
  END IF;
END $$;

-- =============================================================================
-- C) Purge Object Type Enum
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purge_object_type') THEN
    CREATE TYPE audit.purge_object_type AS ENUM (
      'SNAPSHOT',
      'SNAPSHOT_EXPORT',
      'FRAGMENT',
      'TRUTH_DATAPOINT',
      'PRECEDENT',
      'AUDIT_LOG_BUNDLE',
      'CONFIG_BUNDLE'
    );
  END IF;
END $$;

-- =============================================================================
-- D) Approver Role Enum
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purge_approver_role') THEN
    CREATE TYPE audit.purge_approver_role AS ENUM (
      'QA',             -- Quality Assurance
      'LEGAL',          -- Legal/Regulatory Affairs
      'SECURITY',       -- Information Security
      'DATA_OWNER',     -- Data Owner / Study Director
      'ADMIN'           -- System Administrator
    );
  END IF;
END $$;

-- =============================================================================
-- E) Purge Requests Table (Append-Only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.purge_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number SERIAL,

  -- Program scope
  program_id UUID REFERENCES core.programs(id),

  -- Target specification
  object_type audit.purge_object_type NOT NULL,
  object_id UUID NOT NULL,
  object_label TEXT,                          -- Human-readable label for audit

  -- Request details
  requested_action audit.purge_action_type NOT NULL,
  reason TEXT NOT NULL,                       -- Justification for purge

  -- Requestor
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status tracking
  status audit.purge_request_status NOT NULL DEFAULT 'REQUESTED',

  -- Snapshot of state at request time (for audit)
  retention_until_at_request TIMESTAMPTZ,     -- Was retention expired?
  legal_hold_state_at_request BOOLEAN,        -- Was it under hold?

  -- Required approvals configuration
  required_approvals TEXT[] NOT NULL DEFAULT ARRAY['QA', 'LEGAL'],

  -- Execution plan
  execution_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_execution_at TIMESTAMPTZ,

  -- Execution results
  executed_at TIMESTAMPTZ,
  executed_by TEXT,
  execution_result JSONB,

  -- Tombstone reference (if action = TOMBSTONE)
  tombstone_id UUID,
  content_hash_preserved TEXT,                -- SHA-256 of original content

  -- Failure tracking
  failure_reason TEXT,
  retry_count INT DEFAULT 0,

  -- Attribution
  request_id TEXT,                            -- External ticket/request ID

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit.purge_requests IS
  'Append-only registry of data purge/archive requests with approval workflow';

COMMENT ON COLUMN audit.purge_requests.content_hash_preserved IS
  'SHA-256 hash of original content - proves existence without revealing content';

-- Indexes
CREATE INDEX IF NOT EXISTS purge_requests_program_idx
  ON audit.purge_requests (program_id);

CREATE INDEX IF NOT EXISTS purge_requests_status_idx
  ON audit.purge_requests (status, scheduled_execution_at);

CREATE INDEX IF NOT EXISTS purge_requests_object_idx
  ON audit.purge_requests (object_type, object_id);

CREATE INDEX IF NOT EXISTS purge_requests_requested_at_idx
  ON audit.purge_requests (requested_at DESC);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION audit.prevent_purge_request_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purge_requests is append-only (regulatory compliance)';
  END IF;

  -- Allow only specific status transitions
  IF TG_OP = 'UPDATE' THEN
    -- Content fields are immutable once created
    IF OLD.object_type != NEW.object_type
       OR OLD.object_id != NEW.object_id
       OR OLD.requested_action != NEW.requested_action
       OR OLD.reason != NEW.reason
       OR OLD.requested_by != NEW.requested_by THEN
      RAISE EXCEPTION 'purge_request content fields are immutable';
    END IF;

    -- Only certain status transitions allowed
    IF OLD.status = 'COMPLETED' OR OLD.status = 'CANCELED' THEN
      RAISE EXCEPTION 'Cannot modify completed or canceled purge requests';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_requests_immutable ON audit.purge_requests;
CREATE TRIGGER trg_purge_requests_immutable
  BEFORE UPDATE OR DELETE ON audit.purge_requests
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_purge_request_deletion();

-- =============================================================================
-- F) Purge Approvals Table (Append-Only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.purge_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  purge_request_id UUID NOT NULL REFERENCES audit.purge_requests(id),

  -- Approver details
  approver_role audit.purge_approver_role NOT NULL,
  approver_identity TEXT NOT NULL,
  approver_email TEXT,

  -- Decision
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT')),
  decision_reason TEXT,

  -- Timestamp
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Attribution
  request_id TEXT,

  -- Prevent duplicate approvals from same role
  UNIQUE (purge_request_id, approver_role)
);

COMMENT ON TABLE audit.purge_approvals IS
  'Append-only registry of purge request approvals/rejections';

CREATE INDEX IF NOT EXISTS purge_approvals_request_idx
  ON audit.purge_approvals (purge_request_id);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION audit.prevent_purge_approval_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'purge_approvals is append-only (regulatory compliance)';
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_approvals_immutable ON audit.purge_approvals;
CREATE TRIGGER trg_purge_approvals_immutable
  BEFORE UPDATE OR DELETE ON audit.purge_approvals
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_purge_approval_mutation();

-- =============================================================================
-- G) Tombstone Records Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.tombstones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to purge request
  purge_request_id UUID NOT NULL REFERENCES audit.purge_requests(id),

  -- Original object reference
  original_schema TEXT NOT NULL,
  original_table TEXT NOT NULL,
  original_id UUID NOT NULL,

  -- Preserved integrity data
  content_hash TEXT NOT NULL,                 -- SHA-256 of original content
  metadata_hash TEXT NOT NULL,                -- SHA-256 of original metadata
  record_existed_from TIMESTAMPTZ NOT NULL,   -- Original created_at
  record_existed_to TIMESTAMPTZ NOT NULL,     -- Tombstone creation time

  -- Tombstone metadata
  tombstoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tombstoned_by TEXT NOT NULL,
  tombstone_reason TEXT NOT NULL,

  -- Chain linking (for related tombstones)
  related_tombstone_ids UUID[],

  -- Attribution
  request_id TEXT
);

COMMENT ON TABLE audit.tombstones IS
  'Cryptographic tombstones proving prior existence without revealing content';

CREATE INDEX IF NOT EXISTS tombstones_original_idx
  ON audit.tombstones (original_schema, original_table, original_id);

CREATE INDEX IF NOT EXISTS tombstones_purge_request_idx
  ON audit.tombstones (purge_request_id);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION audit.prevent_tombstone_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tombstones is append-only (regulatory compliance)';
END;
$$;

DROP TRIGGER IF EXISTS trg_tombstones_immutable ON audit.tombstones;
CREATE TRIGGER trg_tombstones_immutable
  BEFORE UPDATE OR DELETE ON audit.tombstones
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_tombstone_mutation();

-- =============================================================================
-- H) Helper Functions
-- =============================================================================

-- Check if purge request has all required approvals
CREATE OR REPLACE FUNCTION audit.purge_request_has_all_approvals(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM audit.purge_requests pr
    CROSS JOIN UNNEST(pr.required_approvals) AS required_role
    WHERE pr.id = p_request_id
    AND NOT EXISTS (
      SELECT 1 FROM audit.purge_approvals pa
      WHERE pa.purge_request_id = pr.id
      AND pa.approver_role::TEXT = required_role
      AND pa.decision = 'APPROVE'
    )
  );
$$;

-- Check if purge request can be executed
CREATE OR REPLACE FUNCTION audit.can_execute_purge(p_request_id UUID)
RETURNS TABLE (
  can_execute BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_request audit.purge_requests%ROWTYPE;
  v_under_hold BOOLEAN;
BEGIN
  SELECT * INTO v_request FROM audit.purge_requests WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Purge request not found';
    RETURN;
  END IF;

  -- Check status
  IF v_request.status NOT IN ('APPROVED', 'SCHEDULED') THEN
    RETURN QUERY SELECT FALSE, 'Request status must be APPROVED or SCHEDULED';
    RETURN;
  END IF;

  -- Check approvals
  IF NOT audit.purge_request_has_all_approvals(p_request_id) THEN
    RETURN QUERY SELECT FALSE, 'Missing required approvals';
    RETURN;
  END IF;

  -- Check if there are any rejections
  IF EXISTS (
    SELECT 1 FROM audit.purge_approvals
    WHERE purge_request_id = p_request_id AND decision = 'REJECT'
  ) THEN
    RETURN QUERY SELECT FALSE, 'Request has been rejected';
    RETURN;
  END IF;

  -- Check legal hold (current state, not at-request state)
  -- Note: This checks the current hold state, which may have changed
  -- The at-request state is preserved for audit purposes
  SELECT retention.is_under_legal_hold(
    CASE v_request.object_type
      WHEN 'SNAPSHOT' THEN 'prose'
      WHEN 'SNAPSHOT_EXPORT' THEN 'prose'
      WHEN 'FRAGMENT' THEN 'prose'
      WHEN 'TRUTH_DATAPOINT' THEN 'truth'
      WHEN 'PRECEDENT' THEN 'adversarial'
      ELSE 'audit'
    END,
    CASE v_request.object_type
      WHEN 'SNAPSHOT' THEN 'submission_snapshots'
      WHEN 'SNAPSHOT_EXPORT' THEN 'submission_snapshot_exports'
      WHEN 'FRAGMENT' THEN 'smart_fragments'
      WHEN 'TRUTH_DATAPOINT' THEN 'clinical_truth_store'
      WHEN 'PRECEDENT' THEN 'regulatory_adversarial_precedents'
      ELSE 'config_bundles'
    END,
    v_request.object_id,
    v_request.program_id
  ) INTO v_under_hold;

  IF v_under_hold THEN
    RETURN QUERY SELECT FALSE, 'Object is currently under legal hold';
    RETURN;
  END IF;

  -- Check retention (for TOMBSTONE or FULL_PURGE actions)
  IF v_request.requested_action IN ('TOMBSTONE', 'FULL_PURGE') THEN
    IF v_request.retention_until_at_request > NOW() THEN
      RETURN QUERY SELECT FALSE, 'Retention period has not expired';
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, 'Ready for execution';
END;
$$;

-- Get approval status summary for a request
CREATE OR REPLACE FUNCTION audit.get_purge_approval_status(p_request_id UUID)
RETURNS TABLE (
  required_role TEXT,
  status TEXT,
  approver TEXT,
  decided_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    required_role,
    COALESCE(pa.decision, 'PENDING') AS status,
    pa.approver_identity AS approver,
    pa.decided_at
  FROM audit.purge_requests pr
  CROSS JOIN UNNEST(pr.required_approvals) AS required_role
  LEFT JOIN audit.purge_approvals pa ON pa.purge_request_id = pr.id
    AND pa.approver_role::TEXT = required_role
  WHERE pr.id = p_request_id
  ORDER BY required_role;
$$;

-- =============================================================================
-- I) Auto-update status on approval
-- =============================================================================

CREATE OR REPLACE FUNCTION audit.update_purge_status_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If this is a rejection, update status
  IF NEW.decision = 'REJECT' THEN
    UPDATE audit.purge_requests
    SET status = 'REJECTED'
    WHERE id = NEW.purge_request_id
    AND status NOT IN ('COMPLETED', 'CANCELED', 'REJECTED');
    RETURN NEW;
  END IF;

  -- Check if all approvals are now complete
  IF audit.purge_request_has_all_approvals(NEW.purge_request_id) THEN
    UPDATE audit.purge_requests
    SET status = 'APPROVED'
    WHERE id = NEW.purge_request_id
    AND status IN ('REQUESTED', 'PENDING_APPROVAL');
  ELSE
    -- Move to PENDING_APPROVAL if not already
    UPDATE audit.purge_requests
    SET status = 'PENDING_APPROVAL'
    WHERE id = NEW.purge_request_id
    AND status = 'REQUESTED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_purge_status ON audit.purge_approvals;
CREATE TRIGGER trg_update_purge_status
  AFTER INSERT ON audit.purge_approvals
  FOR EACH ROW
  EXECUTE FUNCTION audit.update_purge_status_on_approval();

-- =============================================================================
-- J) Views for Purge Workflow
-- =============================================================================

-- Pending purge requests with approval status
CREATE OR REPLACE VIEW audit.v_pending_purge_requests AS
SELECT
  pr.id,
  pr.request_number,
  pr.program_id,
  p.code AS program_code,
  pr.object_type,
  pr.object_id,
  pr.object_label,
  pr.requested_action,
  pr.reason,
  pr.requested_by,
  pr.requested_at,
  pr.status,
  pr.required_approvals,
  pr.retention_until_at_request,
  pr.legal_hold_state_at_request,
  pr.scheduled_execution_at,
  -- Approval counts
  (SELECT COUNT(*) FROM audit.purge_approvals pa
   WHERE pa.purge_request_id = pr.id AND pa.decision = 'APPROVE') AS approval_count,
  (SELECT COUNT(*) FROM audit.purge_approvals pa
   WHERE pa.purge_request_id = pr.id AND pa.decision = 'REJECT') AS rejection_count,
  array_length(pr.required_approvals, 1) AS required_count
FROM audit.purge_requests pr
LEFT JOIN core.programs p ON p.id = pr.program_id
WHERE pr.status IN ('REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED')
ORDER BY pr.requested_at DESC;

COMMENT ON VIEW audit.v_pending_purge_requests IS
  'Active purge requests awaiting approval or execution';

-- Purge audit trail (for inspections)
CREATE OR REPLACE VIEW audit.v_purge_audit_trail AS
SELECT
  pr.id AS request_id,
  pr.request_number,
  pr.object_type,
  pr.object_id,
  pr.object_label,
  pr.requested_action,
  pr.reason,
  pr.status,
  pr.requested_by,
  pr.requested_at,
  pr.executed_at,
  pr.executed_by,
  t.content_hash AS tombstone_hash,
  t.tombstoned_at,
  -- Approval chain as JSONB array
  (SELECT jsonb_agg(jsonb_build_object(
    'role', pa.approver_role,
    'approver', pa.approver_identity,
    'decision', pa.decision,
    'reason', pa.decision_reason,
    'decided_at', pa.decided_at
  ) ORDER BY pa.decided_at)
  FROM audit.purge_approvals pa
  WHERE pa.purge_request_id = pr.id) AS approval_chain
FROM audit.purge_requests pr
LEFT JOIN audit.tombstones t ON t.purge_request_id = pr.id
ORDER BY pr.requested_at DESC;

COMMENT ON VIEW audit.v_purge_audit_trail IS
  'Complete audit trail of purge requests for regulatory inspections';

COMMIT;
