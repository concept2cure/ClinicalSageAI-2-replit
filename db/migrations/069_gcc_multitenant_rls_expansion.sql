-- 069_gcc_multitenant_rls_expansion.sql
-- Program/org ownership + expanded RLS coverage for GA.
-- Aligns org relationship fields and enables program-scoped RLS for regulatory schema.

BEGIN;

-- =============================================================================
-- A) Program ownership (org_id + ownership table)
-- =============================================================================

ALTER TABLE core.programs
  ADD COLUMN IF NOT EXISTS org_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'identity' AND table_name = 'organizations'
  ) THEN
    BEGIN
      ALTER TABLE core.programs
        ADD CONSTRAINT programs_org_fk
        FOREIGN KEY (org_id) REFERENCES identity.organizations(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS programs_org_idx ON core.programs(org_id);

-- Ownership mapping table (supports delegated ownership history)
CREATE TABLE IF NOT EXISTS core.program_ownerships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
  ownership_role TEXT NOT NULL DEFAULT 'OWNER', -- OWNER | DELEGATE
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE (program_id, org_id, ownership_role)
);

CREATE INDEX IF NOT EXISTS program_ownerships_program_idx
  ON core.program_ownerships(program_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS program_ownerships_org_idx
  ON core.program_ownerships(org_id) WHERE is_active = TRUE;

-- Backfill org_id if exactly one org exists
UPDATE core.programs p
SET org_id = (
  SELECT id FROM identity.organizations ORDER BY created_at LIMIT 1
)
WHERE p.org_id IS NULL
  AND (SELECT COUNT(*) FROM identity.organizations) = 1;

-- Backfill ownerships from core.programs.org_id
INSERT INTO core.program_ownerships (program_id, org_id, ownership_role, is_active, created_by)
SELECT p.id, p.org_id, 'OWNER', TRUE, 'migration-069'
FROM core.programs p
WHERE p.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================================================
-- B) Helper functions for program/org resolution
-- =============================================================================

CREATE OR REPLACE FUNCTION core.get_program_org_id(p_program_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    (SELECT org_id FROM core.programs WHERE id = p_program_id),
    (SELECT org_id FROM core.program_ownerships WHERE program_id = p_program_id AND is_active = TRUE AND ownership_role = 'OWNER' LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION core.get_program_org_id(UUID) FROM PUBLIC;

-- =============================================================================
-- C) Fix identity org access helpers (delegate_org_id + contract dates)
-- =============================================================================

CREATE OR REPLACE FUNCTION identity.can_access_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity
AS $$
DECLARE
  v_current_org_id UUID := identity.current_org_id();
BEGIN
  IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
    RETURN TRUE;
  END IF;

  IF v_current_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_current_org_id = target_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM identity.org_relationships r
    WHERE r.sponsor_org_id = target_org_id
      AND r.delegate_org_id = v_current_org_id
      AND r.contract_start_date <= CURRENT_DATE
      AND (r.contract_end_date IS NULL OR r.contract_end_date >= CURRENT_DATE)
      AND r.can_view_submissions = TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION identity.can_write_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity
AS $$
DECLARE
  v_current_org_id UUID := identity.current_org_id();
BEGIN
  IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
    RETURN TRUE;
  END IF;

  IF v_current_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_current_org_id = target_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM identity.org_relationships r
    WHERE r.sponsor_org_id = target_org_id
      AND r.delegate_org_id = v_current_org_id
      AND r.contract_start_date <= CURRENT_DATE
      AND (r.contract_end_date IS NULL OR r.contract_end_date >= CURRENT_DATE)
      AND r.can_edit_submissions = TRUE
  );
END;
$$;

-- =============================================================================
-- D) Program-level access helpers (org aware)
-- =============================================================================

CREATE OR REPLACE FUNCTION identity.can_access_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity, core, public
AS $$
DECLARE
  v_current_org_id UUID := identity.current_org_id();
  v_program_org_id UUID;
  v_has_auth BOOLEAN := FALSE;
