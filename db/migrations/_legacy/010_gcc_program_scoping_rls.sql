-- Migration 010: Program/Asset Scoping + Row Level Security
-- Purpose: Multi-program separation with database-enforced access control
-- 
-- This migration:
--   1. Creates core.programs table (assets/products/sponsor workspaces)
--   2. Creates auth.user_program_memberships for access control
--   3. Adds program_id to all major tables (truth, prose, audit, etc.)
--   4. Enables Row Level Security (RLS) policies
--   5. Creates helper functions for session-based access checking
--
-- IMPORTANT: App connections should NOT run as schema owner (owners bypass RLS)
-- Use dedicated app roles: c2c_app_reader, c2c_app_writer, c2c_shadow_agent

BEGIN;

-- Schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS auth;

-- =============================================================================
-- A) Programs (assets / products / sponsor workspaces)
-- =============================================================================

CREATE TABLE IF NOT EXISTS core.programs (
  id UUID PRIMARY KEY,
  program_code TEXT NOT NULL UNIQUE,     -- e.g., "PROG-ABC-001" or "GLOBAL"
  program_name TEXT,
  sponsor_name TEXT,
  substance_id TEXT,                     -- UNII / ISO 11238 if applicable
  therapeutic_area TEXT,                 -- Oncology, CNS, Immunology, etc.
  indication TEXT,                       -- Specific indication
  phase TEXT,                            -- Phase 1, 2, 3, BLA, NDA, etc.
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED | SUSPENDED
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE core.programs IS 
  'Canonical program/asset registry - foundation for multi-tenant access control';

COMMENT ON COLUMN core.programs.program_code IS 
  'Unique identifier like PROG-ABC-001 or GLOBAL (system-wide shared)';

COMMENT ON COLUMN core.programs.substance_id IS 
  'UNII or ISO 11238 substance identifier if applicable';

CREATE INDEX IF NOT EXISTS programs_code_idx ON core.programs (program_code);
CREATE INDEX IF NOT EXISTS programs_status_idx ON core.programs (status);
CREATE INDEX IF NOT EXISTS programs_sponsor_idx ON core.programs (sponsor_name);

-- Stable GLOBAL program UUID (deterministic via uuid_generate_v5)
-- This ensures GLOBAL always has the same UUID across environments
CREATE OR REPLACE FUNCTION auth.global_program_id()
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT uuid_generate_v5(uuid_ns_url(), 'concept2cure:program:GLOBAL');
$$;

COMMENT ON FUNCTION auth.global_program_id IS 
  'Returns deterministic UUID for GLOBAL program - consistent across environments';

-- Ensure GLOBAL program exists (idempotent)
INSERT INTO core.programs (id, program_code, program_name, sponsor_name, substance_id, status, created_by)
VALUES (
  auth.global_program_id(), 
  'GLOBAL', 
  'Global Shared Resources', 
  'Concept2Cure', 
  NULL, 
  'ACTIVE', 
  'migration-010'
)
ON CONFLICT (program_code) DO NOTHING;

-- =============================================================================
-- B) User Program Memberships (who can access which program)
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.user_program_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_identity TEXT NOT NULL,           -- email / SSO subject / service principal
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  membership_role TEXT NOT NULL,         -- QA | RA | CLINICAL | STATS | SAFETY | CMC | ADMIN | SHADOW
  access_level TEXT NOT NULL DEFAULT 'READ_WRITE', -- READ_ONLY | READ_WRITE | ADMIN
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT NOT NULL DEFAULT 'unknown',
  expires_at TIMESTAMPTZ,                -- Optional expiration
  notes TEXT,
  UNIQUE (user_identity, program_id, membership_role)
);

COMMENT ON TABLE auth.user_program_memberships IS 
  'Maps users to programs with specific roles - foundation for RLS policies';

COMMENT ON COLUMN auth.user_program_memberships.membership_role IS 
  'Regulatory role: QA, RA, CLINICAL, STATS, SAFETY, CMC, ADMIN, SHADOW (agent)';

COMMENT ON COLUMN auth.user_program_memberships.access_level IS 
  'READ_ONLY for reviewers, READ_WRITE for authors, ADMIN for program managers';

CREATE INDEX IF NOT EXISTS user_program_memberships_user_idx
  ON auth.user_program_memberships (user_identity);

CREATE INDEX IF NOT EXISTS user_program_memberships_program_idx
  ON auth.user_program_memberships (program_id);

