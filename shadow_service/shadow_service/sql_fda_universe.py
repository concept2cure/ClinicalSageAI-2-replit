"""SQL queries for the FDA 510(k) Predicate Universe — Phase 6.6.A.

Tables: fda_product_codes, fda_510k_clearances, predicate_safety_signals,
        fda_510k_embeddings, predicate_lineage
"""

# ─────────────────────────────────────────────────────────────────────────────
# Product Codes
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_PRODUCT_CODE = """
INSERT INTO predicate.fda_product_codes
    (code, device_class, regulation_number, review_panel, name, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (code) DO UPDATE SET
    device_class      = EXCLUDED.device_class,
    regulation_number = EXCLUDED.regulation_number,
    review_panel      = EXCLUDED.review_panel,
    name              = EXCLUDED.name,
    updated_at        = now()
RETURNING *;
"""

SELECT_PRODUCT_CODE = """
SELECT * FROM predicate.fda_product_codes WHERE code = $1;
"""

SELECT_PRODUCT_CODES_BY_CLASS = """
SELECT * FROM predicate.fda_product_codes WHERE device_class = $1
ORDER BY code;
"""

# ─────────────────────────────────────────────────────────────────────────────
# 510(k) Clearances
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_CLEARANCE = """
INSERT INTO predicate.fda_510k_clearances
    (k_number, applicant, device_name, product_code, decision_date,
     decision_code, summary_url, clearance_type, txt_content,
     statement_or_summary, third_party_review, expedited_review, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
ON CONFLICT (k_number) DO UPDATE SET
    applicant             = EXCLUDED.applicant,
    device_name           = EXCLUDED.device_name,
    product_code          = EXCLUDED.product_code,
    decision_date         = EXCLUDED.decision_date,
    decision_code         = EXCLUDED.decision_code,
    summary_url           = EXCLUDED.summary_url,
    clearance_type        = EXCLUDED.clearance_type,
    txt_content           = EXCLUDED.txt_content,
    statement_or_summary  = EXCLUDED.statement_or_summary,
    third_party_review    = EXCLUDED.third_party_review,
    expedited_review      = EXCLUDED.expedited_review,
    updated_at            = now()
RETURNING *;
"""

SELECT_CLEARANCE = """
SELECT * FROM predicate.fda_510k_clearances WHERE k_number = $1;
"""

SELECT_CLEARANCES_BY_PRODUCT_CODE = """
SELECT * FROM predicate.fda_510k_clearances
WHERE product_code = $1
  AND decision_code = 'SE'
ORDER BY decision_date DESC
LIMIT $2;
"""

SELECT_CLEARANCES_RECENT = """
SELECT * FROM predicate.fda_510k_clearances
WHERE product_code = $1
  AND decision_code = 'SE'
  AND decision_date > NOW() - INTERVAL '5 years'
ORDER BY decision_date DESC
LIMIT $2;
"""

SEARCH_CLEARANCES_BY_NAME = """
SELECT * FROM predicate.fda_510k_clearances
WHERE device_name ILIKE '%' || $1 || '%'
  AND decision_code = 'SE'
ORDER BY decision_date DESC
LIMIT $2;
"""

COUNT_CLEARANCES_BY_PRODUCT_CODE = """
SELECT COUNT(*) AS total FROM predicate.fda_510k_clearances
WHERE product_code = $1;
"""

