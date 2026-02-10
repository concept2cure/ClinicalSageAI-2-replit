"""SQL queries for Phase 6.6.B — Predicate Suggestion Engine.

Separated from router per spec: "do NOT stuff SQL into router."
All parameterized queries for candidate selection + freshness checks.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Candidate selection (v1 per spec)
# ─────────────────────────────────────────────────────────────────────────────

# Hard filters: product_code + SE decision + last 10 years (configurable).
# FTS rank on txt_content + device_name for relevance pre-score.
# Stable ordering: fts_rank DESC, decision_date DESC, k_number ASC.
# $1 = product_code, $2 = plainto_tsquery subject text, $3 = limit
SUGGEST_CANDIDATES_FTS = """
SELECT
    c.k_number,
    c.device_name,
    c.applicant,
    c.product_code,
    c.decision_date,
    c.decision_code,
    c.summary_url,
    c.txt_content,
    c.clearance_type,
    ts_rank_cd(
        to_tsvector('english', coalesce(c.txt_content, '') || ' ' || coalesce(c.device_name, '')),
        plainto_tsquery('english', $2)
    ) AS fts_rank
FROM predicate.fda_510k_clearances c
WHERE c.product_code = $1
  AND c.decision_code = 'SE'
  AND c.decision_date >= NOW() - INTERVAL '10 years'
ORDER BY fts_rank DESC, c.decision_date DESC, c.k_number ASC
LIMIT $3;
"""

# Fallback when subject text is empty — pure recency sort with stable tie-break.
# $1 = product_code, $2 = limit
SUGGEST_CANDIDATES_FALLBACK = """
SELECT
    c.k_number,
    c.device_name,
    c.applicant,
    c.product_code,
    c.decision_date,
    c.decision_code,
    c.summary_url,
    c.txt_content,
    c.clearance_type,
    0.0 AS fts_rank
FROM predicate.fda_510k_clearances c
WHERE c.product_code = $1
  AND c.decision_code = 'SE'
ORDER BY c.decision_date DESC, c.k_number ASC
LIMIT $2;
"""

# Count total SE clearances for a product code (response metadata).
# $1 = product_code
COUNT_SE_CLEARANCES = """
SELECT COUNT(*) AS total
FROM predicate.fda_510k_clearances
WHERE product_code = $1
  AND decision_code = 'SE';
"""

# ─────────────────────────────────────────────────────────────────────────────
# Data freshness gate (spec: 503 if not fresh)
# ─────────────────────────────────────────────────────────────────────────────

# Check latest successful ingest run. Returns NULL if no successful run exists.
# Used by router to enforce freshness gate before querying.
CHECK_INGEST_FRESHNESS = """
SELECT
    MAX(completed_at) AS latest_success_at
FROM predicate.fda_ingest_runs
WHERE status = 'completed'
  AND job_name NOT IN ('predicate_suggest', 'se_matrix_render');
"""

# ─────────────────────────────────────────────────────────────────────────────
# Audit event insertion (B5)
# ─────────────────────────────────────────────────────────────────────────────

# Insert a PREDICATE_SUGGEST audit event.
# $1 = job_name, $2 = status, $3 = product_codes_filter (text[]),
# $4 = max_clearances_limit (int), $5 = triggered_by (text),
# $6 = run_fingerprint (text/json)
INSERT_AUDIT_EVENT = """
INSERT INTO predicate.fda_ingest_runs
    (job_name, status, started_at, product_codes_filter, max_clearances_limit,
     triggered_by, run_fingerprint)
VALUES ($1, $2, NOW(), $3, $4, $5, $6);
"""
