"""SQL queries for Phase 7.0A — Render Jobs.

Table: predicate.render_jobs
Uses positional $1, $2... parameters for asyncpg compatibility.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Insert
# ─────────────────────────────────────────────────────────────────────────────

INSERT_RENDER_JOB = """
INSERT INTO predicate.render_jobs (
    proof_pack_id, artifact_type, status,
    inputs_hash, created_by, request_id
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *
"""

# ─────────────────────────────────────────────────────────────────────────────
# Select
# ─────────────────────────────────────────────────────────────────────────────

SELECT_RENDER_JOB_BY_ID = """
SELECT * FROM predicate.render_jobs WHERE id = $1
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

SELECT_RENDER_JOBS_BY_PROOF_PACK_AND_TYPE = """
SELECT * FROM predicate.render_jobs
 WHERE proof_pack_id = $1
   AND artifact_type = $2
 ORDER BY created_at DESC
 LIMIT 5
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
