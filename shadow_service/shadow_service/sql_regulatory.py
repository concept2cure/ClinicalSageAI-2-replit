"""
SQL queries for regulatory timeline and milestone operations.
"""

# =============================================================================
# Submissions
# =============================================================================

SQL_LIST_SUBMISSIONS = """
SELECT 
    s.id, s.submission_code, s.submission_name,
    s.submission_type_id, t.type_code, t.type_name, t.agency_code,
    s.program_id, p.program_code, p.program_name,
    s.status, s.primary_snapshot_id,
    s.target_date, s.submission_date, s.acceptance_date,
    s.pdufa_date, s.approval_date,
    s.created_at, s.created_by, s.updated_at
FROM regulatory.submissions s
LEFT JOIN regulatory.submission_types t ON t.id = s.submission_type_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE ($1::uuid IS NULL OR s.program_id = $1)
  AND ($2::text IS NULL OR s.status = $2)
ORDER BY s.target_date NULLS LAST, s.created_at DESC;
"""

SQL_GET_SUBMISSION = """
SELECT s.*, t.type_code, t.type_name, t.agency_code, p.program_code
FROM regulatory.submissions s
LEFT JOIN regulatory.submission_types t ON t.id = s.submission_type_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE s.id = $1;
"""

SQL_CREATE_SUBMISSION = """
INSERT INTO regulatory.submissions (
    submission_code, submission_name, submission_type_id,
    program_id, status, primary_snapshot_id,
    target_date, notes, metadata, created_by
)
VALUES ($1, $2, $3, $4, COALESCE($5, 'PLANNING'), $6, $7, $8, 
        COALESCE($9::jsonb, '{}'::jsonb),
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_SUBMISSION_STATUS = """
UPDATE regulatory.submissions
SET status = $2,
    status_changed_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

SQL_UPDATE_SUBMISSION_DATES = """
UPDATE regulatory.submissions
SET submission_date = COALESCE($2, submission_date),
    acceptance_date = COALESCE($3, acceptance_date),
    pdufa_date = COALESCE($4, pdufa_date),
    approval_date = COALESCE($5, approval_date),
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

# =============================================================================
# Milestones
# =============================================================================

SQL_LIST_MILESTONES = """
SELECT 
    m.id, m.submission_id, m.milestone_code, m.milestone_name,
    m.description, m.status,
    m.planned_date, m.actual_date, m.deadline,
    m.days_until_deadline,
    m.owner, m.linked_snapshot_id, m.linked_export_id,
    m.notes, m.created_at, m.created_by
