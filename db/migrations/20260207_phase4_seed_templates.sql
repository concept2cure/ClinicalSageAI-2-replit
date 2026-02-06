-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Seed standard workflow templates (IND intake, DOCX generation)
--          for orchestration kernel bootstrap.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (admin/IND), Module 5 (clinical study reports)
--   - Integrity Risk Addressed: Missing default templates would leave
--     orchestration inoperable post-deploy.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Idempotent via ON CONFLICT DO NOTHING on (code, version) constraint.
--   - RLS policies on orchestration schema enforce program_id isolation.
-- =============================================================================

-- ============================================================================
-- Seed: Workflow Templates for Phase 4 Orchestration Kernel
-- Migration: 20260206_phase4_seed_templates.sql
--
-- Seeds 2 workflow templates:
--   1) ind_intake — IND Intake pipeline (4 steps, linear DAG)
--   2) docx_gen   — DOCX Artifact Generation (2 steps, stubbed)
--
-- Idempotent: uses ON CONFLICT DO NOTHING on (code, version) unique constraint.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Template 1: IND Intake Pipeline
-- ============================================================================

INSERT INTO orchestration.workflow_templates
    (id, code, name, description, version, category, is_active)
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    'ind_intake',
    'IND Intake Pipeline',
    'Ingest protocol → extract claims → AI review → generate draft outline. '
    'Standard IND submission preparation workflow.',
    1,
    'ind',
    TRUE
)
ON CONFLICT (code, version) DO NOTHING;

-- Steps (ordered by ordinal)
-- Step 1: Ingest Protocol
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'ingest_protocol',
    'Ingest Protocol Document',
    'task',
    1,
    300,
    '{"max_attempts": 3, "backoff_seconds": 30}'::jsonb,
    '{"description": "Upload and parse the protocol document (PDF/DOCX). Extracts text, metadata, and structure."}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Step 2: Extract Claims
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'extract_claims',
    'Extract Clinical Claims',
    'ai_review',
    2,
    600,
    '{"max_attempts": 2, "backoff_seconds": 60}'::jsonb,
    '{"description": "AI-powered extraction of clinical claims, endpoints, and study design from the ingested protocol."}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Step 3: AI Review (batch_job → A8 bridge)
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    'ai_review_batch',
    'AI Batch Review',
    'batch_job',
    3,
    1800,
    '{"max_attempts": 2, "backoff_seconds": 120}'::jsonb,
    '{"description": "Delegates to A8 batch worker via vault.review_batches. Reviews extracted claims against truth store.", "bridge": "a8"}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Step 4: Generate Draft Outline
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    'generate_outline',
    'Generate Draft Outline',
    'document_gen',
    4,
    600,
    '{"max_attempts": 2, "backoff_seconds": 60}'::jsonb,
    '{"description": "Generates eCTD section outline from reviewed claims. Output is a structured JSON document map."}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Dependencies (linear: 1→2→3→4)
INSERT INTO orchestration.step_dependencies
    (workflow_template_id, step_id, depends_on_step_id, dependency_type)
VALUES
    -- extract_claims depends on ingest_protocol
    ('a0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000002',
     'b0000000-0000-4000-8000-000000000001',
     'finish_to_start'),
    -- ai_review_batch depends on extract_claims
    ('a0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000003',
     'b0000000-0000-4000-8000-000000000002',
     'finish_to_start'),
    -- generate_outline depends on ai_review_batch
    ('a0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000004',
     'b0000000-0000-4000-8000-000000000003',
     'finish_to_start')
ON CONFLICT DO NOTHING;


-- ============================================================================
-- Template 2: DOCX Artifact Generation (stubbed)
-- ============================================================================

INSERT INTO orchestration.workflow_templates
    (id, code, name, description, version, category, is_active)
VALUES (
    'a0000000-0000-4000-8000-000000000002',
    'docx_gen',
    'DOCX Artifact Generation',
    'Generate regulatory document artifacts (PDF, DOCX) from completed review data. '
    'Stubbed template — steps to be expanded in Phase 5.',
    1,
    'document',
    TRUE
)
ON CONFLICT (code, version) DO NOTHING;

-- Step 1: Gather Inputs
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000002',
    'gather_inputs',
    'Gather Document Inputs',
    'task',
    1,
    120,
    '{"max_attempts": 2, "backoff_seconds": 15}'::jsonb,
    '{"description": "Collect all required input fragments, claims, and metadata for document generation."}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Step 2: Render Document
INSERT INTO orchestration.step_templates
    (id, workflow_template_id, code, name, step_type, ordinal, timeout_seconds, retry_policy, config)
VALUES (
    'b0000000-0000-4000-8000-000000000011',
    'a0000000-0000-4000-8000-000000000002',
    'render_document',
    'Render DOCX/PDF',
    'document_gen',
    2,
    600,
    '{"max_attempts": 3, "backoff_seconds": 30}'::jsonb,
    '{"description": "Render the final document using templates. Outputs DOCX and/or PDF artifacts."}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Dependency: render depends on gather
INSERT INTO orchestration.step_dependencies
    (workflow_template_id, step_id, depends_on_step_id, dependency_type)
VALUES (
    'a0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000011',
    'b0000000-0000-4000-8000-000000000010',
    'finish_to_start'
)
ON CONFLICT DO NOTHING;


COMMIT;
