-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Orchestration Kernel schema — workflow/step templates, runs, events,
--          RLS-isolated execution graph for regulatory program lifecycle.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (admin), Module 2 (summaries), Module 5 (clinical)
--   - Integrity Risk Addressed: Untracked workflow state, missing audit trail,
--     tenant isolation gaps in multi-program orchestration.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies enforce program_id isolation via app.current_program_id GUC.
--   - Migration is idempotent (IF NOT EXISTS on schema, tables, indexes).
-- =============================================================================

-- ============================================================================
-- Phase 4 — Orchestration Kernel: Domain Spine + Work Graph
-- Migration: 20260206_phase4_orchestration_kernel.sql
--
-- Purpose:
--   1) Create the `orchestration` schema for workflow management
--   2) Define reusable workflow/step templates (the "what")
--   3) Define workflow runs / step runs (the "when + who")
--   4) Bridge step_runs → A8 vault.review_batches (don't build second queue)
--   5) Append-only event log for forensic traceability
--   6) RLS policies scoped to program_id
--   7) Performance indexes
--
-- Anchors to: core.programs(id) — the Domain Spine pivot
-- RLS GUC:    app.current_program_id (consistent with vault.* pattern)
-- PK style:   UUID (consistent with core/identity/vault schemas)
--
-- IDEMPOTENT: Safe to run multiple times (Neon-friendly)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Schema
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS orchestration;

-- ============================================================================
-- 1) Workflow Templates — reusable blueprints
--    e.g. "IND Pre-Submission", "NDA Module 2 Assembly", "CSR Review Cycle"
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.workflow_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT,                   -- 'submission', 'review', 'manufacturing'
    version         INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT NOT NULL DEFAULT 'system'
);

-- Unique on (code, version) so we can evolve templates over time
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_workflow_templates_code_version'
    ) THEN
        ALTER TABLE orchestration.workflow_templates
            ADD CONSTRAINT uq_workflow_templates_code_version
            UNIQUE (code, version);
    END IF;
END $$;


-- ============================================================================
-- 2) Step Templates — ordered steps within a workflow template
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.step_templates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id    UUID NOT NULL
        REFERENCES orchestration.workflow_templates(id) ON DELETE CASCADE,
    code                    TEXT NOT NULL,            -- 'extract_claims', 'ai_review', 'qc_gate'
    name                    TEXT NOT NULL,
    description             TEXT,
    step_type               TEXT NOT NULL DEFAULT 'task',
        -- 'task'              — generic work item
        -- 'gate'              — quality gate (blocks until approved)
        -- 'ai_review'         — AI-powered review step (bridges to vault batches)
        -- 'human_approval'    — requires human sign-off
        -- 'document_gen'      — generates a document artifact
        -- 'batch_job'         — delegates to A8 batch worker
        -- 'external_api'      — calls an external service
    ordinal                 INTEGER NOT NULL DEFAULT 0,
    is_optional             BOOLEAN NOT NULL DEFAULT FALSE,
    timeout_seconds         INTEGER,                 -- max execution time (NULL = no limit)
    retry_policy            JSONB NOT NULL DEFAULT '{"max_retries": 0, "backoff_seconds": 60}'::jsonb,
    config                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_step_templates_workflow_code'
    ) THEN
        ALTER TABLE orchestration.step_templates
            ADD CONSTRAINT uq_step_templates_workflow_code
            UNIQUE (workflow_template_id, code);
    END IF;
END $$;


-- ============================================================================
-- 3) Step Dependencies — DAG edges between step templates
--    "step X cannot start until step Y finishes"
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.step_dependencies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id    UUID NOT NULL
        REFERENCES orchestration.workflow_templates(id) ON DELETE CASCADE,
    step_id                 UUID NOT NULL
        REFERENCES orchestration.step_templates(id) ON DELETE CASCADE,
    depends_on_step_id      UUID NOT NULL
        REFERENCES orchestration.step_templates(id) ON DELETE CASCADE,
    dependency_type         TEXT NOT NULL DEFAULT 'finish_to_start'
        -- 'finish_to_start' — predecessor must complete before successor starts
        -- 'start_to_start'  — predecessor must start before successor can start
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_step_dependencies_edge'
    ) THEN
        ALTER TABLE orchestration.step_dependencies
            ADD CONSTRAINT uq_step_dependencies_edge
            UNIQUE (step_id, depends_on_step_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_step_dependencies_no_self'
    ) THEN
        ALTER TABLE orchestration.step_dependencies
            ADD CONSTRAINT chk_step_dependencies_no_self
            CHECK (step_id != depends_on_step_id);
    END IF;