FROM regulatory.milestones m
WHERE m.submission_id = $1
ORDER BY COALESCE(m.planned_date, m.deadline) NULLS LAST;
"""

SQL_GET_MILESTONE = """
SELECT * FROM regulatory.milestones WHERE id = $1;
"""

SQL_CREATE_MILESTONE = """
INSERT INTO regulatory.milestones (
    submission_id, milestone_code, milestone_name, description,
    status, planned_date, deadline, owner, notes, created_by
)
VALUES ($1, $2, $3, $4, COALESCE($5, 'PLANNED'), $6, $7, $8, $9,
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_MILESTONE_STATUS = """
UPDATE regulatory.milestones
SET status = $2,
    actual_date = CASE WHEN $2 = 'COMPLETED' THEN COALESCE($3, CURRENT_DATE) ELSE actual_date END,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

SQL_GET_UPCOMING_DEADLINES = """
SELECT 
    m.id, m.submission_id, s.submission_code,
    m.milestone_code, m.milestone_name,
    m.deadline, m.days_until_deadline, m.status,
    s.program_id, p.program_code
FROM regulatory.milestones m
JOIN regulatory.submissions s ON s.id = m.submission_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE m.deadline IS NOT NULL
  AND m.status NOT IN ('COMPLETED', 'CANCELLED')
  AND m.days_until_deadline <= $1
  AND ($2::uuid IS NULL OR s.program_id = $2)
ORDER BY m.deadline;
"""

# =============================================================================
# Agency Correspondence
# =============================================================================

SQL_LIST_CORRESPONDENCE = """
SELECT 
    c.id, c.submission_id, c.correspondence_type,
    c.reference_number, c.subject, c.direction,
    c.correspondence_date, c.due_date, c.response_date,
    c.document_refs, c.summary, c.action_items,
    c.created_at, c.created_by
FROM regulatory.agency_correspondence c
WHERE c.submission_id = $1
ORDER BY c.correspondence_date DESC;
"""

SQL_CREATE_CORRESPONDENCE = """
INSERT INTO regulatory.agency_correspondence (
    submission_id, correspondence_type, reference_number,
    subject, direction, correspondence_date, due_date,
    document_refs, summary, action_items, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_GET_PENDING_RESPONSES = """
SELECT 
    c.id, c.submission_id, s.submission_code,
    c.correspondence_type, c.reference_number, c.subject,
    c.due_date, c.due_date - CURRENT_DATE AS days_until_due,
    s.program_id, p.program_code
FROM regulatory.agency_correspondence c
JOIN regulatory.submissions s ON s.id = c.submission_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE c.direction = 'INBOUND'
  AND c.due_date IS NOT NULL
  AND c.response_date IS NULL
  AND ($1::uuid IS NULL OR s.program_id = $1)
ORDER BY c.due_date;
"""

# =============================================================================
# Information Requests
# =============================================================================

SQL_LIST_INFORMATION_REQUESTS = """
SELECT 
    ir.id, ir.submission_id, ir.ir_number, ir.ir_type,
    ir.status, ir.received_date, ir.due_date, ir.submitted_date,
    ir.question_count, ir.answered_count,
    ir.due_date - CURRENT_DATE AS days_until_due,
    s.submission_code, s.program_id, p.program_code
FROM regulatory.information_requests ir
JOIN regulatory.submissions s ON s.id = ir.submission_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE ($1::uuid IS NULL OR ir.submission_id = $1)
  AND ($2::text IS NULL OR ir.status = $2)
ORDER BY ir.due_date NULLS LAST;
"""

SQL_GET_INFORMATION_REQUEST = """
SELECT ir.*, s.submission_code, p.program_code
FROM regulatory.information_requests ir
JOIN regulatory.submissions s ON s.id = ir.submission_id
LEFT JOIN core.programs p ON p.id = s.program_id
WHERE ir.id = $1;
"""

SQL_CREATE_INFORMATION_REQUEST = """
INSERT INTO regulatory.information_requests (
    submission_id, ir_number, ir_type, status,
    received_date, due_date, question_count,
    questions, notes, created_by
)
VALUES ($1, $2, $3, COALESCE($4, 'RECEIVED'), $5, $6, 
        COALESCE($7, 0), COALESCE($8::jsonb, '[]'::jsonb), $9,
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_IR_STATUS = """
UPDATE regulatory.information_requests
SET status = $2,
    submitted_date = CASE WHEN $2 = 'SUBMITTED' THEN COALESCE($3, CURRENT_DATE) ELSE submitted_date END,
    answered_count = COALESCE($4, answered_count),
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

# =============================================================================
# Timeline Views
# =============================================================================

SQL_GET_SUBMISSION_TIMELINE = """
SELECT 
    'MILESTONE' AS event_type,
    m.id AS event_id,
    m.milestone_name AS event_name,
    COALESCE(m.actual_date, m.planned_date, m.deadline) AS event_date,
    m.status,
    NULL AS reference_number
FROM regulatory.milestones m
WHERE m.submission_id = $1

UNION ALL

SELECT 
    'CORRESPONDENCE' AS event_type,
    c.id AS event_id,
    c.subject AS event_name,
    c.correspondence_date AS event_date,
    c.direction AS status,
    c.reference_number
FROM regulatory.agency_correspondence c
WHERE c.submission_id = $1

UNION ALL

SELECT 
    'IR' AS event_type,
    ir.id AS event_id,
    ir.ir_number || ': ' || ir.ir_type AS event_name,
    ir.received_date AS event_date,
    ir.status,
    ir.ir_number AS reference_number
FROM regulatory.information_requests ir
WHERE ir.submission_id = $1

ORDER BY event_date NULLS LAST;
"""

SQL_GET_PROGRAM_REGULATORY_OVERVIEW = """
SELECT 
    s.program_id,
    p.program_code,
    p.program_name,
    COUNT(DISTINCT s.id) AS submission_count,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('SUBMITTED', 'UNDER_REVIEW')) AS active_submissions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'APPROVED') AS approved_count,
    MIN(m.deadline) FILTER (WHERE m.status NOT IN ('COMPLETED', 'CANCELLED') AND m.deadline > CURRENT_DATE) AS next_deadline,
    COUNT(DISTINCT ir.id) FILTER (WHERE ir.submitted_date IS NULL) AS open_ir_count
FROM regulatory.submissions s
JOIN core.programs p ON p.id = s.program_id
LEFT JOIN regulatory.milestones m ON m.submission_id = s.id
LEFT JOIN regulatory.information_requests ir ON ir.submission_id = s.id
WHERE ($1::uuid IS NULL OR s.program_id = $1)
GROUP BY s.program_id, p.program_code, p.program_name;
"""
