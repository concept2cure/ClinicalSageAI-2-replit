"""SQL queries for Phase 7.0A–D — Render Jobs.

Table: predicate.render_jobs
Uses positional $1, $2... parameters for asyncpg compatibility.

Phase 7.0C: Added program_id column + ownership filters.
Phase 7.0D: Added idempotency_key, concurrency checks, TTL cleanup.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Insert
# ─────────────────────────────────────────────────────────────────────────────

INSERT_RENDER_JOB = """
INSERT INTO predicate.render_jobs (
    proof_pack_id, artifact_type, status,
    inputs_hash, created_by, request_id,
    program_id, idempotency_key
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *
"""

# ─────────────────────────────────────────────────────────────────────────────
# Select
# ─────────────────────────────────────────────────────────────────────────────

SELECT_RENDER_JOB_BY_ID = """
SELECT * FROM predicate.render_jobs WHERE id = $1
"""

# 7.0C: Ownership-enforced select — requires matching program_id
SELECT_RENDER_JOB_BY_ID_SCOPED = """
SELECT * FROM predicate.render_jobs
 WHERE id = $1 AND program_id = $2
"""

SELECT_RENDER_JOB_BY_INPUTS_HASH = """
SELECT * FROM predicate.render_jobs
 WHERE inputs_hash = $1
   AND status = 'COMPLETED'
 ORDER BY completed_at DESC
 LIMIT 1
"""

SELECT_RENDER_JOBS_BY_PROOF_PACK = """
SELECT * FROM predicate.render_jobs
 WHERE proof_pack_id = $1
 ORDER BY created_at DESC
"""

# 7.0C: Ownership-enforced list
SELECT_RENDER_JOBS_BY_PROOF_PACK_SCOPED = """
SELECT * FROM predicate.render_jobs
 WHERE proof_pack_id = $1 AND program_id = $2
 ORDER BY created_at DESC
"""

SELECT_RENDER_JOBS_BY_PROOF_PACK_AND_TYPE = """
SELECT * FROM predicate.render_jobs
 WHERE proof_pack_id = $1
   AND artifact_type = $2
 ORDER BY created_at DESC
 LIMIT 5
"""

# ─────────────────────────────────────────────────────────────────────────────
# Phase 7.0D — Concurrency + Rate Limiting
# ─────────────────────────────────────────────────────────────────────────────

# Count active (QUEUED + RUNNING) jobs per program
COUNT_ACTIVE_JOBS_BY_PROGRAM = """
SELECT COUNT(*) AS cnt FROM predicate.render_jobs
 WHERE program_id = $1
   AND status IN ('QUEUED', 'RUNNING')
"""

# Count recent renders per program in a time window
COUNT_RECENT_RENDERS_BY_PROGRAM = """
SELECT COUNT(*) AS cnt FROM predicate.render_jobs
 WHERE program_id = $1
   AND created_at > NOW() - INTERVAL '1 second' * $2
"""

# Find existing job by idempotency key + program scope (prevents double-click + cross-tenant leak)
SELECT_RENDER_JOB_BY_IDEMPOTENCY_KEY = """
SELECT * FROM predicate.render_jobs
 WHERE idempotency_key = $1
   AND program_id = $2
 LIMIT 1
"""

# Delete old FAILED jobs beyond TTL
DELETE_EXPIRED_FAILED_JOBS = """
DELETE FROM predicate.render_jobs
 WHERE status = 'FAILED'
   AND completed_at < NOW() - INTERVAL '1 day' * $1
RETURNING id
"""

# ─────────────────────────────────────────────────────────────────────────────
# Update
# ─────────────────────────────────────────────────────────────────────────────

UPDATE_RENDER_JOB_STARTED = """
UPDATE predicate.render_jobs
   SET status = 'RUNNING',
       started_at = NOW()
 WHERE id = $1
   AND status = 'QUEUED'
RETURNING *
"""

UPDATE_RENDER_JOB_COMPLETED = """
UPDATE predicate.render_jobs
   SET status = 'COMPLETED',
       completed_at = NOW(),
       artifact_hash = $2,
       artifact_size_bytes = $3,
       artifact_path = $4
 WHERE id = $1
   AND status = 'RUNNING'
RETURNING *
"""

UPDATE_RENDER_JOB_FAILED = """
UPDATE predicate.render_jobs
   SET status = 'FAILED',
       completed_at = NOW(),
       error = $2
 WHERE id = $1
   AND status = 'RUNNING'
RETURNING *
"""