END $$;


-- ============================================================================
-- 4) Workflow Runs — instance of a template for a specific program
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.workflow_runs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,           -- FK to core.programs(id) — RLS anchor
    workflow_template_id    UUID NOT NULL
        REFERENCES orchestration.workflow_templates(id) ON DELETE RESTRICT,
    idempotency_key         TEXT,                    -- prevent duplicate runs
    status                  TEXT NOT NULL DEFAULT 'pending',
    -- Valid statuses: pending → running → paused → completed | failed | cancelled
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    current_step_id         UUID,                    -- which step is active (informational)
    context                 JSONB NOT NULL DEFAULT '{}'::jsonb,  -- accumulated outputs
    error                   TEXT,
    priority                INTEGER NOT NULL DEFAULT 0,          -- higher = more urgent
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              TEXT NOT NULL DEFAULT 'system'
);

-- Soft FK to core.programs — added conditionally because core schema may not exist yet
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'core' AND table_name = 'programs'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_workflow_runs_program'
        ) THEN
            ALTER TABLE orchestration.workflow_runs
                ADD CONSTRAINT fk_workflow_runs_program
                FOREIGN KEY (program_id) REFERENCES core.programs(id)
                ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_workflow_runs_idempotency'
    ) THEN
        ALTER TABLE orchestration.workflow_runs
            ADD CONSTRAINT uq_workflow_runs_idempotency
            UNIQUE (program_id, idempotency_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_workflow_runs_status'
    ) THEN
        ALTER TABLE orchestration.workflow_runs
            ADD CONSTRAINT chk_workflow_runs_status
            CHECK (status IN (
                'pending', 'running', 'paused',
                'completed', 'failed', 'cancelled'
            ));
    END IF;
END $$;


-- ============================================================================
-- 5) Step Runs — instance of a step template within a workflow run
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.step_runs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id         UUID NOT NULL
        REFERENCES orchestration.workflow_runs(id) ON DELETE CASCADE,
    step_template_id        UUID NOT NULL
        REFERENCES orchestration.step_templates(id) ON DELETE RESTRICT,
    program_id              UUID NOT NULL,           -- denormalized for RLS

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'pending',
    -- Valid statuses: pending → queued → running → completed | failed | skipped | cancelled
    attempt                 INTEGER NOT NULL DEFAULT 1,
    queued_at               TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,

    -- I/O
    input                   JSONB NOT NULL DEFAULT '{}'::jsonb,
    output                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    error                   TEXT,

    -- A8 Batch Bridge — step_runs that delegate to the batch worker
    -- set batch_id when a step creates a vault.review_batches row
    batch_id                UUID,                    -- optional FK to vault.review_batches

    -- Worker claim fields (mirrors A8 pattern)
    worker_id               TEXT,
    locked_at               TIMESTAMPTZ,
    heartbeat_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_step_runs_attempt'
    ) THEN
        ALTER TABLE orchestration.step_runs
            ADD CONSTRAINT uq_step_runs_attempt
            UNIQUE (workflow_run_id, step_template_id, attempt);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_step_runs_status'
    ) THEN
        ALTER TABLE orchestration.step_runs
            ADD CONSTRAINT chk_step_runs_status
            CHECK (status IN (
                'pending', 'queued', 'running',
                'completed', 'failed', 'skipped', 'cancelled'
            ));
    END IF;
END $$;

-- Soft FK to vault.review_batches (batch bridge)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'vault' AND table_name = 'review_batches'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_step_runs_batch'
        ) THEN
            ALTER TABLE orchestration.step_runs
                ADD CONSTRAINT fk_step_runs_batch
                FOREIGN KEY (batch_id) REFERENCES vault.review_batches(batch_id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;


-- ============================================================================
-- 6) Step Run Events — append-only audit log for step transitions
--    (Part 11 forensic trail: who changed what, when)
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.step_run_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_run_id     UUID NOT NULL
        REFERENCES orchestration.step_runs(id) ON DELETE CASCADE,
    program_id      UUID NOT NULL,           -- denormalized for RLS
    event_type      TEXT NOT NULL,
    -- 'status_change', 'heartbeat', 'output_update', 'error', 'retry', 'gate_decision'
    from_status     TEXT,
    to_status       TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor           TEXT NOT NULL DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 7) Immutability trigger for step_run_events (append-only)
