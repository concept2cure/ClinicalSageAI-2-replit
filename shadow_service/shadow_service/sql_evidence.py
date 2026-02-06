"""SQL queries for the Evidence Fabric.

All queries use parameterized statements ($1, $2, etc.) for asyncpg.
Scoped to the `evidence` schema.
"""

# =============================================================================
# Claims — CRUD
# =============================================================================

INSERT_CLAIM = """
INSERT INTO evidence.claims
    (program_id, claim_type, claim_text, structured, section_ref,
     version, supersedes_id, status, confidence, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, program_id, claim_type, claim_text, structured, section_ref,
          version, supersedes_id, status, confidence, created_by,
          created_at, updated_at
"""

SELECT_CLAIM_BY_ID = """
SELECT id, program_id, claim_type, claim_text, structured, section_ref,
       version, supersedes_id, status, confidence, created_by,
       created_at, updated_at
FROM evidence.claims
WHERE id = $1
"""

SELECT_CLAIMS_BY_PROGRAM = """
SELECT id, program_id, claim_type, claim_text, structured, section_ref,
       version, supersedes_id, status, confidence, created_by,
       created_at, updated_at
FROM evidence.claims
WHERE program_id = $1 AND status = 'active'
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
"""

SELECT_CLAIMS_BY_SECTION = """
SELECT id, program_id, claim_type, claim_text, structured, section_ref,
       version, supersedes_id, status, confidence, created_by,
       created_at, updated_at
FROM evidence.claims
WHERE program_id = $1 AND section_ref = $2 AND status = 'active'
ORDER BY created_at DESC
LIMIT $3
"""

UPDATE_CLAIM_STATUS = """
UPDATE evidence.claims
SET status = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, status, updated_at
"""

UPDATE_CLAIM_CONFIDENCE = """
UPDATE evidence.claims
SET confidence = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, confidence, updated_at
"""

# =============================================================================
# Sources — CRUD
# =============================================================================

INSERT_SOURCE = """
INSERT INTO evidence.sources
    (program_id, source_type, source_ref, source_uri, content_hash, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, program_id, source_type, source_ref, source_uri,
          content_hash, metadata, captured_at, created_at
"""

SELECT_SOURCE_BY_ID = """
SELECT id, program_id, source_type, source_ref, source_uri,
       content_hash, metadata, captured_at, created_at
FROM evidence.sources
WHERE id = $1
"""

SELECT_SOURCES_BY_PROGRAM = """
SELECT id, program_id, source_type, source_ref, source_uri,
       content_hash, metadata, captured_at, created_at
FROM evidence.sources
WHERE program_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
"""

# Dedup: find existing source by content hash
SELECT_SOURCE_BY_HASH = """
SELECT id, program_id, source_type, source_ref, source_uri,
       content_hash, metadata, captured_at, created_at
FROM evidence.sources
WHERE program_id = $1 AND content_hash = $2
LIMIT 1
"""

# =============================================================================
# Support links — claim ↔ source
# =============================================================================

INSERT_SUPPORT = """
INSERT INTO evidence.support
    (claim_id, source_id, program_id, support_type, strength,
     span_start, span_end, annotation, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (claim_id, source_id, support_type) DO UPDATE
    SET strength = EXCLUDED.strength,
        span_start = EXCLUDED.span_start,
        span_end = EXCLUDED.span_end,
        annotation = EXCLUDED.annotation
RETURNING id, claim_id, source_id, program_id, support_type, strength,
          span_start, span_end, annotation, created_by, created_at
"""

SELECT_SUPPORT_FOR_CLAIM = """
SELECT s.id, s.claim_id, s.source_id, s.program_id,
       s.support_type, s.strength, s.span_start, s.span_end,
       s.annotation, s.created_by, s.created_at,
       src.source_type, src.source_ref, src.content_hash AS source_hash
FROM evidence.support s
JOIN evidence.sources src ON src.id = s.source_id
WHERE s.claim_id = $1
ORDER BY s.strength DESC
"""

SELECT_CONTRADICTIONS_FOR_CLAIM = """
SELECT s.id, s.claim_id, s.source_id, s.program_id,
       s.support_type, s.strength, s.annotation,
       src.source_ref
FROM evidence.support s
JOIN evidence.sources src ON src.id = s.source_id
WHERE s.claim_id = $1 AND s.support_type = 'contradicts'
ORDER BY s.strength DESC
"""

# =============================================================================
# Derivations — claim chains
# =============================================================================

INSERT_DERIVATION = """
INSERT INTO evidence.derivations
    (program_id, derived_claim_id, source_claim_id, derivation_type,
     reasoning, model_id, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (derived_claim_id, source_claim_id, derivation_type) DO UPDATE
    SET reasoning = EXCLUDED.reasoning,
        model_id = EXCLUDED.model_id
RETURNING id, program_id, derived_claim_id, source_claim_id,
          derivation_type, reasoning, model_id, created_by, created_at
"""

SELECT_DERIVATIONS_FOR_CLAIM = """
SELECT d.id, d.program_id, d.derived_claim_id, d.source_claim_id,
       d.derivation_type, d.reasoning, d.model_id, d.created_by, d.created_at,
       sc.claim_text AS source_claim_text, sc.claim_type AS source_claim_type,
       sc.confidence AS source_confidence
FROM evidence.derivations d
JOIN evidence.claims sc ON sc.id = d.source_claim_id
WHERE d.derived_claim_id = $1
ORDER BY d.created_at
"""

