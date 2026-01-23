"""
SQL queries for program scoping and configuration bundles.
Multi-tenant access control + reproducible AI decisions.
"""

# =============================================================================
# Program Management
# =============================================================================

SQL_CREATE_PROGRAM = """
INSERT INTO core.programs (
    id, program_code, program_name, sponsor_name, substance_id,
    therapeutic_area, indication, phase, status, metadata, created_by
)
VALUES (
    COALESCE($1::uuid, uuid_generate_v4()),
    $2, $3, $4, $5, $6, $7, $8, 
    COALESCE($9, 'ACTIVE'),
    COALESCE($10::jsonb, '{}'::jsonb),
    COALESCE(current_setting('app.user', true), 'unknown')
)
RETURNING 
    id, program_code, program_name, sponsor_name, substance_id,
    therapeutic_area, indication, phase, status, metadata, created_at, created_by;
"""

SQL_GET_PROGRAM = """
SELECT 
    id, program_code, program_name, sponsor_name, substance_id,
    therapeutic_area, indication, phase, status, metadata, 
    created_at, created_by, updated_at
FROM core.programs
WHERE id = $1;
"""

SQL_GET_PROGRAM_BY_CODE = """
SELECT 
    id, program_code, program_name, sponsor_name, substance_id,
    therapeutic_area, indication, phase, status, metadata, 
    created_at, created_by, updated_at
FROM core.programs
WHERE program_code = $1;
"""

SQL_LIST_PROGRAMS = """
SELECT 
    p.id, p.program_code, p.program_name, p.sponsor_name, p.substance_id,
    p.therapeutic_area, p.indication, p.phase, p.status, p.metadata,
    p.created_at, p.created_by, p.updated_at,
    COUNT(DISTINCT m.user_identity) FILTER (WHERE m.is_active) AS member_count
FROM core.programs p
LEFT JOIN auth.user_program_memberships m ON m.program_id = p.id
WHERE p.status = COALESCE($1, p.status)
GROUP BY p.id
ORDER BY p.program_code;
"""

SQL_UPDATE_PROGRAM = """
UPDATE core.programs
SET
    program_name = COALESCE($2, program_name),
    sponsor_name = COALESCE($3, sponsor_name),
    substance_id = COALESCE($4, substance_id),
    therapeutic_area = COALESCE($5, therapeutic_area),
    indication = COALESCE($6, indication),
    phase = COALESCE($7, phase),
    status = COALESCE($8, status),
    metadata = COALESCE($9::jsonb, metadata),
    updated_at = NOW()
WHERE id = $1
RETURNING 
    id, program_code, program_name, sponsor_name, substance_id,
    therapeutic_area, indication, phase, status, metadata, created_at, updated_at;
"""

# =============================================================================
# User Program Memberships
# =============================================================================

SQL_ADD_MEMBERSHIP = """
INSERT INTO auth.user_program_memberships (
    user_identity, program_id, membership_role, access_level, 
    is_active, granted_by, expires_at, notes
)
VALUES (
    $1, $2, $3, 
    COALESCE($4, 'READ_WRITE'),
    TRUE,
    COALESCE(current_setting('app.user', true), 'unknown'),
    $5,
    $6
)
ON CONFLICT (user_identity, program_id, membership_role) 
DO UPDATE SET
    access_level = EXCLUDED.access_level,
    is_active = TRUE,
    expires_at = EXCLUDED.expires_at,
    notes = EXCLUDED.notes
RETURNING id, user_identity, program_id, membership_role, access_level, is_active, granted_at, granted_by, expires_at;
"""

SQL_REVOKE_MEMBERSHIP = """
UPDATE auth.user_program_memberships
SET is_active = FALSE
WHERE user_identity = $1 AND program_id = $2 AND membership_role = $3
RETURNING id, user_identity, program_id, membership_role, is_active;
"""

SQL_GET_USER_MEMBERSHIPS = """
SELECT 
    m.id, m.user_identity, m.program_id, m.membership_role, m.access_level,
    m.is_active, m.granted_at, m.granted_by, m.expires_at, m.notes,
    p.program_code, p.program_name, p.sponsor_name
FROM auth.user_program_memberships m
JOIN core.programs p ON p.id = m.program_id
WHERE m.user_identity = $1
  AND (m.is_active = $2 OR $2 IS NULL)
ORDER BY p.program_code, m.membership_role;
"""

SQL_GET_PROGRAM_MEMBERS = """
SELECT 
    m.id, m.user_identity, m.program_id, m.membership_role, m.access_level,
    m.is_active, m.granted_at, m.granted_by, m.expires_at, m.notes
FROM auth.user_program_memberships m
WHERE m.program_id = $1
  AND (m.is_active = TRUE OR $2 = TRUE)
ORDER BY m.membership_role, m.user_identity;
"""

SQL_CHECK_ACCESS = """
SELECT auth.can_access_program($1::uuid) AS can_access;
"""

SQL_CHECK_WRITE_ACCESS = """
SELECT auth.can_write_program($1::uuid) AS can_write;
"""

# =============================================================================
# Config Bundles
# =============================================================================

SQL_CREATE_CONFIG_BUNDLE = """
INSERT INTO audit.config_bundles (
    bundle_name, bundle_version, bundle_type, bundle_sha256, bundle_json
)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (bundle_sha256) DO NOTHING
RETURNING id, bundle_name, bundle_version, bundle_type, bundle_sha256, created_at, created_by;
"""

SQL_GET_OR_CREATE_CONFIG_BUNDLE = """
SELECT audit.fn_get_or_create_config_bundle($1, $2, $3, $4::jsonb) AS bundle_id;
"""

SQL_GET_CONFIG_BUNDLE = """
SELECT 
    id, bundle_name, bundle_version, bundle_type, bundle_sha256,
    bundle_json, created_at, created_by, request_id
FROM audit.config_bundles
WHERE id = $1;
"""

SQL_GET_CONFIG_BUNDLE_BY_SHA = """
SELECT 
    id, bundle_name, bundle_version, bundle_type, bundle_sha256,
    bundle_json, created_at, created_by, request_id
FROM audit.config_bundles
WHERE bundle_sha256 = $1;
"""

SQL_LIST_CONFIG_BUNDLES = """
SELECT 
    id, bundle_name, bundle_version, bundle_type, bundle_sha256,
    created_at, created_by
FROM audit.config_bundles
WHERE bundle_type = COALESCE($1, bundle_type)
ORDER BY created_at DESC
LIMIT $2;
"""

SQL_GET_CONFIG_BUNDLE_USAGE = """
SELECT 
    cb.id AS bundle_id,
    cb.bundle_name,
    cb.bundle_version,
    cb.bundle_type,
    cb.bundle_sha256,
    cb.created_at,
    (SELECT COUNT(*) FROM audit.shadow_run_groups rg WHERE rg.config_bundle_id = cb.id)::int AS run_group_count,
    (SELECT COUNT(*) FROM audit.concomitant_audit_logs al WHERE al.config_bundle_id = cb.id)::int AS audit_log_count
FROM audit.config_bundles cb
WHERE cb.id = $1;
"""

# =============================================================================
# Session Context Setup
# =============================================================================

SQL_SET_SESSION_CONTEXT = """
SELECT 
    set_config('app.user', $1, true),
    set_config('app.program_id', $2::text, true),
    set_config('app.request_id', COALESCE($3, ''), true);
"""

SQL_GET_GLOBAL_PROGRAM_ID = """
SELECT auth.global_program_id() AS global_program_id;
"""
