"""SQL queries for Phase 6.6.D — Defense Packets.

All queries target the `predicate.defense_packets` table.
Uses positional $1, $2... parameters for asyncpg compatibility.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Insert
# ─────────────────────────────────────────────────────────────────────────────

INSERT_DEFENSE_PACKET = """
INSERT INTO predicate.defense_packets (
    program_id, subject_hash, predicate_k_number,
    risk_code_map_version, risk_vocab_hash, generator_version,
    defense_readiness_score, top_risks,
    tasks, se_payload, subject_device, risk_codes_used,
    manifest_hash, product_code,
    status, render_job_id,
    created_by_user_id, previous_packet_id
)
VALUES (
    $1, $2, $3,
    $4, $5, $6,
    $7, $8::jsonb,
    $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
    $13, $14,
    $15, $16,
    $17, $18
)
RETURNING *
"""

# ─────────────────────────────────────────────────────────────────────────────
# Select
# ─────────────────────────────────────────────────────────────────────────────

SELECT_PACKET_BY_ID = """
SELECT * FROM predicate.defense_packets
 WHERE id = $1
"""

SELECT_PACKET_BY_MANIFEST_HASH = """
SELECT * FROM predicate.defense_packets
 WHERE manifest_hash = $1
"""

SELECT_PACKETS_BY_PROGRAM = """
SELECT * FROM predicate.defense_packets
 WHERE program_id = $1
 ORDER BY created_at DESC
"""

SELECT_LATEST_PACKET_FOR_SUBJECT = """
SELECT * FROM predicate.defense_packets
 WHERE program_id = $1 AND subject_hash = $2
 ORDER BY created_at DESC
 LIMIT 1
"""

SELECT_PACKETS_BY_STATUS = """
SELECT * FROM predicate.defense_packets
 WHERE status = $1
 ORDER BY created_at DESC
"""

SELECT_ACTIVE_PACKETS_FOR_PROGRAM = """
SELECT * FROM predicate.defense_packets
 WHERE program_id = $1 AND status NOT IN ('FAILED', 'STALE')
 ORDER BY created_at DESC
"""

# ─────────────────────────────────────────────────────────────────────────────
# Update
# ─────────────────────────────────────────────────────────────────────────────

UPDATE_PACKET_STATUS = """
UPDATE predicate.defense_packets
   SET status = $2, updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PACKET_RENDERING = """
UPDATE predicate.defense_packets
   SET status = 'RENDERING', render_job_id = $2, updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PACKET_RENDERED = """
UPDATE predicate.defense_packets
   SET status = 'RENDERED', render_job_id = $2, updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PACKET_FAILED = """
UPDATE predicate.defense_packets
   SET status = 'FAILED', error_code = $2, error_detail = $3, updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PACKET_STALE = """
UPDATE predicate.defense_packets
   SET status = 'STALE', staleness_reason = $2, updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

MARK_PROGRAM_PACKETS_STALE = """
UPDATE predicate.defense_packets
   SET status = 'STALE', staleness_reason = $2, updated_at = NOW()
 WHERE program_id = $1
   AND status NOT IN ('FAILED', 'STALE')
RETURNING id, manifest_hash
"""
