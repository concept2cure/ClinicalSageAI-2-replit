-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Attach a tenant-isolation RLS policy to the uuid-keyed tenant tables
--          in NON-PUBLIC schemas that their own subsystem migrations left
--          unpoliced, so a request that carries a tenant context cannot read
--          another tenant's programs, manufacturing records, regulatory
--          precedent intelligence, harmonization data, or federated signals.
--
-- eCTD/CTD Context:
--   - Module(s): all (cross-cutting isolation for the non-public schemas)
--   - Integrity Risk Addressed: tenant isolation — a uuid-keyed tenant table
--     with no RLS is cross-tenant readable on any scoped connection
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Idempotent (IF EXISTS / guarded CREATE POLICY).
--   - No table is created or altered structurally; this only ENABLEs RLS and
--     attaches a policy.
-- =============================================================================
--
-- Ledger C-46.
--
-- migrations/0021_enable_rls_everywhere.sql and 20260801_tenant_isolation_sweep.sql
-- both operate on the `public` schema and INTEGER tenant keys. The platform's
-- non-public schemas (core, cortex, ai, compliance, identity, innovation, …) use
-- a uuid tenant key and were policied PER SUBSYSTEM by each subsystem's own _gcc_
-- migration. That left gaps: subsystems that never added RLS. Wiring the once
-- deploy-dead migrations onto the deploy path (C-33/C-34) put several of those
-- tables on every provisioned database, uuid-keyed and unpoliced.
--
-- A read/verify triage of every unpoliced uuid-tenant BASE TABLE classified each
-- as tenant-owned (policy) or cross-tenant-by-design (exempt). This migration
-- policies the tenant-owned set. It is EXPLICIT — a fixed (schema, table, column)
-- list, not a dynamic sweep — because the tenant key differs per table
-- (org_id / organization_id / tenant_id) and because the exemptions are
-- deliberate, not accidental.
--
-- THE GUC IS EXTRACTED, NOT CAST. The convention this copies wrote
-- `current_setting('app.current_org_id')::uuid`, and that GUC is set to the
-- EMPTY STRING on the scopes the app uses most — systemSessionVars() (the
-- cross-tenant super-admin scope), tenantSessionVars() when `orgUuid` is null,
-- and the reset paths in lazyRequestDbClient / withTenantConnection /
-- poolInstrumentation. `''::uuid` raises rather than yielding NULL, so those
-- reads died with `invalid input syntax for type uuid: ""`.
-- `substring(… from '<uuid pattern>')` yields NULL for '' and for any non-uuid,
-- which the COALESCE then treats as "no tenant context" — exactly what an unset
-- GUC already did. The expression is INLINE rather than a call to
-- identity.current_org_id() (which carries the same guard) deliberately: that
-- function lives in the governed-content tree, this file runs on the deploy
-- path where that tree is not applied, and the whole design of this migration is
-- to skip what is not provisioned rather than fail on it. Depending on another
-- schema's function would make it fail closed on a database that never had one.
--
-- POLICY SHAPE — copied from the dominant existing non-public convention
-- (cortex.*, innovation.* : `<col> = COALESCE(current_setting('app.current_org_id')
-- ::uuid, <col>) OR <col> IS NULL`). Two properties matter and are why this shape
-- is used verbatim rather than the stricter identity.can_access_org() form:
--
--   1. NON-BREAKING FOR CONTEXT-LESS READS — but NOT via a COALESCE fallback.
--      REVISED 2026-08-28. This emitted
--         `<col> = COALESCE(substring(current_setting(...))::uuid, <col>)`
--      so that an unset GUC made the predicate `<col> = <col>`, TRUE for every
--      row, and the background/service reads that never set a GUC kept working.
--      The cost was not theoretical. Measured on this schema as the
--      non-superuser app_service role with app.rls_enforce=on, two rows under
--      different org_ids in cortex.knowledge_gaps:
--
--          app.current_org_id unset  -> BOTH tenants' rows
--          app.current_org_id = '42' -> BOTH tenants' rows
--          app.current_org_id = <A>  -> tenant A only
--
--      Both failing inputs are reachable: establishRequestTenantScope writes the
--      GUC as `orgUuid ?? ''`, and '42' is exactly what an INTEGER org id looks
--      like arriving at a UUID-keyed schema. A tenant predicate whose failure
--      mode is "return everything" is not defense-in-depth; it is a policy that
--      cannot fail closed no matter what goes wrong above it.
--
--      The non-breaking property is kept, but taken from the SAME switch the 793
--      public-schema policies already use — the app.rls_enforce shadow clause:
--
--          (NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')
--          OR <col> = substring(current_setting('app.current_org_id', true) from '<uuid>')::uuid
--          OR <col> IS NULL
--
--      With enforcement OFF the policy does not filter, so an unscoped
--      raw-pool reader behaves exactly as before. With enforcement ON it
--      filters strictly — and an unscoped connection never reaches SQL anyway,
--      because poolInstrumentation fails closed on a connection with no tenant
--      scope under RLS_ENFORCE=on (that guard is what surfaced, and blocked,
--      the unscoped sentinel/feature-toggle/template-seed jobs). So the
--      fallback was buying no availability in the posture that matters; it was
--      only widening reads.
--
--      This does NOT reopen C-44. That break was api_key lookups running
--      PRE-AUTH, before any scope can exist; those tables are on the RLS
--      allowlist and are not policied by this sweep at all.
--   2. SHARED NULL-OWNER ROWS STAY VISIBLE. `<col> IS NULL` is always allowed, so
--      federation-wide signals (federated_ml.safety_signals, org_id NULL by design)
--      remain readable by every participant.
--
-- EXEMPT — deliberately NOT policied (cross-tenant by design; a tenant policy
-- would break a legitimate cross-org reader):
--   - federated_ml.federation_participants — the FL coordinator aggregates every
--     org's participant row per model_id; a per-org policy breaks gradient
--     aggregation, the federation dashboard, and privacy-budget accounting.
--   - audit.event_log — 21 CFR Part 11 immutable audit trail, written by DB
--     triggers (org_id captured at write, NULL for system events) and read only by
--     cross-org compliance views and a background hash-integrity job; there is no
--     per-tenant request reader to isolate, and a policy would drop NULL-org system
--     events and break the compliance/export readers. Those readers must run under
--     a privileged role, which is a role-posture matter, not a table policy.
--
-- The identity.can_access_org() family (used by ai/compliance/ectd_v4/identity)
-- is intentionally NOT retrofitted here: those subsystems established a session
-- context; these have not, so their table must use the context-less-safe shape.
-- Migrating these services onto a tenant-scoped client and tightening to a strict
-- policy is a follow-up tracked in the ledger.

DO $$
DECLARE
  rec           RECORD;
  applied_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR rec IN
    SELECT sch, tbl, col FROM (VALUES
      -- core: per-tenant programs and their ownership rows
      ('core',                     'programs',                       'org_id'),
      ('core',                     'program_ownerships',             'org_id'),
      -- manufacturing: per-tenant operational records
      ('manufacturing',            'equipment_registry',             'org_id'),
      ('manufacturing',            'batch_execution_records',        'org_id'),
      ('manufacturing',            'quality_test_results',           'org_id'),
      ('manufacturing',            'digital_twins',                  'org_id'),
      ('manufacturing',            'isa95_fhir_mappings',            'org_id'),
      -- compliance: the one policied-neighbor gap
      ('compliance',               'data_residency',                 'organization_id'),
      -- global_dossier: per-tenant dossier instances
      ('global_dossier',           'dossier_instances',              'org_id'),
      -- cortex: the three gaps among an otherwise-policied schema
      ('cortex',                   'atoms',                          'org_id'),
      ('cortex',                   'threads',                        'org_id'),
      ('cortex',                   'traces',                         'org_id'),
      -- federated_ml: per-tenant signals; NULL org_id (shared federation signals)
      -- stays visible via the `IS NULL` arm of the policy
      ('federated_ml',             'safety_signals',                 'org_id'),
      -- regulatory_intel: each org holds a PRIVATE copy of the pattern library
      ('regulatory_intel',         'crl_trigger_patterns',           'organization_id'),
      ('regulatory_intel',         'crl_trajectory_records',         'organization_id'),
      ('regulatory_intel',         'rtf_trigger_patterns',           'organization_id'),
      ('regulatory_intel',         'ema_question_patterns',          'organization_id'),
      ('regulatory_intel',         'advisory_committee_patterns',    'organization_id'),
      ('regulatory_intel',         'precedent_application_rules',    'organization_id'),
      ('regulatory_intel',         'confidence_calibration_log',     'organization_id'),
      ('regulatory_intel',         'cross_jurisdictional_frameworks','organization_id'),
      ('regulatory_intel',         'jurisdictional_divergence_map',  'organization_id'),
      ('regulatory_intel',         'reliance_pathways',              'organization_id'),
      ('regulatory_intel',         'filing_sequence_strategies',     'organization_id'),
      -- regulatory_harmonization: the real tenant key is tenant_id (organization_id
      -- is secondary metadata, never used as a filter key)
      ('regulatory_harmonization', 'canonical_products',             'tenant_id'),
      ('regulatory_harmonization', 'canonical_adverse_events',       'tenant_id'),
      ('regulatory_harmonization', 'export_jobs',                    'tenant_id'),
      ('regulatory_harmonization', 'gdpr_processing_records',        'tenant_id'),
      ('regulatory_harmonization', 'tenant_data_residency',          'tenant_id')
    ) AS v(sch, tbl, col)
  LOOP
    -- Table may be absent in an environment that did not provision this subsystem.
    IF to_regclass(format('%I.%I', rec.sch, rec.tbl)) IS NULL THEN
      skipped_count := skipped_count + 1;
      RAISE NOTICE '[uuid-rls] SKIPPED %.% — not provisioned in this environment', rec.sch, rec.tbl;
      CONTINUE;
    END IF;

    -- Defensive: the keyed column must exist and be uuid.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = rec.sch AND c.table_name = rec.tbl
        AND c.column_name = rec.col AND c.data_type = 'uuid'
    ) THEN
      skipped_count := skipped_count + 1;
      RAISE NOTICE '[uuid-rls] SKIPPED %.% — expected uuid column % not found (schema drift)', rec.sch, rec.tbl, rec.col;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.sch, rec.tbl);

    -- Never clobber a policy already present (idempotent, and defensive against a
    -- subsystem that later adds its own).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = rec.sch AND p.tablename = rec.tbl
        AND p.policyname = 'tenant_isolation_policy'
    ) THEN
      EXECUTE format($pol$
        CREATE POLICY tenant_isolation_policy ON %I.%I
          FOR ALL
          USING (
            (NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on')
            OR %I = substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::uuid
            OR %I IS NULL
          )
          WITH CHECK (
            (NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on')
            OR %I = substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::uuid
            OR %I IS NULL
          )
      $pol$, rec.sch, rec.tbl,
             rec.col, rec.col,
             rec.col, rec.col);
      applied_count := applied_count + 1;
      RAISE NOTICE '[uuid-rls] policied %.% on %', rec.sch, rec.tbl, rec.col;
    END IF;
  END LOOP;

  RAISE NOTICE '[uuid-rls] tenant_isolation_policy applied to % non-public uuid-tenant table(s); % skipped (unprovisioned/drift). federated_ml.federation_participants and audit.event_log are intentionally EXEMPT (cross-tenant by design).',
    applied_count, skipped_count;
END $$;
