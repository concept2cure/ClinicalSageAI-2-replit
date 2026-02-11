"""SQL queries for Phase 6.6.E + 6.6.G — Proof Pack Exports (Trust Chain).

Tables: predicate.proof_pack_exports, predicate.proof_pack_audit_events
Uses positional $1, $2... parameters for asyncpg compatibility.

G additions:
  - Expanded INSERT with schema_hash, generator_version, zip_manifest_hash, block_download
  - Idempotent upsert on multi-column constraint
  - Download lookup by proof_pack_id (UUID) only
  - Contract snapshot in audit events
  - Drift severity persistence
"""

# ─────────────────────────────────────────────────────────────────────────────
# Insert
# ─────────────────────────────────────────────────────────────────────────────

INSERT_PROOF_PACK_EXPORT = """
INSERT INTO predicate.proof_pack_exports (
    program_id, subject_hash, manifest_hash,
    risk_vocab_hash, risk_code_lock_hash,
    schema_hash, generator_version, zip_manifest_hash,
    manifest_json, payload_json, artifact_index_json,
    defense_packet_id, created_by,
    block_download, drift_severity, request_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb, $11::jsonb,
        $12, $13, $14, $15, $16)
ON CONFLICT (program_id, subject_hash, manifest_hash,
             risk_vocab_hash, risk_code_lock_hash,
             COALESCE(schema_hash, '')) DO UPDATE SET
    updated_at = NOW()
RETURNING *
"""

INSERT_AUDIT_EVENT = """
INSERT INTO predicate.proof_pack_audit_events (
    proof_pack_id, program_id, user_id, action,
    subject_hash, manifest_hash, risk_vocab_hash,
    risk_codes_lock_hash, schema_hash, generator_version,
    request_id, contract_snapshot, metadata
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
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

# G: Download by proof_pack_id (UUID) only
SELECT_PROOF_PACK_FOR_DOWNLOAD = """
SELECT pp.*, dp.tasks, dp.se_payload, dp.subject_device, dp.risk_codes_used,
       dp.risk_code_map_version, dp.predicate_k_number,
       dp.defense_readiness_score, dp.top_risks
  FROM predicate.proof_pack_exports pp
  JOIN predicate.defense_packets dp ON dp.id = pp.defense_packet_id
 WHERE pp.id = $1
   AND pp.program_id = $2
"""

SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID = """
SELECT pp.*, dp.tasks, dp.se_payload, dp.subject_device, dp.risk_codes_used,
       dp.risk_code_map_version, dp.predicate_k_number,
       dp.defense_readiness_score, dp.top_risks
  FROM predicate.proof_pack_exports pp
  JOIN predicate.defense_packets dp ON dp.id = pp.defense_packet_id
 WHERE pp.id = $1
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

# G: Persist drift severity + block_download after replay
UPDATE_PROOF_PACK_DRIFT = """
UPDATE predicate.proof_pack_exports
   SET drift_severity = $2,
       block_download = $3,
       updated_at = NOW()
 WHERE id = $1
RETURNING *
"""
