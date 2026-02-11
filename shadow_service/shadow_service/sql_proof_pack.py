"""SQL queries for Phase 6.6.E — Proof Pack Exports.

Tables: predicate.proof_pack_exports, predicate.proof_pack_audit_events
Uses positional $1, $2... parameters for asyncpg compatibility.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Insert
# ─────────────────────────────────────────────────────────────────────────────

INSERT_PROOF_PACK_EXPORT = """
INSERT INTO predicate.proof_pack_exports (
    program_id, subject_hash, manifest_hash,
    risk_vocab_hash, risk_code_lock_hash,
    manifest_json, payload_json, artifact_index_json,
    defense_packet_id, created_by
)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
ON CONFLICT (manifest_hash) DO UPDATE SET
    updated_at = NOW()
RETURNING *
"""

INSERT_AUDIT_EVENT = """
INSERT INTO predicate.proof_pack_audit_events (
    proof_pack_id, program_id, user_id, action,
    subject_hash, manifest_hash, risk_vocab_hash,
    metadata
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
RETURNING *
"""

# ─────────────────────────────────────────────────────────────────────────────
# Select
# ─────────────────────────────────────────────────────────────────────────────

SELECT_PROOF_PACK_BY_ID = """
SELECT * FROM predicate.proof_pack_exports
 WHERE id = $1
"""

SELECT_PROOF_PACK_BY_MANIFEST_HASH = """
SELECT * FROM predicate.proof_pack_exports
 WHERE manifest_hash = $1
"""

SELECT_PROOF_PACKS_BY_PROGRAM = """
SELECT * FROM predicate.proof_pack_exports
 WHERE program_id = $1
 ORDER BY created_at DESC
"""

SELECT_PROOF_PACK_FOR_DOWNLOAD = """
SELECT pp.*, dp.tasks, dp.se_payload, dp.subject_device, dp.risk_codes_used,
       dp.risk_code_map_version, dp.predicate_k_number,
       dp.defense_readiness_score, dp.top_risks
  FROM predicate.proof_pack_exports pp
  JOIN predicate.defense_packets dp ON dp.id = pp.defense_packet_id
 WHERE pp.manifest_hash = $1
   AND pp.program_id = $2
"""

SELECT_AUDIT_EVENTS_BY_PROOF_PACK = """
SELECT * FROM predicate.proof_pack_audit_events
 WHERE proof_pack_id = $1
 ORDER BY created_at ASC
"""

SELECT_AUDIT_EVENTS_BY_MANIFEST = """
SELECT * FROM predicate.proof_pack_audit_events
 WHERE manifest_hash = $1
 ORDER BY created_at ASC
"""

SELECT_AUDIT_EVENTS_BY_PROGRAM = """
SELECT * FROM predicate.proof_pack_audit_events
 WHERE program_id = $1
 ORDER BY created_at DESC
 LIMIT $2
"""

# ─────────────────────────────────────────────────────────────────────────────
# Update
# ─────────────────────────────────────────────────────────────────────────────

UPDATE_PROOF_PACK_ASSEMBLED = """
UPDATE predicate.proof_pack_exports
   SET status = 'ASSEMBLED',
       zip_hash = $2,
       zip_size_bytes = $3,
       artifact_index_json = $4::jsonb,
       updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PROOF_PACK_DOWNLOADED = """
UPDATE predicate.proof_pack_exports
   SET downloaded_count = downloaded_count + 1,
       last_downloaded_at = NOW(),
       last_downloaded_by = $2,
       updated_at = NOW()
 WHERE id = $1
RETURNING *
"""

UPDATE_PROOF_PACK_FAILED = """
UPDATE predicate.proof_pack_exports
   SET status = 'FAILED',
       updated_at = NOW()
 WHERE id = $1
RETURNING *
"""