--    Consistent with audit.* pattern from migration 002
-- ============================================================================

CREATE OR REPLACE FUNCTION orchestration.tg_immutable_step_events()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'step_run_events rows are immutable — INSERT only';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_step_events
    ON orchestration.step_run_events;

CREATE TRIGGER trg_immutable_step_events
    BEFORE UPDATE OR DELETE ON orchestration.step_run_events
    FOR EACH ROW
    EXECUTE FUNCTION orchestration.tg_immutable_step_events();


-- ============================================================================
-- 8) updated_at auto-touch trigger for mutable tables
-- ============================================================================

-- Reuse audit.tg_set_updated_at if available, otherwise create local
CREATE OR REPLACE FUNCTION orchestration.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    _tbl TEXT;
BEGIN
    FOR _tbl IN
        SELECT unnest(ARRAY[
            'workflow_templates',
            'step_templates',
            'workflow_runs',
            'step_runs'
        ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at_%1$s ON orchestration.%1$I;
             CREATE TRIGGER trg_set_updated_at_%1$s
                 BEFORE UPDATE ON orchestration.%1$I
                 FOR EACH ROW
                 EXECUTE FUNCTION orchestration.tg_set_updated_at();',
            _tbl
        );
    END LOOP;
END $$;


-- ============================================================================
-- 9) Row-Level Security — program_id isolation
--    GUC: app.current_program_id (consistent with vault.* pattern)
-- ============================================================================

-- Templates are global (org-level, not program-scoped) — no RLS
-- Runs are program-scoped — full RLS

ALTER TABLE orchestration.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration.step_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration.step_run_events ENABLE ROW LEVEL SECURITY;

-- Admin bypass
DO $$
BEGIN
    -- workflow_runs
    DROP POLICY IF EXISTS admin_bypass_workflow_runs ON orchestration.workflow_runs;
    CREATE POLICY admin_bypass_workflow_runs ON orchestration.workflow_runs
        USING (current_setting('app.bypass_rls', TRUE) = 'true');

    DROP POLICY IF EXISTS program_isolation_workflow_runs ON orchestration.workflow_runs;
    CREATE POLICY program_isolation_workflow_runs ON orchestration.workflow_runs
        USING (program_id = current_setting('app.current_program_id', TRUE)::UUID);

    -- step_runs
    DROP POLICY IF EXISTS admin_bypass_step_runs ON orchestration.step_runs;
    CREATE POLICY admin_bypass_step_runs ON orchestration.step_runs
        USING (current_setting('app.bypass_rls', TRUE) = 'true');

    DROP POLICY IF EXISTS program_isolation_step_runs ON orchestration.step_runs;
    CREATE POLICY program_isolation_step_runs ON orchestration.step_runs
        USING (program_id = current_setting('app.current_program_id', TRUE)::UUID);

    -- step_run_events
    DROP POLICY IF EXISTS admin_bypass_step_run_events ON orchestration.step_run_events;
    CREATE POLICY admin_bypass_step_run_events ON orchestration.step_run_events
        USING (current_setting('app.bypass_rls', TRUE) = 'true');

    DROP POLICY IF EXISTS program_isolation_step_run_events ON orchestration.step_run_events;
    CREATE POLICY program_isolation_step_run_events ON orchestration.step_run_events
        USING (program_id = current_setting('app.current_program_id', TRUE)::UUID);
END $$;


-- ============================================================================
-- 10) Indexes
-- ============================================================================

-- Workflow templates
CREATE INDEX IF NOT EXISTS idx_wf_templates_code
    ON orchestration.workflow_templates(code);
CREATE INDEX IF NOT EXISTS idx_wf_templates_category_active
    ON orchestration.workflow_templates(category, is_active)
    WHERE is_active = TRUE;

-- Step templates
CREATE INDEX IF NOT EXISTS idx_step_templates_workflow
    ON orchestration.step_templates(workflow_template_id, ordinal);

