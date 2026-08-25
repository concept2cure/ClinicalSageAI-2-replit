-- ============================================================================
-- IVDR schema reconciliation — ONE canonical shape for ivdr_classifications
-- (Phase 2 slice 5, D11d IVDR consolidation, 2026-08-13)
-- ============================================================================
--
-- THE DEFECT. ivdr_classifications was CREATE TABLE IF NOT EXISTS'd by THREE
-- files with TWO incompatible column shapes, so the surviving shape was decided
-- by which creator ran first on a given database (ledger C-29; the
-- ci:duplicate-table-ddl baseline pinned all three):
--
--   migrations/001_create_ivdr_tables.sql          "shape 1": classification /
--     is_cdx / is_self_test / is_near_patient / rule_trace / analytes /
--     intended_purpose — no program_id, so no tenancy-correct project scoping.
--   migrations/20260508_ivd_diagnostic_surfaces.sql "shape 2": ivdr_class /
--     companion_diagnostic / self_test / near_patient_test / program_id /
--     notified_body_* — matches shared/schema.ts (the drizzle-push surface).
--   migrations/20260524_ivdr_cdx.sql               minimal CREATE + ALTERs
--     toward shape 2 (deleted by this consolidation — everything it did is
--     owned by 20260508 or by this file).
--
-- On a shape-1 database the shape-2 readers (mdx-ivdr.ts, ivd-completeness)
-- failed or returned NULL columns; on a shape-2 database the shape-1 readers
-- (ivdr-routes.ts) 500'd on "column classification does not exist". Same
-- record store, two vocabularies.
--
-- THE RESOLUTION (this file is the rename decision the install-fresh
-- classified-skip for 001_create_ivdr_tables.sql was waiting for):
--   • CANONICAL columns are the shape-2 names (they carry program_id, which
--     the tenancy/project-scoping fixes depend on) PLUS the three module
--     columns that have no shape-2 equivalent and stay canonical:
--     intended_purpose, rule_trace, analytes.
--   • Shape-1 duplicate names (classification, is_cdx, is_self_test,
--     is_near_patient) are DEPRECATED: kept where they already exist (audit
--     history is not rewritten), backfilled INTO the canonical columns,
--     relaxed to nullable so canonical-only writers succeed, never added to
--     databases that do not have them, and no code writes or reads them after
--     this consolidation (server/routes/ivdr-routes.ts,
--     server/routes/mdx-ivdr.ts and client useIvd.ts all speak canonical).
--   • ivdr_gspr_assessments gains a real creator: it previously existed ONLY
--     via runtime DDL in ivdr-routes.ts (ensureGsprTable), which the
--     non-superuser runtime role cannot be allowed to run. The runtime DDL is
--     removed with this consolidation; absent table now fails closed (503).
--   • The IVDR module detail tables (ivdr_analytical_validations,
--     ivdr_clinical_evidence, ivdr_cdx_workflows + history) gain the
--     audit-hardening columns their routes write. Those ALTERs previously
--     lived only in db/migrations/20260222_ivdr_schema_hardening.sql, which is
--     on NO durable apply path.
--
-- NOT merged here: ivd_analytical_performance / ivd_clinical_performance
-- (per-STUDY performance records, mdx-ivd-performance.ts + ivd-completeness)
-- vs ivdr_analytical_validations / ivdr_clinical_evidence (per-ANALYTE
-- validation parameters and 2x2 clinical evidence with immutable Part-11
-- history, ivdr-routes.ts + the binder pack builder). Their column sets are
-- disjoint (LoD/LoQ/CV and tp/fp/tn/fn have no per-study equivalent), so a
-- "backfill" would fabricate study records. They are DISTINCT resources; the
-- COMMENT ON TABLE statements below pin the boundary so the overlap cannot
-- silently regrow. The genuine DDL duplication in that family — 20260524_
-- ivd_performance.sql redefining 20260508's tables verbatim — is deleted with
-- this consolidation.
--
-- Ordering: on the durable deploy path (scripts/db/migration-set.mjs) this
-- file runs BEFORE 20260508/001, so a legacy shape-1 database is reconciled
-- before 20260508's program_id index is attempted; on the install-fresh
-- overlay it sorts after both creators and after drizzle-kit push, where the
-- ALTERs are no-ops. Every statement is idempotent and guarded: absent tables
-- are skipped (fail-closed readers already 503 on 42P01), never half-created.
-- ============================================================================