CREATE INDEX IF NOT EXISTS user_program_memberships_active_idx
  ON auth.user_program_memberships (user_identity, program_id) 
  WHERE is_active = TRUE;

-- =============================================================================
-- C) Session Helper Functions
-- =============================================================================
-- App sets: SET LOCAL app.user = '...'; SET LOCAL app.program_id = '...';

-- Get current actor (user identity from session)
CREATE OR REPLACE FUNCTION auth.current_actor()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user', true), ''), 'unknown');
$$;

COMMENT ON FUNCTION auth.current_actor IS 
  'Returns current user identity from session (app.user setting)';

-- Get current program ID (from session, defaults to GLOBAL)
CREATE OR REPLACE FUNCTION auth.current_program_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  v := current_setting('app.program_id', true);
  IF v IS NULL OR v = '' THEN
    RETURN auth.global_program_id();
  END IF;
  RETURN v::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN auth.global_program_id();
END;
$$;

COMMENT ON FUNCTION auth.current_program_id IS 
  'Returns current program ID from session (app.program_id), defaults to GLOBAL';

-- Check if current actor can access a program
-- SECURITY DEFINER allows it to read memberships even if app role cannot directly
CREATE OR REPLACE FUNCTION auth.can_access_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = auth, core, public
AS $$
  SELECT
    -- GLOBAL is always accessible
    (p_program_id = auth.global_program_id())
    OR
    -- Or user has active membership
    EXISTS (
      SELECT 1
      FROM auth.user_program_memberships m
      WHERE m.program_id = p_program_id
        AND m.is_active = TRUE
        AND m.user_identity = auth.current_actor()
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
    );
$$;

COMMENT ON FUNCTION auth.can_access_program IS 
  'RLS policy helper: checks if current actor has membership in program';

-- Check if current actor can write to a program
CREATE OR REPLACE FUNCTION auth.can_write_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = auth, core, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM auth.user_program_memberships m
      WHERE m.program_id = p_program_id
        AND m.is_active = TRUE
        AND m.user_identity = auth.current_actor()
        AND m.access_level IN ('READ_WRITE', 'ADMIN')
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
    );
$$;

COMMENT ON FUNCTION auth.can_write_program IS 
  'RLS policy helper: checks if current actor has write access to program';

-- Restrict function access (security)
REVOKE ALL ON FUNCTION auth.can_access_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.can_write_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.current_program_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.current_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth.global_program_id() FROM PUBLIC;

-- =============================================================================
-- D) Add program_id columns to all major tables
-- =============================================================================

-- D.1) truth.clinical_truth_store
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    ALTER TABLE truth.clinical_truth_store ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE truth.clinical_truth_store SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE truth.clinical_truth_store ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE truth.clinical_truth_store ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clinical_truth_store_program_fk') THEN
      ALTER TABLE truth.clinical_truth_store
        ADD CONSTRAINT clinical_truth_store_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS clinical_truth_store_program_idx ON truth.clinical_truth_store (program_id);
  END IF;
END $$;

-- D.2) prose.smart_fragments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    ALTER TABLE prose.smart_fragments ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE prose.smart_fragments SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE prose.smart_fragments ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE prose.smart_fragments ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smart_fragments_program_fk') THEN
      ALTER TABLE prose.smart_fragments
        ADD CONSTRAINT smart_fragments_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS smart_fragments_program_idx ON prose.smart_fragments (program_id);
  END IF;
END $$;

-- D.3) prose.smart_fragment_versions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    ALTER TABLE prose.smart_fragment_versions ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE prose.smart_fragment_versions SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE prose.smart_fragment_versions ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE prose.smart_fragment_versions ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smart_fragment_versions_program_fk') THEN
      ALTER TABLE prose.smart_fragment_versions
        ADD CONSTRAINT smart_fragment_versions_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS smart_fragment_versions_program_idx ON prose.smart_fragment_versions (program_id);
  END IF;
END $$;

-- Trigger: Auto-populate versions.program_id from parent fragment
CREATE OR REPLACE FUNCTION prose.tg_versions_set_program_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  frag_program UUID;
BEGIN
  SELECT program_id INTO frag_program
  FROM prose.smart_fragments
  WHERE id = NEW.fragment_id;

  IF frag_program IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve program_id for fragment_id %', NEW.fragment_id;
  END IF;

  NEW.program_id := frag_program;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_versions_set_program_id ON prose.smart_fragment_versions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    CREATE TRIGGER trg_versions_set_program_id
      BEFORE INSERT ON prose.smart_fragment_versions
      FOR EACH ROW
      EXECUTE FUNCTION prose.tg_versions_set_program_id();
  END IF;
