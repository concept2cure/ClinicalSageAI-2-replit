"""SQL queries for Phase 6.6 — Predicate Intelligence.

Parameterized queries for predicate.candidates, predicate.se_matrix_rows,
predicate.fda_enforcement, and predicate.defense_previews tables.
"""

# ─── Context ─────────────────────────────────────────────────────────────────
SET_PROGRAM_CONTEXT = """
SELECT set_config('app.current_program_id', $1::TEXT, TRUE)
"""

# ─── Candidates ──────────────────────────────────────────────────────────────

INSERT_CANDIDATE = """
INSERT INTO predicate.candidates (
    program_id, k_number, device_name, manufacturer, clearance_date,
    product_code, regulation_number, similarity_score, toxicity_score,
    has_class_i_recall, has_class_ii_recall, has_safety_comm, mdr_event_count,
    golden_bridge_path, route_type, recommended, evidence_links,
    selection_rationale, status
)
VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
)
RETURNING *
"""

SELECT_CANDIDATES_BY_PROGRAM = """
SELECT * FROM predicate.candidates
 WHERE program_id = $1
   AND status != 'archived'
 ORDER BY toxicity_score ASC, similarity_score DESC
"""

SELECT_CANDIDATE_BY_ID = """
SELECT * FROM predicate.candidates
 WHERE id = $1 AND program_id = $2
"""

SELECT_CANDIDATE_BY_K_NUMBER = """
SELECT * FROM predicate.candidates
 WHERE k_number = $1 AND program_id = $2
"""

UPDATE_CANDIDATE_TOXICITY = """
UPDATE predicate.candidates
   SET toxicity_score = $3,
       has_class_i_recall = $4,
       has_class_ii_recall = $5,
       has_safety_comm = $6,
       mdr_event_count = $7,
       updated_at = NOW()
 WHERE id = $1 AND program_id = $2
RETURNING *
"""

UPDATE_CANDIDATE_STATUS = """
UPDATE predicate.candidates
   SET status = $3, updated_at = NOW()
 WHERE id = $1 AND program_id = $2
RETURNING *
"""

UPDATE_CANDIDATE_ROUTE = """
UPDATE predicate.candidates
   SET route_type = $3,
       golden_bridge_path = $4,
       recommended = $5,
       selection_rationale = $6,
       updated_at = NOW()
 WHERE id = $1 AND program_id = $2
RETURNING *
"""

DELETE_CANDIDATE = """
DELETE FROM predicate.candidates
 WHERE id = $1 AND program_id = $2
"""

# ─── FDA Enforcement ─────────────────────────────────────────────────────────

INSERT_ENFORCEMENT = """
INSERT INTO predicate.fda_enforcement (
    k_number, recall_number, product_code, event_type, event_date,
    classification, reason, source_url, raw_data
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT DO NOTHING
RETURNING *
"""

SELECT_ENFORCEMENT_BY_K_NUMBER = """
SELECT * FROM predicate.fda_enforcement
 WHERE k_number = $1
 ORDER BY event_date DESC
"""

SELECT_ENFORCEMENT_BY_PRODUCT_CODE = """
SELECT * FROM predicate.fda_enforcement
 WHERE product_code = $1
 ORDER BY event_date DESC
"""

COUNT_MDR_EVENTS = """
SELECT COUNT(*) AS mdr_count
  FROM predicate.fda_enforcement
 WHERE k_number = $1
   AND event_type = 'mdr_report'
"""

SELECT_RECALLS_BY_K_NUMBER = """
SELECT * FROM predicate.fda_enforcement
 WHERE k_number = $1
   AND event_type IN ('class_i_recall', 'class_ii_recall', 'class_iii_recall')
 ORDER BY event_date DESC
"""

# ─── SE Matrix Rows ──────────────────────────────────────────────────────────

INSERT_SE_ROW = """
INSERT INTO predicate.se_matrix_rows (
    program_id, candidate_id, sort_order, characteristic, category,
    subject_value, subject_evidence_ids, subject_confidence,
    predicate_value, predicate_evidence_ids, predicate_confidence,
    equivalence_status, diff_explanation, diff_severity
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *
"""

SELECT_SE_ROWS_BY_CANDIDATE = """
SELECT * FROM predicate.se_matrix_rows
 WHERE candidate_id = $1 AND program_id = $2
 ORDER BY sort_order ASC
"""

SELECT_SE_ROWS_BY_PROGRAM = """
SELECT * FROM predicate.se_matrix_rows
 WHERE program_id = $1
 ORDER BY candidate_id, sort_order ASC
"""

UPDATE_SE_ROW_EQUIVALENCE = """
UPDATE predicate.se_matrix_rows
   SET equivalence_status = $3,
       diff_explanation = $4,
       diff_severity = $5,
       updated_at = NOW()
 WHERE id = $1 AND program_id = $2
RETURNING *
"""

DELETE_SE_ROWS_BY_CANDIDATE = """
DELETE FROM predicate.se_matrix_rows
 WHERE candidate_id = $1 AND program_id = $2
"""

# ─── Defense Previews ─────────────────────────────────────────────────────────

INSERT_DEFENSE_PREVIEW = """
INSERT INTO predicate.defense_previews (
    program_id, candidate_id, readiness_score,
    anticipated_questions, internal_contradictions,
    evidence_gaps, toxic_warnings
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *
"""

SELECT_DEFENSE_PREVIEW = """
SELECT * FROM predicate.defense_previews
 WHERE candidate_id = $1 AND program_id = $2
 ORDER BY generated_at DESC
 LIMIT 1
"""

SELECT_DEFENSE_PREVIEWS_BY_PROGRAM = """
SELECT * FROM predicate.defense_previews
 WHERE program_id = $1
 ORDER BY generated_at DESC
"""
