-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Sprint 3 — Reactive Dependency Layer
-- Date: 2026-03-23
-- Description: Impact state tracking, dependency links for governed objects,
--              auto-consequence audit log, review thread source traceability
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. GOVERNED OBJECT DEPENDENCIES ─────────────────────────────────────────
-- Tracks reactive relationships between assumptions, decisions, artifacts,
-- and contradictions. When upstream changes, downstream is marked stale.

CREATE TABLE IF NOT EXISTS governed_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Source (upstream) object
  source_type TEXT NOT NULL CHECK (source_type IN (
    'assumption', 'decision', 'artifact', 'contradiction'
  )),
  source_id TEXT NOT NULL,
  source_label TEXT,

  -- Target (downstream) object
  target_type TEXT NOT NULL CHECK (target_type IN (
    'assumption', 'decision', 'artifact', 'review_thread', 'workflow_run'
  )),
  target_id TEXT NOT NULL,
  target_label TEXT,

  -- Relationship
  link_type TEXT NOT NULL CHECK (link_type IN (
    'informs', 'governs', 'derived_from', 'depends_on',
    'triggers_update', 'blocks', 'invalidates'
  )),
  impact_level TEXT NOT NULL CHECK (impact_level IN (
    'critical', 'high', 'medium', 'low'
  )) DEFAULT 'medium',

  -- Staleness tracking (the reactive core)
  is_stale BOOLEAN DEFAULT FALSE,
  stale_since TIMESTAMPTZ,
  stale_reason TEXT,
  stale_source_event TEXT,  -- What change triggered staleness

  -- Impact state on the target
  target_impact_state TEXT CHECK (target_impact_state IN (
    'unaffected', 'impacted', 'stale', 'requires_review',
    'requires_reapproval', 'blocked_by_contradiction'
  )) DEFAULT 'unaffected',

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  -- Detection
  detection_method TEXT CHECK (detection_method IN (
    'manual', 'system_reactive', 'rule_based', 'ai_detected'
  )) DEFAULT 'system_reactive',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. IMPACT PROPAGATION LOG ───────────────────────────────────────────────
-- Audit trail of every reactive event: what changed, what was impacted, what happened.

CREATE TABLE IF NOT EXISTS impact_propagation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Trigger event
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'assumption_created', 'assumption_updated', 'assumption_superseded',
    'assumption_challenged', 'assumption_withdrawn',
    'decision_approved', 'decision_rejected', 'decision_executed',
    'decision_escalated', 'decision_superseded',
    'contradiction_created', 'contradiction_resolved',
    'artifact_promoted', 'artifact_locked'
  )),
  trigger_object_type TEXT NOT NULL,
  trigger_object_id TEXT NOT NULL,
  trigger_object_label TEXT,

  -- What happened
  action_taken TEXT NOT NULL CHECK (action_taken IN (
    'marked_stale', 'marked_impacted', 'marked_requires_review',
    'marked_requires_reapproval', 'auto_created_review_thread',
    'auto_created_contradiction_memo', 'auto_superseded_assumption',
    'auto_created_risk_signal', 'notification_sent',
    'no_downstream_impact'
  )),

  -- Impact scope
  impacted_object_type TEXT,
  impacted_object_id TEXT,
  impacted_object_label TEXT,
  dependency_id UUID,  -- link to governed_dependencies if applicable

  -- Confidence gating
  confidence_level TEXT CHECK (confidence_level IN (
    'definitive', 'high', 'moderate', 'low', 'speculative'
  )),
  auto_triggered BOOLEAN DEFAULT FALSE,

  -- Audit
  triggered_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gov_deps_org_project ON governed_dependencies(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_gov_deps_source ON governed_dependencies(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_gov_deps_target ON governed_dependencies(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_gov_deps_stale ON governed_dependencies(is_stale) WHERE is_stale = true;
CREATE INDEX IF NOT EXISTS idx_gov_deps_impact ON governed_dependencies(target_impact_state) WHERE target_impact_state != 'unaffected';

CREATE INDEX IF NOT EXISTS idx_impact_log_org ON impact_propagation_log(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_impact_log_trigger ON impact_propagation_log(trigger_object_type, trigger_object_id);
CREATE INDEX IF NOT EXISTS idx_impact_log_impacted ON impact_propagation_log(impacted_object_type, impacted_object_id);