-- ─── 1. ivdr_classifications → union shape, canonical = shape-2 names ───────

ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS program_id             UUID;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS ivdr_class             TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS classification_rule    TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS rationale              TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS companion_diagnostic   BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS self_test              BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS near_patient_test      BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_required BOOLEAN;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_name     TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_id       TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS certificate_no         TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS certificate_expiry     DATE;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS metadata               JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ;
-- Canonical MODULE columns (no shape-2 equivalent; carried by the Annex VIII
-- rule engine in ivdr-routes.ts and by the classification report export).
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS intended_purpose       TEXT;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS rule_trace             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS ivdr_classifications ADD COLUMN IF NOT EXISTS analytes               JSONB DEFAULT '[]'::jsonb;

DO $do$
BEGIN
  IF to_regclass('public.ivdr_classifications') IS NULL THEN
    RAISE NOTICE 'ivdr_classifications absent — reconciliation skipped (created canonically by 20260508_ivd_diagnostic_surfaces.sql / drizzle push)';
    RETURN;
  END IF;

  -- updated_at: shape 1 declared it with no default, so mdx writes (which rely
  -- on the column default) stored NULL and the canonical ORDER BY updated_at
  -- sorted those rows unpredictably.
  EXECUTE 'ALTER TABLE ivdr_classifications ALTER COLUMN updated_at SET DEFAULT now()';
  EXECUTE 'UPDATE ivdr_classifications SET updated_at = created_at WHERE updated_at IS NULL';

  -- intended_purpose is canonical but OPTIONAL: shape 1 declared it NOT NULL,
  -- which made every canonical CRUD insert (mdx-ivdr.ts supplies no intended
  -- purpose) fail on shape-1 databases.
  EXECUTE 'ALTER TABLE ivdr_classifications ALTER COLUMN intended_purpose DROP NOT NULL';

  -- Data-preserving backfill: a row written by the shape-1 writer is exactly a
  -- row with classification set and ivdr_class still NULL. Copy legacy →
  -- canonical once; deprecated columns are left untouched as audit history.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'ivdr_classifications'
                AND column_name = 'classification') THEN
    EXECUTE $q$
      UPDATE ivdr_classifications
         SET ivdr_class             = classification,
             companion_diagnostic   = COALESCE(is_cdx, false),
             self_test              = COALESCE(is_self_test, false),
             near_patient_test      = COALESCE(is_near_patient, false),
             notified_body_required = COALESCE(notified_body_required,
                                               classification IS DISTINCT FROM 'A')
       WHERE ivdr_class IS NULL AND classification IS NOT NULL
    $q$;

    -- The deprecated columns must not block canonical-only writers: shape 1
    -- declared classification NOT NULL with a CHECK, which made every
    -- canonical insert fail on shape-1 databases.
    EXECUTE 'ALTER TABLE ivdr_classifications ALTER COLUMN classification DROP NOT NULL';

    EXECUTE $q$COMMENT ON COLUMN ivdr_classifications.classification IS
      'DEPRECATED (D11d IVDR consolidation, 2026-08-13): superseded by ivdr_class. Preserved for audit history only — no code reads or writes it.'$q$;
    EXECUTE $q$COMMENT ON COLUMN ivdr_classifications.is_cdx IS
      'DEPRECATED (D11d IVDR consolidation, 2026-08-13): superseded by companion_diagnostic. Preserved for audit history only.'$q$;
    EXECUTE $q$COMMENT ON COLUMN ivdr_classifications.is_self_test IS
      'DEPRECATED (D11d IVDR consolidation, 2026-08-13): superseded by self_test. Preserved for audit history only.'$q$;
    EXECUTE $q$COMMENT ON COLUMN ivdr_classifications.is_near_patient IS
      'DEPRECATED (D11d IVDR consolidation, 2026-08-13): superseded by near_patient_test. Preserved for audit history only.'$q$;
  END IF;

  -- Canonical indexes (names from 20260508 / shared/schema.ts); the shape-1
  -- index on the deprecated column goes away with its column's writers.
  EXECUTE 'CREATE INDEX IF NOT EXISTS ivdr_class_org_idx     ON ivdr_classifications (organization_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS ivdr_class_program_idx ON ivdr_classifications (program_id)';
  EXECUTE 'DROP INDEX IF EXISTS idx_ivdr_class_class';
  EXECUTE 'DROP INDEX IF EXISTS idx_ivdr_class_org';

  EXECUTE $q$COMMENT ON TABLE ivdr_classifications IS
    'EU IVDR Annex VIII classifications — ONE canonical shape (D11d consolidation, 2026-08-13): ivdr_class / companion_diagnostic / self_test / near_patient_test / program_id + module columns intended_purpose / rule_trace / analytes. The legacy shape-1 names (classification, is_cdx, is_self_test, is_near_patient) are deprecated and unwritten.'$q$;
