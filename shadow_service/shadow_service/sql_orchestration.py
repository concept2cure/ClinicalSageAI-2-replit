"""SQL queries for the Orchestration Kernel.

All queries use parameterized statements ($1, $2, etc.) for asyncpg.
Scoped to the `orchestration` schema.
"""

# =============================================================================
# Workflow Templates
# =============================================================================

SELECT_WORKFLOW_TEMPLATE_BY_ID = """
SELECT id, code, name, description, version, category, is_active,
       created_at, updated_at
FROM orchestration.workflow_templates
WHERE id = $1
"""

SELECT_WORKFLOW_TEMPLATE_BY_CODE = """
SELECT id, code, name, description, version, category, is_active,
       created_at, updated_at
FROM orchestration.workflow_templates
WHERE code = $1 AND is_active = TRUE
ORDER BY version DESC
LIMIT 1
"""

SELECT_STEP_TEMPLATES_FOR_WORKFLOW = """
SELECT id, workflow_template_id, code, name, step_type, ordinal,
       timeout_seconds, retry_policy, config, created_at, updated_at
FROM orchestration.step_templates
WHERE workflow_template_id = $1
ORDER BY ordinal
"""

SELECT_STEP_DEPENDENCIES_FOR_WORKFLOW = """
SELECT sd.id, sd.workflow_template_id, sd.step_id,
       sd.depends_on_step_id, sd.dependency_type
FROM orchestration.step_dependencies sd
WHERE sd.workflow_template_id = $1
"""

# =============================================================================
# Workflow Runs — lifecycle
# =============================================================================

INSERT_WORKFLOW_RUN = """
INSERT INTO orchestration.workflow_runs
    (program_id, workflow_template_id, idempotency_key, status, context, priority, created_by)
VALUES ($1, $2, $3, 'pending', $4, $5, $6)
RETURNING id, program_id, workflow_template_id, idempotency_key,
          status, started_at, completed_at, current_step_id,
          context, error, priority, created_at, updated_at, created_by
"""

SELECT_WORKFLOW_RUN_BY_ID = """
SELECT id, program_id, workflow_template_id, idempotency_key,
       status, started_at, completed_at, current_step_id,
       context, error, priority, created_at, updated_at, created_by
FROM orchestration.workflow_runs
WHERE id = $1
"""

SELECT_WORKFLOW_RUNS_BY_PROGRAM = """
SELECT id, program_id, workflow_template_id, idempotency_key,
       status, started_at, completed_at, current_step_id,
       context, error, priority, created_at, updated_at, created_by
FROM orchestration.workflow_runs
WHERE program_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
"""

UPDATE_WORKFLOW_RUN_STATUS = """
UPDATE orchestration.workflow_runs
SET status = $2,
    started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
    error = $3
WHERE id = $1
RETURNING id, program_id, workflow_template_id, idempotency_key,
          status, started_at, completed_at, current_step_id,
          context, error, priority, created_at, updated_at, created_by
"""

UPDATE_WORKFLOW_RUN_CONTEXT = """
UPDATE orchestration.workflow_runs
SET context = context || $2::jsonb
WHERE id = $1
"""

# =============================================================================
# Step Runs — lifecycle + claim
# =============================================================================

INSERT_STEP_RUN = """
INSERT INTO orchestration.step_runs
    (workflow_run_id, step_template_id, program_id, status, attempt, input)
VALUES ($1, $2, $3, 'pending', 1, $4)
RETURNING id, workflow_run_id, step_template_id, program_id,
          status, attempt, queued_at, started_at, completed_at,
          input, output, error, batch_id,
          worker_id, locked_at, heartbeat_at,
          created_at, updated_at
"""

SELECT_STEP_RUN_BY_ID = """
SELECT sr.id, sr.workflow_run_id, sr.step_template_id, sr.program_id,
       sr.status, sr.attempt, sr.queued_at, sr.started_at, sr.completed_at,
       sr.input, sr.output, sr.error, sr.batch_id,
       sr.worker_id, sr.locked_at, sr.heartbeat_at,
       sr.created_at, sr.updated_at,
       st.code AS step_code, st.name AS step_name, st.step_type
FROM orchestration.step_runs sr
JOIN orchestration.step_templates st ON st.id = sr.step_template_id
WHERE sr.id = $1
"""

SELECT_STEP_RUNS_FOR_WORKFLOW_RUN = """
SELECT sr.id, sr.workflow_run_id, sr.step_template_id, sr.program_id,
       sr.status, sr.attempt, sr.queued_at, sr.started_at, sr.completed_at,
       sr.input, sr.output, sr.error, sr.batch_id,
       sr.worker_id, sr.locked_at, sr.heartbeat_at,
       sr.created_at, sr.updated_at,
       st.code AS step_code, st.name AS step_name, st.step_type, st.ordinal
FROM orchestration.step_runs sr
JOIN orchestration.step_templates st ON st.id = sr.step_template_id
WHERE sr.workflow_run_id = $1
ORDER BY st.ordinal
"""

