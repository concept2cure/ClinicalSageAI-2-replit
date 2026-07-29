-- ============================================================================
-- PDEV → IND Workflow — per-program activity state + readiness snapshots
-- Branch: claude/pdev-ind-workflow-core-F3koK
-- Architecture: see PDEV_IND_WORKFLOW_AUDIT.md
-- ============================================================================
--
-- These two tables layer per-program state onto the closed-enum activity
-- registry defined in server/services/pdev/pdev-activity-registry.ts.
--
-- Tenant isolation is enforced at the service layer by joining
-- regulatory_programs (which carries organization_id) before every read
-- or write — same pattern as q_submissions and evidence_sufficiency.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pdev_program_activities
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pdev_program_activities (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    program_id                UUID NOT NULL
                              REFERENCES regulatory_programs(id) ON DELETE CASCADE,

    activity_key              VARCHAR(96) NOT NULL,
    workstream                VARCHAR(16) NOT NULL,
    stage                     VARCHAR(24) NOT NULL,

    state                     VARCHAR(32) NOT NULL DEFAULT 'not_started',

    owner_user_id             INTEGER,
    reviewer_user_id          INTEGER,

    notes                     TEXT,

    attached_document_codes   JSONB DEFAULT '[]'::jsonb,
    evidence_object_ids       JSONB DEFAULT '[]'::jsonb,
    open_contradiction_ids    JSONB DEFAULT '[]'::jsonb,

    due_date                  TIMESTAMP WITH TIME ZONE,

    state_changed_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    state_changed_by          INTEGER,

    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- One row per (program, activity_key). The registry is closed and stable.
CREATE UNIQUE INDEX IF NOT EXISTS pdev_program_activity_idx
    ON pdev_program_activities (program_id, activity_key);

CREATE INDEX IF NOT EXISTS pdev_program_workstream_idx
    ON pdev_program_activities (program_id, workstream);

CREATE INDEX IF NOT EXISTS pdev_program_stage_idx
    ON pdev_program_activities (program_id, stage);

CREATE INDEX IF NOT EXISTS pdev_activity_state_idx
    ON pdev_program_activities (state);

CREATE INDEX IF NOT EXISTS pdev_activity_owner_idx
    ON pdev_program_activities (owner_user_id);

CREATE INDEX IF NOT EXISTS pdev_activity_due_date_idx
    ON pdev_program_activities (due_date);

-- ----------------------------------------------------------------------------
-- pdev_readiness_snapshots
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pdev_readiness_snapshots (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    program_id                UUID NOT NULL
                              REFERENCES regulatory_programs(id) ON DELETE CASCADE,

    workstream                VARCHAR(16) NOT NULL,

    readiness_score           NUMERIC(5, 2) NOT NULL,

    total_activities          INTEGER NOT NULL,
    completed_activities      INTEGER NOT NULL,
    in_flight_activities      INTEGER NOT NULL,
    blocked_activities        INTEGER NOT NULL,
    blocking_activities       INTEGER NOT NULL,
    blocking_resolved         INTEGER NOT NULL,

    findings                  JSONB DEFAULT '[]'::jsonb,

    snapshot_by_user_id       INTEGER,
    trigger                   VARCHAR(24) NOT NULL DEFAULT 'manual',

    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdev_snapshot_program_workstream_idx
    ON pdev_readiness_snapshots (program_id, workstream);

CREATE INDEX IF NOT EXISTS pdev_snapshot_created_at_idx
    ON pdev_readiness_snapshots (created_at);

-- ----------------------------------------------------------------------------
-- updated_at trigger for pdev_program_activities
-- ----------------------------------------------------------------------------
-- Uses the shared `set_updated_at()` helper installed by an earlier migration.
-- Guard the create so re-running this migration is safe.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'pdev_program_activities_set_updated_at'
    ) THEN
        EXECUTE 'CREATE TRIGGER pdev_program_activities_set_updated_at
                 BEFORE UPDATE ON pdev_program_activities
                 FOR EACH ROW
                 EXECUTE FUNCTION set_updated_at()';
    END IF;
END $$;
