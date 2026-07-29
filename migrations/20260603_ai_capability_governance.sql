-- AI capability governance — per-capability intended use, risk tier, and
-- human-oversight controls on ana_capability_registry.
--
-- Mirrors the FDA 2025 draft framework on AI credibility for regulatory
-- decisions (intended use × risk × oversight). The code module
-- server/services/ai-governance/ is the source of truth via governanceFor();
-- seedCapabilityRegistry() + backfillCapabilityGovernance() populate these
-- columns (including per-capability overrides and composed intended-use text).
-- This migration adds the columns and a category-level floor so the table is
-- usable even before the service backfill runs.
--
-- Idempotent. FK-free.

ALTER TABLE ana_capability_registry
  ADD COLUMN IF NOT EXISTS intended_use           text,
  ADD COLUMN IF NOT EXISTS risk_tier              text,
  ADD COLUMN IF NOT EXISTS human_oversight        text,
  ADD COLUMN IF NOT EXISTS groundedness_threshold real,
  ADD COLUMN IF NOT EXISTS gxp_applicable         boolean DEFAULT false;

-- Category-level floor for rows that have not yet been backfilled by the
-- service. Per-capability overrides (e.g. predicate-comparison → high,
-- submission-readiness → requires_approval) are applied in code on re-seed.
UPDATE ana_capability_registry SET
  risk_tier = CASE category
    WHEN 'drafting' THEN 'high'
    WHEN 'compliance' THEN 'high'
    WHEN 'submission' THEN 'high'
    WHEN 'analysis' THEN 'moderate'
    WHEN 'intelligence' THEN 'moderate'
    WHEN 'prediction' THEN 'moderate'
    WHEN 'workflow' THEN 'low'
    WHEN 'knowledge' THEN 'low'
    WHEN 'formatting' THEN 'low'
    ELSE 'moderate'
  END,
  human_oversight = CASE category
    WHEN 'submission' THEN 'requires_approval'
    WHEN 'workflow' THEN 'requires_approval'
    WHEN 'drafting' THEN 'requires_review'
    WHEN 'compliance' THEN 'requires_review'
    WHEN 'analysis' THEN 'requires_review'
    WHEN 'intelligence' THEN 'suggest_only'
    WHEN 'prediction' THEN 'suggest_only'
    WHEN 'knowledge' THEN 'suggest_only'
    WHEN 'formatting' THEN 'suggest_only'
    ELSE 'requires_review'
  END,
  groundedness_threshold = CASE category
    WHEN 'compliance' THEN 0.85
    WHEN 'submission' THEN 0.85
    WHEN 'drafting' THEN 0.80
    WHEN 'analysis' THEN 0.75
    WHEN 'intelligence' THEN 0.70
    WHEN 'prediction' THEN 0.70
    WHEN 'workflow' THEN 0.60
    WHEN 'knowledge' THEN 0.50
    WHEN 'formatting' THEN 0.50
    ELSE 0.75
  END,
  gxp_applicable = CASE category
    WHEN 'prediction' THEN false
    WHEN 'knowledge' THEN false
    WHEN 'formatting' THEN false
    ELSE true
  END,
  intended_use = COALESCE(intended_use, description)
WHERE risk_tier IS NULL;

CREATE INDEX IF NOT EXISTS ana_cap_registry_risk_tier_idx ON ana_capability_registry(risk_tier);