# Recursive CTE: full derivation chain (up to 10 levels)
SELECT_DERIVATION_CHAIN = """
WITH RECURSIVE chain AS (
    SELECT d.id, d.derived_claim_id, d.source_claim_id,
           d.derivation_type, d.reasoning, 1 AS depth
    FROM evidence.derivations d
    WHERE d.derived_claim_id = $1
    UNION ALL
    SELECT d2.id, d2.derived_claim_id, d2.source_claim_id,
           d2.derivation_type, d2.reasoning, c.depth + 1
    FROM evidence.derivations d2
    JOIN chain c ON c.source_claim_id = d2.derived_claim_id
    WHERE c.depth < 10
)
SELECT ch.id, ch.derived_claim_id, ch.source_claim_id,
       ch.derivation_type, ch.reasoning, ch.depth,
       cl.claim_text, cl.claim_type, cl.confidence
FROM chain ch
JOIN evidence.claims cl ON cl.id = ch.source_claim_id
ORDER BY ch.depth
"""

# =============================================================================
# Provenance — execution → evidence links
# =============================================================================

INSERT_PROVENANCE = """
INSERT INTO evidence.provenance
    (program_id, claim_id, source_id, workflow_run_id, step_run_id,
     batch_id, event_type, actor, request_id, metadata, idempotency_key)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
RETURNING id, program_id, claim_id, source_id, workflow_run_id,
          step_run_id, batch_id, event_type, actor, request_id,
          metadata, created_at
"""

# Fetch existing provenance by idempotency key (for ON CONFLICT fallback)
SELECT_PROVENANCE_BY_IDEM_KEY = """
SELECT id, program_id, claim_id, source_id, workflow_run_id,
       step_run_id, batch_id, event_type, actor, request_id,
       metadata, created_at
FROM evidence.provenance
WHERE idempotency_key = $1
LIMIT 1
"""

SELECT_PROVENANCE_FOR_CLAIM = """
SELECT id, program_id, claim_id, source_id, workflow_run_id,
       step_run_id, batch_id, event_type, actor, request_id,
       metadata, created_at
FROM evidence.provenance
WHERE claim_id = $1
ORDER BY created_at DESC
"""

SELECT_PROVENANCE_FOR_STEP = """
SELECT id, program_id, claim_id, source_id, workflow_run_id,
       step_run_id, batch_id, event_type, actor, request_id,
       metadata, created_at
FROM evidence.provenance
WHERE step_run_id = $1
ORDER BY created_at DESC
"""

SELECT_PROVENANCE_BY_REQUEST = """
SELECT id, program_id, claim_id, source_id, workflow_run_id,
       step_run_id, batch_id, event_type, actor, request_id,
       metadata, created_at
FROM evidence.provenance
WHERE request_id = $1
ORDER BY created_at
"""

# =============================================================================
# Hash Ledger — append-only tamper evidence
# =============================================================================

INSERT_HASH_ENTRY = """
INSERT INTO evidence.hash_ledger
    (program_id, entity_type, entity_id, content_hash, prev_hash, algorithm)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, program_id, entity_type, entity_id,
          content_hash, prev_hash, algorithm, created_at
"""

SELECT_HASH_HISTORY = """
SELECT id, program_id, entity_type, entity_id,
       content_hash, prev_hash, algorithm, created_at
FROM evidence.hash_ledger
WHERE entity_type = $1 AND entity_id = $2
ORDER BY created_at
"""

VERIFY_HASH = """
SELECT content_hash
FROM evidence.hash_ledger
WHERE entity_type = $1 AND entity_id = $2
ORDER BY created_at DESC
LIMIT 1
"""

# =============================================================================
# Contradiction Scans — persist batch scan results
# =============================================================================

INSERT_CONTRADICTION_SCAN = """
INSERT INTO evidence.contradiction_scans
    (program_id, scan_type, section_ref, status, total_claims,
     contradictions_found, results, triggered_by, actor)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, program_id, scan_type, section_ref, status, total_claims,
          contradictions_found, results, triggered_by, actor,
          error_message, started_at, completed_at, created_at
"""

UPDATE_CONTRADICTION_SCAN_COMPLETE = """
UPDATE evidence.contradiction_scans
SET status = 'completed',
    total_claims = $2,
    contradictions_found = $3,
    results = $4,
    completed_at = NOW()
WHERE id = $1
RETURNING id, program_id, scan_type, section_ref, status, total_claims,
          contradictions_found, results, triggered_by, actor,
          error_message, started_at, completed_at, created_at
"""

UPDATE_CONTRADICTION_SCAN_FAILED = """
UPDATE evidence.contradiction_scans
SET status = 'failed',
    error_message = $2,
    completed_at = NOW()
WHERE id = $1
RETURNING id, status, error_message, completed_at
"""

SELECT_CONTRADICTION_SCANS_BY_PROGRAM = """
SELECT id, program_id, scan_type, section_ref, status, total_claims,
       contradictions_found, results, triggered_by, actor,
       error_message, started_at, completed_at, created_at
FROM evidence.contradiction_scans
WHERE program_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
"""

SELECT_CONTRADICTION_SCAN_BY_ID = """
SELECT id, program_id, scan_type, section_ref, status, total_claims,
       contradictions_found, results, triggered_by, actor,
       error_message, started_at, completed_at, created_at
FROM evidence.contradiction_scans
WHERE id = $1
"""

# =============================================================================
# RLS GUC helpers — reuse orchestration pattern
# =============================================================================

SET_PROGRAM_CONTEXT = """
SELECT set_config('app.current_program_id', $1::TEXT, TRUE)
"""

SET_BYPASS_RLS = """
SELECT set_config('app.bypass_rls', 'true', TRUE)
"""