END $$;

-- D.4) prose.fragment_truth_links
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    ALTER TABLE prose.fragment_truth_links ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE prose.fragment_truth_links SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE prose.fragment_truth_links ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE prose.fragment_truth_links ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fragment_truth_links_program_fk') THEN
      ALTER TABLE prose.fragment_truth_links
        ADD CONSTRAINT fragment_truth_links_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS fragment_truth_links_program_idx ON prose.fragment_truth_links (program_id);
  END IF;
END $$;

-- Trigger: Validate program consistency between fragment and truth
CREATE OR REPLACE FUNCTION prose.tg_links_set_program_id_and_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  frag_program UUID;
  truth_program UUID;
BEGIN
  SELECT program_id INTO frag_program FROM prose.smart_fragments WHERE id = NEW.fragment_id;
  SELECT program_id INTO truth_program FROM truth.clinical_truth_store WHERE id = NEW.truth_id;

  IF frag_program IS NULL OR truth_program IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve program_id for link (fragment %, truth %)', NEW.fragment_id, NEW.truth_id;
  END IF;

  IF frag_program <> truth_program THEN
    RAISE EXCEPTION 'Program mismatch: fragment % (program %), truth % (program %) - cross-program linking not allowed',
      NEW.fragment_id, frag_program, NEW.truth_id, truth_program;
  END IF;

  NEW.program_id := frag_program;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_links_set_program_validate ON prose.fragment_truth_links;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    CREATE TRIGGER trg_links_set_program_validate
      BEFORE INSERT ON prose.fragment_truth_links
      FOR EACH ROW
      EXECUTE FUNCTION prose.tg_links_set_program_id_and_validate();
  END IF;
END $$;

-- D.5) adversarial.regulatory_adversarial_precedents
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    ALTER TABLE adversarial.regulatory_adversarial_precedents ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE adversarial.regulatory_adversarial_precedents SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE adversarial.regulatory_adversarial_precedents ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE adversarial.regulatory_adversarial_precedents ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adversarial_precedents_program_fk') THEN
      ALTER TABLE adversarial.regulatory_adversarial_precedents
        ADD CONSTRAINT adversarial_precedents_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS adversarial_precedents_program_idx ON adversarial.regulatory_adversarial_precedents (program_id);
  END IF;
END $$;

-- D.6) audit.concomitant_audit_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    ALTER TABLE audit.concomitant_audit_logs ADD COLUMN IF NOT EXISTS program_id UUID;
    UPDATE audit.concomitant_audit_logs SET program_id = auth.global_program_id() WHERE program_id IS NULL;
    ALTER TABLE audit.concomitant_audit_logs ALTER COLUMN program_id SET DEFAULT auth.current_program_id();
    ALTER TABLE audit.concomitant_audit_logs ALTER COLUMN program_id SET NOT NULL;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_logs_program_fk') THEN
      ALTER TABLE audit.concomitant_audit_logs
        ADD CONSTRAINT audit_logs_program_fk
        FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS audit_logs_program_idx ON audit.concomitant_audit_logs (program_id);
  END IF;
END $$;

-- Trigger: Auto-populate audit.program_id from fragment
CREATE OR REPLACE FUNCTION audit.tg_audit_logs_set_program_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  frag_program UUID;
BEGIN
  IF NEW.fragment_id IS NOT NULL AND NEW.program_id IS NULL THEN
    SELECT program_id INTO frag_program FROM prose.smart_fragments WHERE id = NEW.fragment_id;
    IF frag_program IS NOT NULL THEN
      NEW.program_id := frag_program;
    END IF;
  END IF;
  
  -- Final fallback to current session program
  IF NEW.program_id IS NULL THEN
    NEW.program_id := auth.current_program_id();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_set_program_id ON audit.concomitant_audit_logs;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    CREATE TRIGGER trg_audit_logs_set_program_id
      BEFORE INSERT ON audit.concomitant_audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION audit.tg_audit_logs_set_program_id();
  END IF;
END $$;