# Compute runnable steps: status = 'pending' AND all dependencies completed
SELECT_RUNNABLE_STEPS = """
SELECT sr.id, sr.workflow_run_id, sr.step_template_id, sr.program_id,
       sr.status, sr.attempt,
       st.code AS step_code, st.name AS step_name, st.step_type
FROM orchestration.step_runs sr
JOIN orchestration.step_templates st ON st.id = sr.step_template_id
WHERE sr.workflow_run_id = $1
  AND sr.status = 'pending'
  AND NOT EXISTS (
      -- Check for unsatisfied dependencies
      SELECT 1
      FROM orchestration.step_dependencies sd
      JOIN orchestration.step_runs dep_sr
           ON dep_sr.step_template_id = sd.depends_on_step_id
          AND dep_sr.workflow_run_id = sr.workflow_run_id
      WHERE sd.step_id = sr.step_template_id
        AND sd.workflow_template_id = st.workflow_template_id
        AND (
            (sd.dependency_type = 'finish_to_start' AND dep_sr.status != 'completed')
            OR
            (sd.dependency_type = 'start_to_start' AND dep_sr.status NOT IN ('running', 'completed'))
        )
  )
ORDER BY st.ordinal
"""

# Queue runnable steps (move them to 'queued')
UPDATE_STEP_RUN_QUEUE = """
UPDATE orchestration.step_runs
SET status = 'queued', queued_at = NOW()
WHERE id = $1 AND status = 'pending'
RETURNING id
"""

# Claim a queued step (worker lock with advisory check)
CLAIM_STEP_RUN = """
UPDATE orchestration.step_runs
SET status = 'running',
    worker_id = $2,
    locked_at = NOW(),
    heartbeat_at = NOW(),
    started_at = COALESCE(started_at, NOW())
WHERE id = $1
  AND status = 'queued'
  AND locked_at IS NULL
RETURNING id, workflow_run_id, step_template_id, program_id,
          status, attempt, input, worker_id, locked_at
"""

# Complete a step
COMPLETE_STEP_RUN = """
UPDATE orchestration.step_runs
SET status = 'completed',
    completed_at = NOW(),
    output = $2
WHERE id = $1
  AND status = 'running'
RETURNING id, workflow_run_id, step_template_id, program_id,
          status, attempt, output, completed_at
"""

# Fail a step
FAIL_STEP_RUN = """
UPDATE orchestration.step_runs
SET status = 'failed',
    completed_at = NOW(),
    error = $2
WHERE id = $1
  AND status = 'running'
RETURNING id, workflow_run_id, step_template_id, program_id,
          status, attempt, error, completed_at
"""

# Heartbeat update
UPDATE_STEP_RUN_HEARTBEAT = """
UPDATE orchestration.step_runs
SET heartbeat_at = NOW()
WHERE id = $1 AND status = 'running' AND worker_id = $2
RETURNING id
"""

# Queue view — claimable steps for a program
SELECT_CLAIMABLE_STEPS = """
SELECT sr.id, sr.workflow_run_id, sr.step_template_id, sr.program_id,
       sr.status, sr.attempt, sr.queued_at,
       st.code AS step_code, st.name AS step_name, st.step_type
FROM orchestration.step_runs sr
JOIN orchestration.step_templates st ON st.id = sr.step_template_id
WHERE sr.program_id = $1
  AND sr.status = 'queued'
  AND sr.locked_at IS NULL
ORDER BY sr.queued_at
"""

# Set batch_id on step_run (A8 bridge)
UPDATE_STEP_RUN_BATCH_ID = """
UPDATE orchestration.step_runs
SET batch_id = $2
WHERE id = $1
RETURNING id, batch_id
"""

# =============================================================================
# Step Run Events — append-only audit
# =============================================================================

INSERT_STEP_RUN_EVENT = """
INSERT INTO orchestration.step_run_events
    (step_run_id, program_id, event_type, from_status, to_status, payload, actor)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, step_run_id, program_id, event_type,
          from_status, to_status, payload, actor, created_at
"""

SELECT_EVENTS_FOR_STEP_RUN = """
SELECT id, step_run_id, program_id, event_type,
       from_status, to_status, payload, actor, created_at
FROM orchestration.step_run_events
WHERE step_run_id = $1
ORDER BY created_at
"""

# =============================================================================
# RLS GUC helpers — set on connection before queries
# =============================================================================

SET_PROGRAM_CONTEXT = """
SELECT set_config('app.current_program_id', $1::TEXT, TRUE)
"""

SET_BYPASS_RLS = """
SELECT set_config('app.bypass_rls', 'true', TRUE)
"""

CLEAR_RLS_CONTEXT = """
SELECT set_config('app.current_program_id', '', TRUE),
       set_config('app.bypass_rls', '', TRUE)
"""