BEGIN
  IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
    RETURN TRUE;
  END IF;

  IF p_program_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT core.get_program_org_id(p_program_id) INTO v_program_org_id;

  -- If program org not resolved, fall back to auth.can_access_program when available
  IF v_program_org_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'can_access_program' AND n.nspname = 'auth'
    ) INTO v_has_auth;

    IF v_has_auth THEN
      RETURN auth.can_access_program(p_program_id);
    END IF;
  END IF;

  IF v_current_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_current_org_id = v_program_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM identity.org_relationships r
    WHERE r.sponsor_org_id = v_program_org_id
      AND r.delegate_org_id = v_current_org_id
      AND r.contract_start_date <= CURRENT_DATE
      AND (r.contract_end_date IS NULL OR r.contract_end_date >= CURRENT_DATE)
      AND r.can_view_submissions = TRUE
      AND (r.scope_all_programs = TRUE OR p_program_id = ANY(r.scoped_program_ids))
  );
END;
$$;

CREATE OR REPLACE FUNCTION identity.can_write_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity, core, public
AS $$
DECLARE
  v_current_org_id UUID := identity.current_org_id();
  v_program_org_id UUID;
  v_has_auth BOOLEAN := FALSE;
BEGIN
  IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
    RETURN TRUE;
  END IF;

  IF p_program_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT core.get_program_org_id(p_program_id) INTO v_program_org_id;

  IF v_program_org_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'can_write_program' AND n.nspname = 'auth'
    ) INTO v_has_auth;

    IF v_has_auth THEN
      RETURN auth.can_write_program(p_program_id);
    END IF;
  END IF;

  IF v_current_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_current_org_id = v_program_org_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM identity.org_relationships r
    WHERE r.sponsor_org_id = v_program_org_id
      AND r.delegate_org_id = v_current_org_id
      AND r.contract_start_date <= CURRENT_DATE
      AND (r.contract_end_date IS NULL OR r.contract_end_date >= CURRENT_DATE)
      AND r.can_edit_submissions = TRUE
      AND (r.scope_all_programs = TRUE OR p_program_id = ANY(r.scoped_program_ids))
  );
END;
$$;

-- =============================================================================
-- E) Upgrade core access helpers to delegate to identity/auth
-- =============================================================================

CREATE OR REPLACE FUNCTION core.can_access_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, identity, auth, public
AS $$
DECLARE
  v_has_identity BOOLEAN := FALSE;
  v_has_auth BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'can_access_program' AND n.nspname = 'identity'
  ) INTO v_has_identity;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'can_access_program' AND n.nspname = 'auth'
  ) INTO v_has_auth;

  IF v_has_identity THEN
    RETURN identity.can_access_program(p_program_id);
  ELSIF v_has_auth THEN
    RETURN auth.can_access_program(p_program_id);
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION core.can_write_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, identity, auth, public
AS $$
DECLARE
  v_has_identity BOOLEAN := FALSE;
  v_has_auth BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'can_write_program' AND n.nspname = 'identity'
  ) INTO v_has_identity;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'can_write_program' AND n.nspname = 'auth'
  ) INTO v_has_auth;

  IF v_has_identity THEN
    RETURN identity.can_write_program(p_program_id);
  ELSIF v_has_auth THEN
    RETURN auth.can_write_program(p_program_id);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION core.can_access_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.can_write_program(UUID) FROM PUBLIC;

-- =============================================================================
-- F) Expanded RLS: Regulatory schema
-- =============================================================================

ALTER TABLE regulatory.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory.correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory.information_requests ENABLE ROW LEVEL SECURITY;

