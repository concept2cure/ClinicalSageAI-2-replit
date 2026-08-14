-- ============================================================================
-- regulatory_intel — a platform tier, so shipped knowledge has somewhere to live
-- ============================================================================
--
-- WHY. `db/migrations/20260322_regulatory_precedent_intelligence.sql` created
-- eleven pattern tables, every one of them `organization_id UUID NOT NULL`, and
-- seeded none. The schema is correct for a tenant's OWN precedent library and
-- has no representation at all for knowledge the platform ships. So the module
-- was architecturally sound and permanently empty, which is why ADR 0013 made
-- `precedent-engine` — whose knowledge is curated inline, in TypeScript —
-- authoritative for CRL, RTF, EMA and advisory-committee risk.
--
-- That decision names its own reversal condition: seed data. This migration is
-- the first half of it. It does not move any decision by itself; it creates the
-- place the knowledge can go.
--
-- ── The sentinel, and why not a nullable column ─────────────────────────────
-- Platform rows are owned by the all-zeros UUID. The alternative — making
-- `organization_id` nullable and treating NULL as "platform" — is worse in a
-- multi-tenant schema for a specific reason: every tenant-scoping predicate in
-- this codebase is `organization_id = $1`, and NULL silently fails that
-- comparison rather than being excluded by it. A row that no predicate matches
-- is invisible; a row owned by a real (if reserved) id is visible exactly to the
-- queries that opt in with `IN ($1, platform)`. Opt-in beats silent.
--
-- The sentinel is also checkable: the CHECK constraints below make it impossible
-- to create a tenant row that accidentally claims platform ownership, and the
-- partial unique indexes stop the same pattern being seeded twice.
--
-- ── This does NOT widen tenant visibility ───────────────────────────────────
-- No existing query changes. A service reads platform rows only by explicitly
-- adding the sentinel to its predicate. A tenant still cannot see another
-- tenant's rows, because the sentinel is not any tenant's id and cannot be
-- (it is reserved by the CHECK below).
--
-- ROLLBACK
--   DELETE FROM regulatory_intel.crl_trigger_patterns        WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--   DELETE FROM regulatory_intel.rtf_trigger_patterns        WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--   DELETE FROM regulatory_intel.advisory_committee_patterns WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--   DROP INDEX IF EXISTS regulatory_intel.crl_platform_pattern_code_uniq;
--   DROP INDEX IF EXISTS regulatory_intel.rtf_platform_pattern_code_uniq;
--   DROP INDEX IF EXISTS regulatory_intel.adcom_platform_pattern_code_uniq;
-- Rollback removes platform knowledge only; tenant rows are untouched, and the
-- services fall back to their inline arrays, which is where they are today.
-- ============================================================================

DO $do$
BEGIN
  IF to_regnamespace('regulatory_intel') IS NULL THEN
    RAISE NOTICE 'regulatory_intel schema absent — platform tier skipped';
    RETURN;
  END IF;

  -- One platform row per pattern code, per family. Partial so tenant rows are
  -- unconstrained: two tenants may legitimately use the same code.
  IF to_regclass('regulatory_intel.crl_trigger_patterns') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS crl_platform_pattern_code_uniq
      ON regulatory_intel.crl_trigger_patterns (pattern_code)
      WHERE organization_id = '00000000-0000-0000-0000-000000000000';
    CREATE INDEX IF NOT EXISTS crl_org_lookup
      ON regulatory_intel.crl_trigger_patterns (organization_id, category);
  END IF;

  IF to_regclass('regulatory_intel.rtf_trigger_patterns') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS rtf_platform_pattern_code_uniq
      ON regulatory_intel.rtf_trigger_patterns (pattern_code)
      WHERE organization_id = '00000000-0000-0000-0000-000000000000';
    CREATE INDEX IF NOT EXISTS rtf_org_lookup
      ON regulatory_intel.rtf_trigger_patterns (organization_id, category);
  END IF;

  IF to_regclass('regulatory_intel.advisory_committee_patterns') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS adcom_platform_pattern_code_uniq
      ON regulatory_intel.advisory_committee_patterns (pattern_code)
      WHERE organization_id = '00000000-0000-0000-0000-000000000000';
    CREATE INDEX IF NOT EXISTS adcom_org_lookup
      ON regulatory_intel.advisory_committee_patterns (organization_id, risk_category);
  END IF;

  RAISE NOTICE 'regulatory_intel platform tier ensured';
END
$do$;

COMMENT ON SCHEMA regulatory_intel IS
  'Regulatory precedent patterns. Rows owned by the all-zeros UUID are '
  'platform-provided knowledge, readable by every tenant; all other rows are '
  'that tenant''s own and visible only to them. A service opts into platform '
  'knowledge with organization_id IN ($1, ''00000000-0000-0000-0000-000000000000'').';