TEXT_SEARCH_CLEARANCES = """
SELECT * FROM predicate.fda_510k_clearances
WHERE device_name ILIKE '%' || $1 || '%'
   OR applicant ILIKE '%' || $1 || '%'
   OR txt_content ILIKE '%' || $1 || '%'
ORDER BY decision_date DESC
LIMIT $2;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Safety Signals
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_SAFETY_SIGNAL = """
INSERT INTO predicate.predicate_safety_signals
    (k_number, signal_type, signal_date, description, severity_score,
     source_url, recall_number, event_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT DO NOTHING
RETURNING *;
"""

SELECT_SIGNALS_BY_K_NUMBER = """
SELECT * FROM predicate.predicate_safety_signals
WHERE k_number = $1
ORDER BY severity_score DESC;
"""

SELECT_SIGNALS_BY_K_NUMBERS = """
SELECT *
FROM predicate.predicate_safety_signals
WHERE k_number = ANY($1::text[])
ORDER BY k_number, severity_score DESC;
"""

SELECT_TOXIC_K_NUMBERS = """
SELECT k_number, MAX(severity_score) AS max_severity, COUNT(*) AS signal_count
FROM predicate.predicate_safety_signals
WHERE severity_score > $1
GROUP BY k_number
ORDER BY max_severity DESC;
"""

SELECT_SIGNALS_BY_TYPE = """
SELECT * FROM predicate.predicate_safety_signals
WHERE signal_type = $1
ORDER BY signal_date DESC
LIMIT $2;
"""

SELECT_SAFETY_SIGNALS = """
SELECT s.*, c.device_name, c.product_code
FROM predicate.predicate_safety_signals s
JOIN predicate.fda_510k_clearances c ON c.k_number = s.k_number
ORDER BY s.severity_score DESC, s.signal_date DESC
LIMIT $1;
"""

CHECK_FAMILY_SAFETY = """
WITH RECURSIVE family AS (
    SELECT parent_k_number AS k_number, 1 AS depth
    FROM predicate.predicate_lineage
    WHERE child_k_number = $1
    UNION ALL
    SELECT pl.parent_k_number, f.depth + 1
    FROM predicate.predicate_lineage pl
    JOIN family f ON f.k_number = pl.child_k_number
    WHERE f.depth < 5
)
SELECT COUNT(DISTINCT s.id) AS family_recall_count
FROM family f
JOIN predicate.predicate_safety_signals s ON s.k_number = f.k_number
WHERE s.signal_type IN ('Class1Recall', 'Class2Recall');
"""

CHECK_FAMILY_SAFETY_BY_K_NUMBERS = """
WITH RECURSIVE roots AS (
    SELECT UNNEST($1::text[]) AS root_k_number
),
family AS (
    SELECT
        r.root_k_number,
        pl.parent_k_number AS k_number,
        1 AS depth
    FROM roots r
    JOIN predicate.predicate_lineage pl ON pl.child_k_number = r.root_k_number

    UNION ALL

    SELECT
        f.root_k_number,
        pl.parent_k_number AS k_number,
        f.depth + 1
    FROM family f
    JOIN predicate.predicate_lineage pl ON pl.child_k_number = f.k_number
    WHERE f.depth < 5
)
SELECT
    r.root_k_number AS k_number,
    COUNT(DISTINCT s.id)::int AS family_recall_count
FROM roots r
LEFT JOIN family f ON f.root_k_number = r.root_k_number
LEFT JOIN predicate.predicate_safety_signals s
    ON s.k_number = f.k_number
   AND s.signal_type IN ('Class1Recall', 'Class2Recall')
GROUP BY r.root_k_number;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Embeddings
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_EMBEDDING = """
INSERT INTO predicate.fda_510k_embeddings
    (k_number, embedding, content_hash, model_version, updated_at)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (k_number) DO UPDATE SET
    embedding     = EXCLUDED.embedding,
    content_hash  = EXCLUDED.content_hash,
    model_version = EXCLUDED.model_version,
    updated_at    = now()
RETURNING k_number;
"""

SEMANTIC_SEARCH_CLEARANCES = """
SELECT
    c.k_number,
    c.device_name,
    c.applicant,
    c.product_code,
    c.decision_date,
    c.decision_code,
    c.clearance_type,
    c.summary_url,
    (e.embedding <=> $1::vector) AS semantic_distance
FROM predicate.fda_510k_clearances c
JOIN predicate.fda_510k_embeddings e ON c.k_number = e.k_number
WHERE c.product_code = $2
  AND c.decision_code = 'SE'
ORDER BY semantic_distance ASC
LIMIT $3;
"""

SEMANTIC_SEARCH_NO_FILTER = """
SELECT
    c.k_number,
    c.device_name,
    c.applicant,
    c.product_code,
    c.decision_date,
    c.decision_code,
    (e.embedding <=> $1::vector) AS semantic_distance
FROM predicate.fda_510k_clearances c
JOIN predicate.fda_510k_embeddings e ON c.k_number = e.k_number
WHERE c.decision_code = 'SE'
ORDER BY semantic_distance ASC
LIMIT $2;
"""

SELECT_EMBEDDING = """
SELECT * FROM predicate.fda_510k_embeddings WHERE k_number = $1;
"""

COUNT_EMBEDDINGS = """
SELECT COUNT(*) AS total FROM predicate.fda_510k_embeddings;
"""

SELECT_CLEARANCES_NEEDING_EMBEDDINGS = """
SELECT c.k_number, c.device_name, c.txt_content
FROM predicate.fda_510k_clearances c
LEFT JOIN predicate.fda_510k_embeddings e ON c.k_number = e.k_number
WHERE e.k_number IS NULL
  AND c.txt_content IS NOT NULL
  AND LENGTH(c.txt_content) > 50
ORDER BY c.decision_date DESC
LIMIT $1;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Lineage Graph
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_LINEAGE = """
INSERT INTO predicate.predicate_lineage
    (child_k_number, parent_k_number, relationship_type, lineage_distance, source)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (child_k_number, parent_k_number) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type,
    lineage_distance  = EXCLUDED.lineage_distance,
    source            = EXCLUDED.source
RETURNING *;
"""

SELECT_PARENTS = """
SELECT pl.*, c.device_name, c.applicant, c.product_code, c.decision_date
FROM predicate.predicate_lineage pl
JOIN predicate.fda_510k_clearances c ON c.k_number = pl.parent_k_number
WHERE pl.child_k_number = $1
ORDER BY pl.lineage_distance ASC;
"""

SELECT_CHILDREN = """
SELECT pl.*, c.device_name, c.applicant, c.product_code, c.decision_date
FROM predicate.predicate_lineage pl
JOIN predicate.fda_510k_clearances c ON c.k_number = pl.child_k_number
WHERE pl.parent_k_number = $1
ORDER BY c.decision_date DESC;
"""

GET_FULL_LINEAGE_TREE = """
WITH RECURSIVE tree AS (
    SELECT child_k_number, parent_k_number, relationship_type, lineage_distance, 1 AS depth
    FROM predicate.predicate_lineage
    WHERE child_k_number = $1
    UNION ALL
    SELECT pl.child_k_number, pl.parent_k_number, pl.relationship_type,
           pl.lineage_distance, t.depth + 1
    FROM predicate.predicate_lineage pl
    JOIN tree t ON t.parent_k_number = pl.child_k_number
    WHERE t.depth < $2
)
SELECT DISTINCT t.*, c.device_name, c.applicant, c.product_code
FROM tree t
JOIN predicate.fda_510k_clearances c ON c.k_number = t.parent_k_number
ORDER BY t.depth, t.lineage_distance;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Materialized view refresh
# ─────────────────────────────────────────────────────────────────────────────

REFRESH_TOXIC_PREDICATES = """
REFRESH MATERIALIZED VIEW CONCURRENTLY predicate.toxic_predicates;
"""

SELECT_TOXIC_PREDICATES = """
SELECT * FROM predicate.toxic_predicates
WHERE product_code = $1
ORDER BY max_severity DESC;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Risk Rollups (Phase 6.6.A enterprise polish)
# ─────────────────────────────────────────────────────────────────────────────

UPSERT_RISK_ROLLUP = """
INSERT INTO predicate.predicate_risk_rollups
    (k_number, toxicity_score, family_toxicity_score, mdr_rate_bucket,
     signal_count, family_signal_count, last_signal_date, worst_signal_type, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
ON CONFLICT (k_number) DO UPDATE SET
    toxicity_score        = EXCLUDED.toxicity_score,
    family_toxicity_score = EXCLUDED.family_toxicity_score,
    mdr_rate_bucket       = EXCLUDED.mdr_rate_bucket,
    signal_count          = EXCLUDED.signal_count,
    family_signal_count   = EXCLUDED.family_signal_count,
    last_signal_date      = EXCLUDED.last_signal_date,
    worst_signal_type     = EXCLUDED.worst_signal_type,
    updated_at            = now()
RETURNING *;
"""

SELECT_RISK_ROLLUP = """
SELECT * FROM predicate.predicate_risk_rollups WHERE k_number = $1;
"""

SELECT_TOXIC_ROLLUPS = """
SELECT r.*, c.device_name, c.product_code, c.applicant
FROM predicate.predicate_risk_rollups r
JOIN predicate.fda_510k_clearances c ON c.k_number = r.k_number
WHERE r.toxicity_score > $1
ORDER BY r.toxicity_score DESC
LIMIT $2;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Ingestion Run Log (fda_ingest_runs)
# ─────────────────────────────────────────────────────────────────────────────

INSERT_INGEST_RUN = """
INSERT INTO predicate.fda_ingest_runs
    (job_name, status, started_at, product_codes_filter, max_clearances_limit,
     triggered_by, run_fingerprint)
VALUES ($1, 'running', now(), $2, $3, $4, $5)
RETURNING id;
"""

UPDATE_INGEST_RUN_COMPLETED = """
UPDATE predicate.fda_ingest_runs
SET status              = $2,
    completed_at        = now(),
    duration_seconds    = $3,
    clearances_processed = $4,
    clearances_upserted  = $5,
    signals_processed    = $6,
    signals_upserted     = $7,
    errors_count         = $8,
    errors_detail        = $9::jsonb
WHERE id = $1;
"""

SELECT_LAST_INGEST_RUN = """
SELECT * FROM predicate.fda_ingest_runs
ORDER BY started_at DESC
LIMIT 1;
"""

SELECT_LAST_SUCCESSFUL_INGEST = """
SELECT * FROM predicate.fda_ingest_runs
WHERE status = 'completed'
ORDER BY completed_at DESC
LIMIT 1;
"""

SELECT_INGEST_RUNS_RECENT = """
SELECT * FROM predicate.fda_ingest_runs
ORDER BY started_at DESC
LIMIT $1;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Health / Stats (6.6.A acceptance criteria)
# ─────────────────────────────────────────────────────────────────────────────

HEALTH_STATS = """
SELECT
    (SELECT COUNT(*) FROM predicate.fda_510k_clearances)      AS total_clearances,
    (SELECT COUNT(*) FROM predicate.fda_510k_embeddings)      AS total_embeddings,
    (SELECT COUNT(*) FROM predicate.predicate_safety_signals)  AS total_signals,
    (SELECT COUNT(*) FROM predicate.predicate_lineage)         AS total_lineage_edges,
    (SELECT COUNT(*) FROM predicate.predicate_risk_rollups)    AS total_rollups,
    CASE
        WHEN (SELECT COUNT(*) FROM predicate.fda_510k_clearances) = 0 THEN 0
        ELSE ROUND(
            100.0 * (SELECT COUNT(*) FROM predicate.fda_510k_embeddings) /
            (SELECT COUNT(*) FROM predicate.fda_510k_clearances), 1
        )
    END AS pct_with_embeddings,
    CASE
        WHEN (SELECT COUNT(*) FROM predicate.fda_510k_clearances) = 0 THEN 0
        ELSE ROUND(
            100.0 * (SELECT COUNT(DISTINCT k_number) FROM predicate.predicate_safety_signals) /
            (SELECT COUNT(*) FROM predicate.fda_510k_clearances), 1
        )
    END AS pct_with_signals;
"""

# ─────────────────────────────────────────────────────────────────────────────
# Predicate Suggestion — Full-Text Search + Scoring (Phase 6.6.B)
# ─────────────────────────────────────────────────────────────────────────────

# FTS search: product_code filter + full-text rank on txt_content + device_name.
# Returns raw rows with fts_rank for Python-side composite scoring.
# $1 = product_code, $2 = plainto_tsquery subject text, $3 = limit
SUGGEST_PREDICATES_FTS = """
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
ORDER BY fts_rank DESC, c.decision_date DESC
LIMIT $3;
"""

# Fallback when subject text is empty / FTS returns nothing — pure recency sort.
SUGGEST_PREDICATES_FALLBACK = """
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
ORDER BY c.decision_date DESC
LIMIT $2;
"""

# Count total SE clearances for a product code (for response metadata).
COUNT_SE_CLEARANCES = """
SELECT COUNT(*) AS total
FROM predicate.fda_510k_clearances
WHERE product_code = $1
  AND decision_code = 'SE';
"""