-- D.7) Additional tables from later migrations (snapshots, exports, signatures, run groups)
DO $$
BEGIN
  -- prose.submission_snapshots
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    EXECUTE 'ALTER TABLE prose.submission_snapshots ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE prose.submission_snapshots SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE prose.submission_snapshots ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE prose.submission_snapshots ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='submission_snapshots_program_fk') THEN
      EXECUTE 'ALTER TABLE prose.submission_snapshots ADD CONSTRAINT submission_snapshots_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS submission_snapshots_program_idx ON prose.submission_snapshots (program_id);';
  END IF;

  -- prose.submission_snapshot_fragments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_fragments') THEN
    EXECUTE 'ALTER TABLE prose.submission_snapshot_fragments ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE prose.submission_snapshot_fragments SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE prose.submission_snapshot_fragments ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE prose.submission_snapshot_fragments ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='snapshot_fragments_program_fk') THEN
      EXECUTE 'ALTER TABLE prose.submission_snapshot_fragments ADD CONSTRAINT snapshot_fragments_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS snapshot_fragments_program_idx ON prose.submission_snapshot_fragments (program_id);';
  END IF;

  -- prose.submission_snapshot_exports
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_exports') THEN
    EXECUTE 'ALTER TABLE prose.submission_snapshot_exports ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE prose.submission_snapshot_exports SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE prose.submission_snapshot_exports ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE prose.submission_snapshot_exports ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='snapshot_exports_program_fk') THEN
      EXECUTE 'ALTER TABLE prose.submission_snapshot_exports ADD CONSTRAINT snapshot_exports_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS snapshot_exports_program_idx ON prose.submission_snapshot_exports (program_id);';
  END IF;

  -- audit.e_signatures
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='e_signatures') THEN
    EXECUTE 'ALTER TABLE audit.e_signatures ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE audit.e_signatures SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE audit.e_signatures ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE audit.e_signatures ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='e_signatures_program_fk') THEN
      EXECUTE 'ALTER TABLE audit.e_signatures ADD CONSTRAINT e_signatures_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS e_signatures_program_idx ON audit.e_signatures (program_id);';
  END IF;

  -- audit.shadow_run_groups
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='shadow_run_groups') THEN
    EXECUTE 'ALTER TABLE audit.shadow_run_groups ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE audit.shadow_run_groups SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE audit.shadow_run_groups ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE audit.shadow_run_groups ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shadow_run_groups_program_fk') THEN
      EXECUTE 'ALTER TABLE audit.shadow_run_groups ADD CONSTRAINT shadow_run_groups_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS shadow_run_groups_program_idx ON audit.shadow_run_groups (program_id);';
  END IF;

  -- audit.submission_events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='submission_events') THEN
    EXECUTE 'ALTER TABLE audit.submission_events ADD COLUMN IF NOT EXISTS program_id UUID;';
    EXECUTE 'UPDATE audit.submission_events SET program_id = auth.global_program_id() WHERE program_id IS NULL;';
    EXECUTE 'ALTER TABLE audit.submission_events ALTER COLUMN program_id SET DEFAULT auth.current_program_id();';
    EXECUTE 'ALTER TABLE audit.submission_events ALTER COLUMN program_id SET NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='submission_events_program_fk') THEN
      EXECUTE 'ALTER TABLE audit.submission_events ADD CONSTRAINT submission_events_program_fk FOREIGN KEY (program_id) REFERENCES core.programs(id) ON DELETE RESTRICT;';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS submission_events_program_idx ON audit.submission_events (program_id);';
  END IF;
END $$;

-- =============================================================================
-- E) Enable Row Level Security + Create Policies
-- =============================================================================
-- Note: These policies assume RBAC roles exist from Migration 005/006
-- If roles don't exist yet, these will error - apply RBAC migration first

-- E.1) Truth Store
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    ALTER TABLE truth.clinical_truth_store ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_truth_select ON truth.clinical_truth_store;
    DROP POLICY IF EXISTS p_truth_insert ON truth.clinical_truth_store;
    
    -- Allow select for users with program access
    CREATE POLICY p_truth_select ON truth.clinical_truth_store
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    -- Allow insert for users with write access
    CREATE POLICY p_truth_insert ON truth.clinical_truth_store
      FOR INSERT
      WITH CHECK (auth.can_write_program(program_id));
  END IF;
END $$;

