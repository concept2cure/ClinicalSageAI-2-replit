-- 044c_gcc_vault_schema.sql
-- Prerequisites for Phase 2+ migrations: vault schema + documents table
-- This migration ensures vault infrastructure exists before anchors/xrefs/events
--
-- NOTE: Uses 044c prefix to run after 044b_gcc_lumen_schema_prerequisite.sql
--       but before Phase 2 date-prefixed migrations (20260203_*)

BEGIN;

-- ============================================================================
-- VAULT SCHEMA
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS vault;

-- ============================================================================
-- core.can_write_program (if not exists from 000_bootstrap or 069_rls)
-- ============================================================================
-- This function may already exist from 069_gcc_multitenant_rls_expansion.sql
-- We create it here as a fallback to ensure Phase 2 migrations succeed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'core' AND p.proname = 'can_write_program'
    ) THEN
        -- Create permissive stub (real implementation in 069_)
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION core.can_write_program(p_program_id UUID)
            RETURNS BOOLEAN
            LANGUAGE plpgsql
            STABLE
            SECURITY DEFINER
            AS $body$
            BEGIN
                -- Permissive stub: allows all writes
                -- Production systems should implement proper authorization
                RETURN TRUE;
            END;
            $body$;
        $fn$;
        RAISE NOTICE 'Created core.can_write_program stub';
    END IF;
END $$;

-- ============================================================================
-- VAULT.DOCUMENTS TABLE
-- ============================================================================
-- Central document registry for the Shadow FDA Reviewer system.
-- All document-related tables (anchors, xrefs, events) reference this table.

CREATE TABLE IF NOT EXISTS vault.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Program isolation (for RLS)
    program_id UUID NOT NULL,

    -- Document identity
    filename TEXT NOT NULL,
    content_hash CHAR(64) NOT NULL,  -- SHA-256 of file contents
    file_size BIGINT,
    mime_type TEXT,

    -- Document metadata
    title TEXT,
    source_type VARCHAR(20) DEFAULT 'docx',  -- 'docx', 'pdf', 'xml'

    -- Processing state
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT documents_source_type_check CHECK (
        source_type IN ('docx', 'pdf', 'xml', 'txt', 'html')
    ),
    CONSTRAINT documents_status_check CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'archived')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vault_documents_program_id
    ON vault.documents(program_id);
CREATE INDEX IF NOT EXISTS idx_vault_documents_content_hash
    ON vault.documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_vault_documents_status
    ON vault.documents(status);

-- Unique constraint: same file in same program only once
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_documents_program_hash_unique
    ON vault.documents(program_id, content_hash);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE vault.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS vault_documents_select_policy ON vault.documents;
DROP POLICY IF EXISTS vault_documents_insert_policy ON vault.documents;
DROP POLICY IF EXISTS vault_documents_update_policy ON vault.documents;
DROP POLICY IF EXISTS vault_documents_delete_policy ON vault.documents;

-- SELECT: can read documents in accessible programs
CREATE POLICY vault_documents_select_policy ON vault.documents
    FOR SELECT
    USING (core.can_access_program(program_id));

-- INSERT: can create documents in writable programs
CREATE POLICY vault_documents_insert_policy ON vault.documents
    FOR INSERT
    WITH CHECK (core.can_write_program(program_id));

-- UPDATE: can update documents in writable programs
CREATE POLICY vault_documents_update_policy ON vault.documents
    FOR UPDATE
    USING (core.can_write_program(program_id))
    WITH CHECK (core.can_write_program(program_id));

-- DELETE: can delete documents in writable programs
CREATE POLICY vault_documents_delete_policy ON vault.documents
    FOR DELETE
    USING (core.can_write_program(program_id));

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON SCHEMA vault IS
    'Shadow FDA Reviewer document storage and evidence management';

COMMENT ON TABLE vault.documents IS
    'Central document registry - all anchors, xrefs, and events reference this table';

COMMENT ON COLUMN vault.documents.content_hash IS
    'SHA-256 hash of file bytes for content-addressed deduplication';

COMMENT ON COLUMN vault.documents.program_id IS
    'Program/tenant isolation key - denormalized for RLS efficiency';

COMMIT;
