-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure RIAI — Charter Staging Tables Rebuild
-- Compliance: 21 CFR Part 11 §11.10(e) (audit trail), §11.70 (timestamping)
-- Task: PATH_TO_GA §C.10 / Task #20 — rebuild charter staging tables that were
--       dropped by migrations/20260611_drop_charter_staging_tables.sql so the
--       charters CRUD surface (server/routes/charters.ts) can land the
--       deferred POST /api/charters/:charterId/commitments route.
--
-- What this migration creates
-- ---------------------------
--   1. charter_sections        — hierarchical content blocks (was dropped)
--   2. timeline_phases         — phase-based schedule (was dropped)
--   3. project_commitments     — regulatory obligations (was dropped)
--   4. charter_audit_events    — NEW: per-entity append-only audit trail
--                                that lets charter-domain INSERTs couple
--                                their audit row in the same db.transaction
--
-- Why a charter-domain audit table when audit_logs already exists
-- ---------------------------------------------------------------
-- The canonical audit_logs surface (server/services/auditService.ts) opens its
-- OWN pool connection inside logAction(), so a caller in a Drizzle-managed
-- transaction CANNOT enlist the audit write in their transaction — an INSERT
-- can succeed and the audit row can fail (or vice versa) and the two writes
-- are not atomic. That gap is documented as AUDIT_BEST_EFFORT_DOCUMENTED_BUT_
-- RISKY in server/routes/charters.ts.
--
-- charter_audit_events lives in the same connection as the entity tables, so
-- a single `db.transaction(tx => { tx.insert(commitment); tx.insert(audit) })`
-- in the route gives true atomicity: failure of either rolls back both. We
-- KEEP the canonical audit_logs write too (best-effort, post-tx) — that
-- preserves the SHA256-chain integrity across the whole system. The two
-- surfaces serve different purposes:
--   - audit_logs            : cross-cutting tamper-evident chain (system-wide)
--   - charter_audit_events  : write-atomicity within the charter graph
--
-- eCTD/CTD Context
-- ----------------
--   - Module(s): N/A directly — these tables back the project-charter strategy
--     document and downstream commitment tracker. No eCTD content lives here.
--   - Integrity Risk Addressed: re-introduces transactional audit coupling for
--     charter-scoped mutations, closing the documented best-effort gap.
--
-- Determinism Contract
-- --------------------
--   - Schema changes must not undermine deterministic evidence pointers.
--     These tables hold no evidence pointers; no spec version bump required.
--
-- Idempotency & ordering
-- ----------------------
--   - Wrapped in BEGIN/COMMIT (atomic).
--   - CREATE TABLE IF NOT EXISTS — safe to re-run.
--   - timeline_phases is created BEFORE project_commitments because the
--     latter has a phase_id FK pointing at the former.
--   - charter_audit_events is created last; it FKs into project_charters
--     only (not into the new entity tables — entity_id is loose by design
--     so a row can outlive the entity it audited).
--
-- Audit-trail constraints (charter_audit_events)
-- ----------------------------------------------
-- §11.10(e) requires audit trails to be independent, time-stamped, and
-- tamper-evident. We enforce APPEND-ONLY at the table level:
--   - No `updated_at` column (the Drizzle definition matches).
--   - REVOKE UPDATE, DELETE on the table from the application role. The DB
--     superuser retains rights for repair scenarios (documented; gated by
--     break-glass procedures).
--   - A CHECK constraint pins event_type to the documented closed enum so
--     ad-hoc inserts can't smuggle in unknown event types that downstream
--     audit replay couldn't categorise.
--   - eventHash is NOT NULL — a row without its own integrity digest is not
--     auditable in isolation, and a NULL would defeat the per-row defence
--     against silent tampering at the row level.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. charter_sections — hierarchical content blocks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charter_sections (
  id SERIAL PRIMARY KEY,
  charter_id INTEGER NOT NULL
    REFERENCES project_charters(id) ON DELETE CASCADE,
  parent_section_id INTEGER,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  content TEXT,

  -- Version control (21 CFR 11.10(b))
  version INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT,
  previous_version_hash TEXT,

  -- Status machine
  status TEXT DEFAULT 'empty',
  status_transition_log JSON DEFAULT '[]'::json,

  -- Approval (21 CFR 11.100)
  approved_by INTEGER,
  approved_by_role TEXT,
  approved_at TIMESTAMPTZ,

  -- Lock state
  read_only BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ,

  -- Ownership
  sort_order INTEGER DEFAULT 0,
  owner_role TEXT,

  -- Audit
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS charter_sections_charter_idx ON charter_sections(charter_id);
CREATE INDEX IF NOT EXISTS charter_sections_parent_idx  ON charter_sections(parent_section_id);
CREATE INDEX IF NOT EXISTS charter_sections_status_idx  ON charter_sections(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. timeline_phases — phase-based project schedule
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timeline_phases (
  id SERIAL PRIMARY KEY,
  charter_id INTEGER NOT NULL
    REFERENCES project_charters(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  description TEXT,

  -- Functional track
  functional_team TEXT,
  development_stage TEXT,

  -- Dates
  start_date TIMESTAMPTZ,
  target_end_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,

  -- Progress
  status TEXT DEFAULT 'not_started',
  progress INTEGER DEFAULT 0,

  -- Dependencies (cross-functional)
  predecessors JSON,
  blocked_by JSON,
  is_critical_path BOOLEAN DEFAULT FALSE,
  slack_days INTEGER,

  -- Phase gate
  gate_requirements JSON,

  -- Deliverables
  deliverables JSON,
  owner_role TEXT,

  -- Duration estimates
  estimated_weeks INTEGER,
  actual_weeks INTEGER,
  benchmark_min_weeks INTEGER,
  benchmark_max_weeks INTEGER,

  -- Rendering
  color TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS timeline_phases_charter_idx ON timeline_phases(charter_id);
CREATE INDEX IF NOT EXISTS timeline_phases_status_idx  ON timeline_phases(status);
CREATE INDEX IF NOT EXISTS timeline_phases_team_idx    ON timeline_phases(functional_team);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. project_commitments — regulatory obligations
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: phase_id FK requires timeline_phases (created above).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_commitments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  charter_id INTEGER REFERENCES project_charters(id),
  phase_id INTEGER REFERENCES timeline_phases(id),

  -- Commitment details
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  functional_team TEXT,

  -- Source tracking
  source TEXT NOT NULL,
  source_document_id INTEGER,
  extraction_confidence REAL,

  -- Dependencies
  blocked_by_commitments JSON,
  is_critical_path BOOLEAN DEFAULT FALSE,

  -- Timeline
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  urgency TEXT,

  -- Assignment
  owner_user_id INTEGER,
  owner_role TEXT,

  -- Fulfillment (21 CFR 11.10(e))
  fulfillment_proof TEXT,
  fulfillment_artifact_id INTEGER,
  fulfillment_artifact_hash TEXT,
  fulfillment_submitted_by INTEGER,
  fulfillment_submitted_at TIMESTAMPTZ,
  fulfillment_approved_by INTEGER,
  fulfillment_approved_at TIMESTAMPTZ,

  -- Signature (21 CFR Part 11)
  requires_signature BOOLEAN DEFAULT FALSE,
  signed_by INTEGER,
  signed_by_username TEXT,
  signed_by_role TEXT,
  signed_at TIMESTAMPTZ,
  signature_intent TEXT,
  signature_meaning TEXT,
  password_challenge_used BOOLEAN,

  -- Waiver
  waiver_justification TEXT,
  waiver_approved_by INTEGER,
  waiver_approved_at TIMESTAMPTZ,

  -- Extension
  extension_reason TEXT,
  extension_new_due_date TIMESTAMPTZ,
  extension_approved_by INTEGER,

  -- Audit
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proj_commitments_org_idx      ON project_commitments(organization_id);
CREATE INDEX IF NOT EXISTS proj_commitments_project_idx  ON project_commitments(project_id);
CREATE INDEX IF NOT EXISTS proj_commitments_charter_idx  ON project_commitments(charter_id);
CREATE INDEX IF NOT EXISTS proj_commitments_status_idx   ON project_commitments(status);
CREATE INDEX IF NOT EXISTS proj_commitments_due_idx      ON project_commitments(due_date);
CREATE INDEX IF NOT EXISTS proj_commitments_category_idx ON project_commitments(category);
CREATE INDEX IF NOT EXISTS proj_commitments_critical_idx ON project_commitments(is_critical_path);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. charter_audit_events — append-only per-entity audit trail (NEW)
-- ─────────────────────────────────────────────────────────────────────────────
-- §11.10(e) compliance notes:
--   - No `updated_at` column. Rows are immutable post-INSERT.
--   - event_type is gated by a CHECK constraint (closed enum) so audit replay
--     never has to cope with an unknown event class.
--   - event_hash is NOT NULL: every row carries its own SHA-256 integrity
--     digest so per-row tampering is detectable even without chain context.
--   - REVOKE UPDATE, DELETE on app role enforces append-only at the privilege
--     layer (run after the table exists). DBA / superuser retains rights for
--     documented break-glass repair scenarios.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charter_audit_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,

  -- ON DELETE RESTRICT: an audit trail must outlive accidental charter
  -- deletes. If the parent charter is being legitimately removed (rare —
  -- only via decision-register-approved hard-delete flows), the audit rows
  -- must be archived first.
  charter_id INTEGER NOT NULL
    REFERENCES project_charters(id) ON DELETE RESTRICT,

  -- What entity inside the charter graph changed
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,

  -- What happened (closed enum, gated by CHECK below)
  event_type  TEXT NOT NULL,

  -- Who (21 CFR §11.10(e) attribution)
  actor_user_id INTEGER NOT NULL,
  actor_role    TEXT,

  -- When (UTC per 11.70(a))
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Before / after snapshots (JSON; caller responsible for PHI redaction)
  before_value JSON,
  after_value  JSON,

  -- Request context
  ip_address TEXT,
  user_agent TEXT,

  -- Governed-action context
  reason TEXT,
  signature_meaning TEXT,

  -- Per-row integrity digest (SHA-256 hex; 64 chars)
  event_hash TEXT NOT NULL,

  -- ── CHECK constraints (defence-in-depth against ad-hoc inserts) ────────
  CONSTRAINT charter_audit_events_entity_type_chk
    CHECK (entity_type IN ('charter', 'section', 'phase', 'commitment')),
  CONSTRAINT charter_audit_events_event_type_chk
    CHECK (event_type IN (
      'created', 'updated', 'status_changed',
      'approved', 'locked', 'signed', 'waived', 'extended'
    )),
  CONSTRAINT charter_audit_events_event_hash_shape_chk
    CHECK (char_length(event_hash) = 64 AND event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT charter_audit_events_entity_id_positive_chk
    CHECK (entity_id > 0),
  CONSTRAINT charter_audit_events_actor_positive_chk
    CHECK (actor_user_id > 0)
);

CREATE INDEX IF NOT EXISTS charter_audit_events_org_idx          ON charter_audit_events(organization_id);
CREATE INDEX IF NOT EXISTS charter_audit_events_charter_idx      ON charter_audit_events(charter_id);
CREATE INDEX IF NOT EXISTS charter_audit_events_entity_idx       ON charter_audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS charter_audit_events_actor_idx        ON charter_audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS charter_audit_events_occurred_at_idx  ON charter_audit_events(occurred_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only enforcement (§11.10(e))
-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger blocks UPDATE and DELETE on charter_audit_events at the row level.
-- Belt-and-braces with role-grant REVOKE (which targets the app role); this
-- trigger fires regardless of the role attempting the change, including
-- accidental superuser writes. The audit trail is intentionally not modifiable
-- through normal application surfaces — repair scenarios require an explicit,
-- documented break-glass that disables the trigger inside a logged transaction.

CREATE OR REPLACE FUNCTION charter_audit_events_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'charter_audit_events is append-only (§11.10(e)); % blocked', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS charter_audit_events_no_update ON charter_audit_events;
CREATE TRIGGER charter_audit_events_no_update
  BEFORE UPDATE ON charter_audit_events
  FOR EACH ROW EXECUTE FUNCTION charter_audit_events_block_mutation();

DROP TRIGGER IF EXISTS charter_audit_events_no_delete ON charter_audit_events;
CREATE TRIGGER charter_audit_events_no_delete
  BEFORE DELETE ON charter_audit_events
  FOR EACH ROW EXECUTE FUNCTION charter_audit_events_block_mutation();

COMMIT;