-- E.2) Smart Fragments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    ALTER TABLE prose.smart_fragments ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_fragments_select ON prose.smart_fragments;
    DROP POLICY IF EXISTS p_fragments_insert ON prose.smart_fragments;
    DROP POLICY IF EXISTS p_fragments_update ON prose.smart_fragments;
    
    CREATE POLICY p_fragments_select ON prose.smart_fragments
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    CREATE POLICY p_fragments_insert ON prose.smart_fragments
      FOR INSERT
      WITH CHECK (auth.can_write_program(program_id));
    
    CREATE POLICY p_fragments_update ON prose.smart_fragments
      FOR UPDATE
      USING (auth.can_write_program(program_id))
      WITH CHECK (auth.can_write_program(program_id));
  END IF;
END $$;

-- E.3) Fragment Versions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    ALTER TABLE prose.smart_fragment_versions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_versions_select ON prose.smart_fragment_versions;
    DROP POLICY IF EXISTS p_versions_insert ON prose.smart_fragment_versions;
    
    CREATE POLICY p_versions_select ON prose.smart_fragment_versions
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    CREATE POLICY p_versions_insert ON prose.smart_fragment_versions
      FOR INSERT
      WITH CHECK (auth.can_write_program(program_id));
  END IF;
END $$;

-- E.4) Fragment-Truth Links
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    ALTER TABLE prose.fragment_truth_links ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_links_select ON prose.fragment_truth_links;
    DROP POLICY IF EXISTS p_links_insert ON prose.fragment_truth_links;
    
    CREATE POLICY p_links_select ON prose.fragment_truth_links
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    CREATE POLICY p_links_insert ON prose.fragment_truth_links
      FOR INSERT
      WITH CHECK (auth.can_write_program(program_id));
  END IF;
END $$;

-- E.5) Adversarial Precedents
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    ALTER TABLE adversarial.regulatory_adversarial_precedents ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_precedents_select ON adversarial.regulatory_adversarial_precedents;
    DROP POLICY IF EXISTS p_precedents_insert ON adversarial.regulatory_adversarial_precedents;
    
    CREATE POLICY p_precedents_select ON adversarial.regulatory_adversarial_precedents
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    CREATE POLICY p_precedents_insert ON adversarial.regulatory_adversarial_precedents
      FOR INSERT
      WITH CHECK (auth.can_write_program(program_id));
  END IF;
END $$;

-- E.6) Audit Logs (read-only for most, insert for shadow agent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    ALTER TABLE audit.concomitant_audit_logs ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS p_audit_select ON audit.concomitant_audit_logs;
    DROP POLICY IF EXISTS p_audit_insert ON audit.concomitant_audit_logs;
    
    CREATE POLICY p_audit_select ON audit.concomitant_audit_logs
      FOR SELECT
      USING (auth.can_access_program(program_id));
    
    -- Insert allowed for any authenticated user with program access
    CREATE POLICY p_audit_insert ON audit.concomitant_audit_logs
      FOR INSERT
      WITH CHECK (auth.can_access_program(program_id));
  END IF;
END $$;

-- =============================================================================
-- F) Helpful Views
-- =============================================================================

-- View: Current user's program memberships
CREATE OR REPLACE VIEW auth.v_my_programs AS
SELECT
  m.program_id,
  p.program_code,
  p.program_name,
  p.sponsor_name,
  p.status AS program_status,
  m.membership_role,
  m.access_level,
  m.granted_at,
  m.expires_at
FROM auth.user_program_memberships m
JOIN core.programs p ON p.id = m.program_id
WHERE m.user_identity = auth.current_actor()
  AND m.is_active = TRUE
  AND (m.expires_at IS NULL OR m.expires_at > NOW());

COMMENT ON VIEW auth.v_my_programs IS 
  'Shows programs accessible to the current user';

-- View: Program summary with member counts
CREATE OR REPLACE VIEW core.v_program_summary AS
SELECT
  p.id,
  p.program_code,
  p.program_name,
  p.sponsor_name,
  p.therapeutic_area,
  p.phase,
  p.status,
  p.created_at,
  COUNT(DISTINCT m.user_identity) FILTER (WHERE m.is_active) AS active_members,
  COUNT(DISTINCT m.user_identity) FILTER (WHERE m.membership_role = 'ADMIN' AND m.is_active) AS admin_count
FROM core.programs p
LEFT JOIN auth.user_program_memberships m ON m.program_id = p.id
GROUP BY p.id;

COMMENT ON VIEW core.v_program_summary IS 
  'Program overview with member statistics';

COMMIT;
