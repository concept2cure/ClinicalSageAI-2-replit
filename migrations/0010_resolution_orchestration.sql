-- ============================================================================
-- Migration: Resolution Orchestration Layer (Sprint 4)
-- ============================================================================
-- Creates tables for:
--   1. Resolution Plans — structured resolution planning from triggers
--   2. Resolution Bundles — governed collections of coordinated fixes
--   3. Resolution Bundle Items — individual items within bundles
--   4. Supersession Records — formal lineage for replaced objects
-- ============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE resolution_trigger_type AS ENUM (
    'contradiction', 'assumption_change', 'decision_update',
    'impact_propagation', 'validation_failure', 'stale_dependency', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE resolution_path AS ENUM (
    'harmonize', 'supersede', 'rewrite', 'review_only', 'escalate', 'mixed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE resolution_confidence AS ENUM (
    'strong', 'moderate', 'provisional', 'uncertain'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE resolution_state AS ENUM (
    'unresolved', 'proposed_resolution', 'in_resolution',
    'resolved_pending_review', 'resolved_approved', 'superseded', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bundle_state AS ENUM (
    'draft', 'proposed', 'in_progress', 'pending_review',
    'approved', 'applied', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE supersession_state AS ENUM (
    'proposed', 'confirmed', 'reverted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Resolution Plans
CREATE TABLE IF NOT EXISTS resolution_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  trigger_type resolution_trigger_type NOT NULL,
  trigger_id TEXT NOT NULL,
  trigger_description TEXT NOT NULL,
  state resolution_state NOT NULL DEFAULT 'unresolved',
  affected_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_path resolution_path NOT NULL,
  alternative_paths JSONB DEFAULT '[]'::jsonb,
  confidence resolution_confidence NOT NULL,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  requires_reapproval BOOLEAN NOT NULL DEFAULT false,
  requires_escalation BOOLEAN NOT NULL DEFAULT false,
  rationale TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_id INTEGER,
  resolution_summary TEXT,
  bundle_id UUID,
  created_by_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resolution_plans_org_project_idx
  ON resolution_plans (organization_id, project_id);
CREATE INDEX IF NOT EXISTS resolution_plans_state_idx
  ON resolution_plans (state);
CREATE INDEX IF NOT EXISTS resolution_plans_trigger_idx
  ON resolution_plans (trigger_type, trigger_id);
CREATE INDEX IF NOT EXISTS resolution_plans_bundle_idx
  ON resolution_plans (bundle_id);

-- Resolution Bundles
CREATE TABLE IF NOT EXISTS resolution_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state bundle_state NOT NULL DEFAULT 'draft',
  plan_id UUID,
  resolution_memo TEXT,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  requires_reapproval BOOLEAN NOT NULL DEFAULT false,
  review_thread_id TEXT,
  approved_by_id INTEGER,
  approved_at TIMESTAMPTZ,
  confidence resolution_confidence NOT NULL DEFAULT 'moderate',
  created_by_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS resolution_bundles_org_project_idx
  ON resolution_bundles (organization_id, project_id);
CREATE INDEX IF NOT EXISTS resolution_bundles_state_idx
  ON resolution_bundles (state);
CREATE INDEX IF NOT EXISTS resolution_bundles_plan_idx
  ON resolution_bundles (plan_id);

-- Resolution Bundle Items
CREATE TABLE IF NOT EXISTS resolution_bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES resolution_bundles(id) ON DELETE CASCADE,
  object_type VARCHAR(100) NOT NULL,
  object_id TEXT NOT NULL,
  object_title TEXT,
  action_type VARCHAR(50) NOT NULL,
  action_description TEXT NOT NULL,
  prepared_content TEXT,
  prepared_content_confidence resolution_confidence,
  section_code TEXT,
  impact_rationale TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completed_by_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resolution_bundle_items_bundle_idx
  ON resolution_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS resolution_bundle_items_object_idx
  ON resolution_bundle_items (object_type, object_id);

-- Supersession Records
CREATE TABLE IF NOT EXISTS supersession_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  superseded_object_type VARCHAR(100) NOT NULL,
  superseded_object_id TEXT NOT NULL,
  superseded_object_title TEXT,
  successor_object_type VARCHAR(100) NOT NULL,
  successor_object_id TEXT NOT NULL,
  successor_object_title TEXT,
  state supersession_state NOT NULL DEFAULT 'proposed',
  rationale TEXT NOT NULL,
  resolution_plan_id UUID,
  bundle_id UUID,
  created_by_id INTEGER NOT NULL,
  confirmed_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS supersession_org_project_idx
  ON supersession_records (organization_id, project_id);
CREATE INDEX IF NOT EXISTS supersession_superseded_idx
  ON supersession_records (superseded_object_type, superseded_object_id);
CREATE INDEX IF NOT EXISTS supersession_successor_idx
  ON supersession_records (successor_object_type, successor_object_id);
CREATE INDEX IF NOT EXISTS supersession_plan_idx
  ON supersession_records (resolution_plan_id);