END
$do$;

-- ─── 2. ivdr_gspr_assessments — first real creator (was runtime DDL only) ───
-- Shape matches what ivdr-routes.ts previously created lazily on the request
-- pool. Single definition in the repo; readers fail closed (503) until this
-- has been applied.

CREATE TABLE IF NOT EXISTS ivdr_gspr_assessments (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id      TEXT NOT NULL,
  device_name     TEXT NOT NULL,
  classification  TEXT,
  requirements    JSONB NOT NULL DEFAULT '[]',
  created_by      TEXT NOT NULL DEFAULT 'system',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivdr_gspr_org_idx     ON ivdr_gspr_assessments (organization_id);
CREATE INDEX IF NOT EXISTS ivdr_gspr_project_idx ON ivdr_gspr_assessments (organization_id, project_id);

-- ─── 3. IVDR module detail tables — audit-hardening columns on the durable
--        path (previously only in db/migrations/20260222_ivdr_schema_hardening
--        .sql, which no applier runs). The routes write every one of these. ──

ALTER TABLE IF EXISTS ivdr_analytical_validations ADD COLUMN IF NOT EXISTS evidence_documents  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS ivdr_analytical_validations ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS ivdr_analytical_validations ADD COLUMN IF NOT EXISTS pass_fail_status    JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS ivdr_validation_parameter_history ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE IF EXISTS ivdr_clinical_evidence ADD COLUMN IF NOT EXISTS population_definition TEXT;
ALTER TABLE IF EXISTS ivdr_clinical_evidence ADD COLUMN IF NOT EXISTS inclusion_criteria    TEXT;
ALTER TABLE IF EXISTS ivdr_clinical_evidence ADD COLUMN IF NOT EXISTS exclusion_criteria    TEXT;
ALTER TABLE IF EXISTS ivdr_clinical_evidence ADD COLUMN IF NOT EXISTS source_documents      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS ivdr_evidence_result_history ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE IF EXISTS ivdr_cdx_workflows ADD COLUMN IF NOT EXISTS intended_use_statement TEXT;
ALTER TABLE IF EXISTS ivdr_cdx_workflows ADD COLUMN IF NOT EXISTS biomarker_type         VARCHAR(50);
ALTER TABLE IF EXISTS ivdr_cdx_workflows ADD COLUMN IF NOT EXISTS clinical_evidence_ids  INTEGER[] DEFAULT '{}';

-- ─── 4. Resource boundary between the two performance families ──────────────
-- Pin the distinction so the conceptual overlap that produced this slice's
-- duplication cannot silently regrow.

DO $do$
BEGIN
  IF to_regclass('public.ivdr_analytical_validations') IS NOT NULL THEN
    EXECUTE $q$COMMENT ON TABLE ivdr_analytical_validations IS
      'IVDR module per-ANALYTE validation parameters (LoD/LoQ/CV, acceptance criteria, immutable parameter history). Distinct resource from ivd_analytical_performance, the canonical per-STUDY performance record store (D11d consolidation, 2026-08-13). Do not add per-study columns here.'$q$;
  END IF;
  IF to_regclass('public.ivdr_clinical_evidence') IS NOT NULL THEN
    EXECUTE $q$COMMENT ON TABLE ivdr_clinical_evidence IS
      'IVDR module clinical evidence with 2x2 contingency counts and computed metrics (immutable result history). Distinct resource from ivd_clinical_performance, the canonical per-STUDY sensitivity/specificity record store (D11d consolidation, 2026-08-13). Do not add per-study columns here.'$q$;
  END IF;
END
$do$;