-- Submissions
DROP POLICY IF EXISTS rls_regulatory_submissions_select ON regulatory.submissions;
CREATE POLICY rls_regulatory_submissions_select
  ON regulatory.submissions
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_insert ON regulatory.submissions;
CREATE POLICY rls_regulatory_submissions_insert
  ON regulatory.submissions
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_update ON regulatory.submissions;
CREATE POLICY rls_regulatory_submissions_update
  ON regulatory.submissions
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_delete ON regulatory.submissions;
CREATE POLICY rls_regulatory_submissions_delete
  ON regulatory.submissions
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Milestones (via submission)
DROP POLICY IF EXISTS rls_regulatory_milestones_select ON regulatory.milestones;
CREATE POLICY rls_regulatory_milestones_select
  ON regulatory.milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_milestones_insert ON regulatory.milestones;
CREATE POLICY rls_regulatory_milestones_insert
  ON regulatory.milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_milestones_update ON regulatory.milestones;
CREATE POLICY rls_regulatory_milestones_update
  ON regulatory.milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_milestones_delete ON regulatory.milestones;
CREATE POLICY rls_regulatory_milestones_delete
  ON regulatory.milestones
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

-- Correspondence (via submission)
DROP POLICY IF EXISTS rls_regulatory_correspondence_select ON regulatory.correspondence;
CREATE POLICY rls_regulatory_correspondence_select
  ON regulatory.correspondence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_correspondence_insert ON regulatory.correspondence;
CREATE POLICY rls_regulatory_correspondence_insert
  ON regulatory.correspondence
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_correspondence_update ON regulatory.correspondence;
CREATE POLICY rls_regulatory_correspondence_update
  ON regulatory.correspondence
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_correspondence_delete ON regulatory.correspondence;
CREATE POLICY rls_regulatory_correspondence_delete
  ON regulatory.correspondence
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

-- Meetings (program_id)
DROP POLICY IF EXISTS rls_regulatory_meetings_select ON regulatory.meetings;
CREATE POLICY rls_regulatory_meetings_select
  ON regulatory.meetings
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_meetings_insert ON regulatory.meetings;
CREATE POLICY rls_regulatory_meetings_insert
  ON regulatory.meetings
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_meetings_update ON regulatory.meetings;
CREATE POLICY rls_regulatory_meetings_update
  ON regulatory.meetings
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_meetings_delete ON regulatory.meetings;
CREATE POLICY rls_regulatory_meetings_delete
  ON regulatory.meetings
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Timeline events (program_id)
DROP POLICY IF EXISTS rls_regulatory_timeline_select ON regulatory.timeline_events;
CREATE POLICY rls_regulatory_timeline_select
  ON regulatory.timeline_events
  FOR SELECT
  USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_timeline_insert ON regulatory.timeline_events;
CREATE POLICY rls_regulatory_timeline_insert
  ON regulatory.timeline_events
  FOR INSERT
  WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_timeline_update ON regulatory.timeline_events;
CREATE POLICY rls_regulatory_timeline_update
  ON regulatory.timeline_events
  FOR UPDATE
  USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_regulatory_timeline_delete ON regulatory.timeline_events;
CREATE POLICY rls_regulatory_timeline_delete
  ON regulatory.timeline_events
  FOR DELETE
  USING (core.can_write_program(program_id));

-- Information requests (via submission)
DROP POLICY IF EXISTS rls_regulatory_ir_select ON regulatory.information_requests;
CREATE POLICY rls_regulatory_ir_select
  ON regulatory.information_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_access_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_ir_insert ON regulatory.information_requests;
CREATE POLICY rls_regulatory_ir_insert
  ON regulatory.information_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_ir_update ON regulatory.information_requests;
CREATE POLICY rls_regulatory_ir_update
  ON regulatory.information_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

DROP POLICY IF EXISTS rls_regulatory_ir_delete ON regulatory.information_requests;
CREATE POLICY rls_regulatory_ir_delete
  ON regulatory.information_requests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM regulatory.submissions s
      WHERE s.id = submission_id
        AND core.can_write_program(s.program_id)
    )
  );

COMMIT;
