-- 071_gcc_rls_lumen_and_org_enforcement.sql
-- Add org_id defaulting/enforcement for programs and extend RLS to lumen + vault additions.

BEGIN;

-- =============================================================================
-- A) Program org_id defaulting and conditional NOT NULL enforcement
-- =============================================================================

CREATE OR REPLACE FUNCTION core.tg_program_set_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_identity BOOLEAN := FALSE;
  v_current_org UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'current_org_id' AND n.nspname = 'identity'
  ) INTO v_has_identity;

  IF NEW.org_id IS NULL AND v_has_identity THEN
    BEGIN
      v_current_org := identity.current_org_id();
      IF v_current_org IS NOT NULL THEN
        NEW.org_id := v_current_org;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- do nothing if identity not available
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_program_set_org_id ON core.programs;
CREATE TRIGGER trg_program_set_org_id
  BEFORE INSERT OR UPDATE ON core.programs
  FOR EACH ROW
  EXECUTE FUNCTION core.tg_program_set_org_id();

-- Enforce NOT NULL org_id only if all programs already have org_id set
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'programs' AND column_name = 'org_id'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM core.programs WHERE org_id IS NULL) THEN
      BEGIN
        ALTER TABLE core.programs ALTER COLUMN org_id SET NOT NULL;
      EXCEPTION WHEN others THEN
        -- ignore if constraint cannot be set due to permissions
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- B) RLS for vault additions (extracted_entities, drafting_sessions)
-- =============================================================================

ALTER TABLE vault.extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.drafting_sessions ENABLE ROW LEVEL SECURITY;

-- Extracted entities (via chunk -> document)
DROP POLICY IF EXISTS rls_vault_entities_select ON vault.extracted_entities;
CREATE POLICY rls_vault_entities_select
  ON vault.extracted_entities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM vault.document_chunks c
      JOIN vault.documents d ON d.id = c.document_id
      WHERE c.id = chunk_id
        AND core.can_access_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_entities_insert ON vault.extracted_entities;
CREATE POLICY rls_vault_entities_insert
  ON vault.extracted_entities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM vault.document_chunks c
      JOIN vault.documents d ON d.id = c.document_id
      WHERE c.id = chunk_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_entities_update ON vault.extracted_entities;
CREATE POLICY rls_vault_entities_update
  ON vault.extracted_entities
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM vault.document_chunks c
      JOIN vault.documents d ON d.id = c.document_id
      WHERE c.id = chunk_id
        AND core.can_write_program(d.program_id)
    )
  );

DROP POLICY IF EXISTS rls_vault_entities_delete ON vault.extracted_entities;
CREATE POLICY rls_vault_entities_delete
  ON vault.extracted_entities
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM vault.document_chunks c
      JOIN vault.documents d ON d.id = c.document_id
      WHERE c.id = chunk_id
        AND core.can_write_program(d.program_id)
    )
  );

-- Drafting sessions (program_id)
DROP POLICY IF EXISTS rls_vault_drafting_select ON vault.drafting_sessions;
CREATE POLICY rls_vault_drafting_select
  ON vault.drafting_sessions
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_vault_drafting_insert ON vault.drafting_sessions;
CREATE POLICY rls_vault_drafting_insert
  ON vault.drafting_sessions
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_drafting_update ON vault.drafting_sessions;
CREATE POLICY rls_vault_drafting_update
  ON vault.drafting_sessions
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_vault_drafting_delete ON vault.drafting_sessions;
CREATE POLICY rls_vault_drafting_delete
  ON vault.drafting_sessions
  FOR DELETE
  USING (core.can_write_program(program_id));

-- =============================================================================
-- C) RLS for lumen schema (traceability + council)
-- =============================================================================

ALTER TABLE lumen.traceability_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE lumen.council_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lumen.agent_executions ENABLE ROW LEVEL SECURITY;

-- Traceability matrix (program_id)
DROP POLICY IF EXISTS rls_lumen_traceability_select ON lumen.traceability_matrix;
CREATE POLICY rls_lumen_traceability_select
  ON lumen.traceability_matrix
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_lumen_traceability_insert ON lumen.traceability_matrix;
CREATE POLICY rls_lumen_traceability_insert
  ON lumen.traceability_matrix
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_lumen_traceability_update ON lumen.traceability_matrix;
CREATE POLICY rls_lumen_traceability_update
  ON lumen.traceability_matrix
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_lumen_traceability_delete ON lumen.traceability_matrix;
CREATE POLICY rls_lumen_traceability_delete
  ON lumen.traceability_matrix
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Council sessions (program_id)
DROP POLICY IF EXISTS rls_lumen_sessions_select ON lumen.council_sessions;
CREATE POLICY rls_lumen_sessions_select
  ON lumen.council_sessions
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_lumen_sessions_insert ON lumen.council_sessions;
CREATE POLICY rls_lumen_sessions_insert
  ON lumen.council_sessions
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_lumen_sessions_update ON lumen.council_sessions;
CREATE POLICY rls_lumen_sessions_update
  ON lumen.council_sessions
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_lumen_sessions_delete ON lumen.council_sessions;
CREATE POLICY rls_lumen_sessions_delete
  ON lumen.council_sessions
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Agent executions (via session)
DROP POLICY IF EXISTS rls_lumen_executions_select ON lumen.agent_executions;
CREATE POLICY rls_lumen_executions_select
  ON lumen.agent_executions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lumen.council_sessions s
      WHERE s.id = session_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_lumen_executions_insert ON lumen.agent_executions;
CREATE POLICY rls_lumen_executions_insert
  ON lumen.agent_executions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lumen.council_sessions s
      WHERE s.id = session_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_lumen_executions_update ON lumen.agent_executions;
CREATE POLICY rls_lumen_executions_update
  ON lumen.agent_executions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lumen.council_sessions s
      WHERE s.id = session_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_lumen_executions_delete ON lumen.agent_executions;
CREATE POLICY rls_lumen_executions_delete
  ON lumen.agent_executions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM lumen.council_sessions s
      WHERE s.id = session_id
        AND core.can_write_program(s.program_id)
    )
  );

COMMIT;
