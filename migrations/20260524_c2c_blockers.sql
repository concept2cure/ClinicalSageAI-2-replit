-- ============================================================================
-- c2c_blockers — submission blocker registry (backfill for drizzle table)
-- ============================================================================
--
-- c2cBlockers is defined in shared/schema.ts and queried by
-- server/routes/submission-ops.ts (GET /api/submission-ops/blockers, which
-- the MDX Validation surface consumes), but drizzle-kit push does not
-- reliably materialize it here, so the endpoint 500s with a failed query.
-- This idempotent migration creates the table with the column set + indexes
-- from the drizzle definition. Foreign-key constraints are intentionally
-- omitted: this is a reliability backfill (the canonical constrained version
-- is owned by the drizzle schema), and several FK targets are not guaranteed
-- to exist in every environment. The SELECT path only needs the columns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS c2c_blockers (
    id                  SERIAL PRIMARY KEY,
    blocker_id          TEXT NOT NULL UNIQUE,
    org_id              INTEGER NOT NULL,
    project_id          INTEGER NOT NULL,
    package_db_id       INTEGER,
    section_db_id       INTEGER,
    artifact_id         INTEGER,
    thread_id           INTEGER,
    task_id             INTEGER,
    blocker_type        TEXT NOT NULL,
    document_family     TEXT,
    owner_function      TEXT,
    owner_user_id       INTEGER,
    owner_name          TEXT,
    ownership_type      TEXT,
    severity            TEXT NOT NULL DEFAULT 'medium',
    title               TEXT NOT NULL,
    description         TEXT,
    next_action         TEXT,
    breached_policy_id  INTEGER,
    escalation_status   TEXT DEFAULT 'none',
    escalated_at        TIMESTAMPTZ,
    milestone_db_id     INTEGER,
    status              TEXT NOT NULL DEFAULT 'open',
    due_at              TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    resolved_by_id      INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c2c_blocker_org_project_idx ON c2c_blockers (org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_package_idx     ON c2c_blockers (package_db_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_section_idx     ON c2c_blockers (section_db_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_artifact_idx    ON c2c_blockers (artifact_id);
