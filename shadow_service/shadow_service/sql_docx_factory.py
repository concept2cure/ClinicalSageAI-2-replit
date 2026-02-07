"""Phase 6 — DOCX Factory: Parameterized SQL queries.

All queries use asyncpg positional parameters ($1, $2, ...).
Tables live in the `documents` schema with RLS via GUC.
"""

# =============================================================================
# RLS helpers (reuse evidence pattern)
# =============================================================================

SET_PROGRAM_CONTEXT = """
SELECT set_config('app.current_program_id', $1::TEXT, TRUE)
"""

SET_BYPASS_RLS = """
SELECT set_config('app.bypass_rls', 'true', TRUE)
"""


# =============================================================================
# Templates
# =============================================================================

INSERT_TEMPLATE = """
INSERT INTO documents.templates (program_id, name, doc_type, status)
VALUES ($1, $2, $3, $4)
RETURNING id, program_id, name, doc_type, status, created_at, updated_at
"""

SELECT_TEMPLATE_BY_ID = """
SELECT id, program_id, name, doc_type, status, created_at, updated_at
  FROM documents.templates
 WHERE id = $1
"""

SELECT_TEMPLATES_BY_PROGRAM = """
SELECT id, program_id, name, doc_type, status, created_at, updated_at
  FROM documents.templates
 WHERE program_id = $1
 ORDER BY created_at DESC
"""

UPDATE_TEMPLATE_STATUS = """
UPDATE documents.templates
   SET status = $2, updated_at = NOW()
 WHERE id = $1
RETURNING id, program_id, name, doc_type, status, created_at, updated_at
"""


# =============================================================================
# Template Versions
# =============================================================================

INSERT_TEMPLATE_VERSION = """
INSERT INTO documents.template_versions (template_id, version, storage_key, sha256)
VALUES ($1, $2, $3, $4)
RETURNING id, template_id, version, storage_key, sha256, created_at
"""

SELECT_TEMPLATE_VERSION_BY_ID = """
SELECT id, template_id, version, storage_key, sha256, created_at
  FROM documents.template_versions
 WHERE id = $1
"""

SELECT_LATEST_TEMPLATE_VERSION = """
SELECT id, template_id, version, storage_key, sha256, created_at
  FROM documents.template_versions
 WHERE template_id = $1
 ORDER BY version DESC
 LIMIT 1
"""

SELECT_TEMPLATE_VERSIONS = """
SELECT id, template_id, version, storage_key, sha256, created_at
  FROM documents.template_versions
 WHERE template_id = $1
 ORDER BY version DESC
"""

SELECT_NEXT_VERSION_NUMBER = """
SELECT COALESCE(MAX(version), 0) + 1 AS next_version
  FROM documents.template_versions
 WHERE template_id = $1
"""


# =============================================================================
# Renders
# =============================================================================

INSERT_RENDER = """
INSERT INTO documents.renders (program_id, template_version_id, inputs_json, status)
VALUES ($1, $2, $3::jsonb, 'queued')
RETURNING id, program_id, template_version_id, inputs_json, status,
          started_at, completed_at, error, created_at
"""

SELECT_RENDER_BY_ID = """
SELECT id, program_id, template_version_id, inputs_json, status,
       started_at, completed_at, error, created_at
  FROM documents.renders
 WHERE id = $1
"""

SELECT_RENDERS_BY_PROGRAM = """
SELECT id, program_id, template_version_id, inputs_json, status,
       started_at, completed_at, error, created_at
  FROM documents.renders
 WHERE program_id = $1
 ORDER BY created_at DESC
"""

UPDATE_RENDER_STATUS_RUNNING = """
UPDATE documents.renders
   SET status = 'running', started_at = NOW()
 WHERE id = $1
RETURNING id, program_id, template_version_id, inputs_json, status,
          started_at, completed_at, error, created_at
"""

UPDATE_RENDER_STATUS_COMPLETED = """
UPDATE documents.renders
   SET status = 'completed', completed_at = NOW()
 WHERE id = $1
RETURNING id, program_id, template_version_id, inputs_json, status,
          started_at, completed_at, error, created_at
"""

UPDATE_RENDER_STATUS_FAILED = """
UPDATE documents.renders
   SET status = 'failed', completed_at = NOW(), error = $2
 WHERE id = $1
RETURNING id, program_id, template_version_id, inputs_json, status,
          started_at, completed_at, error, created_at
"""


# =============================================================================
# Artifacts
# =============================================================================

INSERT_ARTIFACT = """
INSERT INTO documents.artifacts (render_id, file_type, storage_key, sha256, size_bytes)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, render_id, file_type, storage_key, sha256, size_bytes, created_at
"""

SELECT_ARTIFACTS_BY_RENDER = """
SELECT id, render_id, file_type, storage_key, sha256, size_bytes, created_at
  FROM documents.artifacts
 WHERE render_id = $1
 ORDER BY created_at
"""


# =============================================================================
# Render Events (append-only)
# =============================================================================

INSERT_RENDER_EVENT = """
INSERT INTO documents.render_events (render_id, event_type, payload_json)
VALUES ($1, $2, $3::jsonb)
RETURNING id, render_id, event_type, payload_json, created_at
"""

SELECT_RENDER_EVENTS = """
SELECT id, render_id, event_type, payload_json, created_at
  FROM documents.render_events
 WHERE render_id = $1
 ORDER BY created_at
"""


# =============================================================================
# Artifact by ID (for download)
# =============================================================================

SELECT_ARTIFACT_BY_ID = """
SELECT id, render_id, file_type, storage_key, sha256, size_bytes, created_at
  FROM documents.artifacts
 WHERE id = $1
"""

SELECT_ARTIFACT_BY_ID_WITH_PROGRAM = """
SELECT a.id, a.render_id, a.file_type, a.storage_key, a.sha256,
       a.size_bytes, a.created_at
  FROM documents.artifacts a
  JOIN documents.renders r ON r.id = a.render_id
 WHERE a.id = $1 AND r.program_id = $2
"""


# =============================================================================
# Template version with parent template (for rendering)
# =============================================================================

SELECT_TEMPLATE_VERSION_WITH_TEMPLATE = """
SELECT tv.id AS version_id, tv.template_id, tv.version, tv.storage_key, tv.sha256,
       t.program_id, t.name AS template_name, t.doc_type
  FROM documents.template_versions tv
  JOIN documents.templates t ON t.id = tv.template_id
 WHERE tv.id = $1
"""
