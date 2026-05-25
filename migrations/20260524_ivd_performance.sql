-- ============================================================================
-- IVD performance tables (backfill for drizzle tables)
-- ============================================================================
--
-- ivdAnalyticalPerformance / ivdClinicalPerformance are defined in
-- shared/schema.ts and queried by server/routes/mdx-ivd-performance.ts
-- (which backs the IVD Pathway surface), but drizzle-kit push does not
-- materialize them in every environment, so the surface had no data source.
-- Idempotent CREATEs mirroring the drizzle column definitions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ivd_analytical_performance (
    id                   SERIAL PRIMARY KEY,
    organization_id      INTEGER NOT NULL REFERENCES organizations(id),
    program_id           UUID,
    study_type           TEXT NOT NULL,
    study_id             TEXT,
    title                TEXT NOT NULL,
    protocol_ref         TEXT,
    acceptance_criterion TEXT,
    result_summary       TEXT,
    pass_fail            TEXT,
    n_samples            INTEGER,
    n_replicates         INTEGER,
    sites                TEXT[],
    analytes             TEXT[],
    matrix_type          TEXT,
    report_artifact_id   INTEGER,
    metadata             JSONB DEFAULT '{}',
    started_at           DATE,
    completed_at         DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_org_idx     ON ivd_analytical_performance (organization_id);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_program_idx ON ivd_analytical_performance (program_id);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_type_idx    ON ivd_analytical_performance (organization_id, study_type);

CREATE TABLE IF NOT EXISTS ivd_clinical_performance (
    id                        SERIAL PRIMARY KEY,
    organization_id           INTEGER NOT NULL REFERENCES organizations(id),
    program_id                UUID,
    study_id                  TEXT,
    title                     TEXT NOT NULL,
    intended_population       TEXT,
    comparator                TEXT,
    comparator_kind           TEXT,
    total_subjects            INTEGER,
    positive_n                INTEGER,
    negative_n                INTEGER,
    sensitivity_pct           DECIMAL(5, 2),
    sensitivity_lower         DECIMAL(5, 2),
    sensitivity_upper         DECIMAL(5, 2),
    specificity_pct           DECIMAL(5, 2),
    specificity_lower         DECIMAL(5, 2),
    specificity_upper         DECIMAL(5, 2),
    ppv_pct                   DECIMAL(5, 2),
    npv_pct                   DECIMAL(5, 2),
    prevalence_pct            DECIMAL(5, 2),
    auc_roc                   DECIMAL(5, 3),
    pre_specified_endpoint_met BOOLEAN,
    report_artifact_id        INTEGER,
    metadata                  JSONB DEFAULT '{}',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ivd_clin_perf_org_idx     ON ivd_clinical_performance (organization_id);
CREATE INDEX IF NOT EXISTS ivd_clin_perf_program_idx ON ivd_clinical_performance (program_id);