-- Step dependencies
CREATE INDEX IF NOT EXISTS idx_step_deps_step
    ON orchestration.step_dependencies(step_id);
CREATE INDEX IF NOT EXISTS idx_step_deps_depends_on
    ON orchestration.step_dependencies(depends_on_step_id);

-- Workflow runs — the hot query paths
CREATE INDEX IF NOT EXISTS idx_wf_runs_program_status
    ON orchestration.workflow_runs(program_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status_priority
    ON orchestration.workflow_runs(status, priority DESC)
    WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_wf_runs_idempotency
    ON orchestration.workflow_runs(program_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Step runs — the hot query paths
CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_status
    ON orchestration.step_runs(workflow_run_id, status);
CREATE INDEX IF NOT EXISTS idx_step_runs_program_status
    ON orchestration.step_runs(program_id, status);
CREATE INDEX IF NOT EXISTS idx_step_runs_batch
    ON orchestration.step_runs(batch_id)
    WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_step_runs_claimable
    ON orchestration.step_runs(status, queued_at)
    WHERE status = 'queued' AND locked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_step_runs_heartbeat
    ON orchestration.step_runs(locked_at, heartbeat_at)
    WHERE status = 'running' AND locked_at IS NOT NULL;

-- Step run events — time-series queries
CREATE INDEX IF NOT EXISTS idx_step_events_step_time
    ON orchestration.step_run_events(step_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_step_events_program_time
    ON orchestration.step_run_events(program_id, created_at);


-- ============================================================================
-- 11) Convenience views
-- ============================================================================

CREATE OR REPLACE VIEW orchestration.v_active_runs AS
SELECT
    wr.id               AS workflow_run_id,
    wr.program_id,
    wt.code             AS workflow_code,
    wt.name             AS workflow_name,
    wr.status           AS run_status,
    wr.priority,
    wr.started_at,
    wr.created_by,
    COUNT(sr.id)                                    AS total_steps,
    COUNT(sr.id) FILTER (WHERE sr.status = 'completed') AS completed_steps,
    COUNT(sr.id) FILTER (WHERE sr.status = 'failed')    AS failed_steps,
    COUNT(sr.id) FILTER (WHERE sr.status = 'running')   AS running_steps
FROM orchestration.workflow_runs wr
JOIN orchestration.workflow_templates wt ON wt.id = wr.workflow_template_id
LEFT JOIN orchestration.step_runs sr ON sr.workflow_run_id = wr.id
WHERE wr.status IN ('pending', 'running', 'paused')
GROUP BY wr.id, wr.program_id, wt.code, wt.name, wr.status,
         wr.priority, wr.started_at, wr.created_by;

CREATE OR REPLACE VIEW orchestration.v_step_run_detail AS
SELECT
    sr.id               AS step_run_id,
    sr.workflow_run_id,
    sr.program_id,
    st.code             AS step_code,
    st.name             AS step_name,
    st.step_type,
    sr.status,
    sr.attempt,
    sr.queued_at,
    sr.started_at,
    sr.completed_at,
    sr.batch_id,
    sr.worker_id,
    sr.error,
    EXTRACT(EPOCH FROM (
        COALESCE(sr.completed_at, NOW()) - sr.started_at
    ))                  AS elapsed_seconds
FROM orchestration.step_runs sr
JOIN orchestration.step_templates st ON st.id = sr.step_template_id;


-- ============================================================================
-- 12) Grant privileges to application roles (if they exist)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
        GRANT USAGE ON SCHEMA orchestration TO app_rw;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA orchestration TO app_rw;
        -- Events table: INSERT only (immutable)
        REVOKE UPDATE, DELETE ON orchestration.step_run_events FROM app_rw;
        GRANT INSERT, SELECT ON orchestration.step_run_events TO app_rw;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
        GRANT USAGE ON SCHEMA orchestration TO app_ro;
        GRANT SELECT ON ALL TABLES IN SCHEMA orchestration TO app_ro;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shadow_service') THEN
        GRANT USAGE ON SCHEMA orchestration TO shadow_service;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA orchestration TO shadow_service;
        REVOKE UPDATE, DELETE ON orchestration.step_run_events FROM shadow_service;
        GRANT INSERT, SELECT ON orchestration.step_run_events TO shadow_service;
    END IF;
END $$;


COMMIT;
