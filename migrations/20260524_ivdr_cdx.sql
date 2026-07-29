-- ============================================================================
-- IVDR + CDx diagnostic tables (backfill for drizzle tables)
-- ============================================================================
--
-- ivdrClassifications / ivdrPerDocuments / cdxPairings / cdxConcordanceStudies
-- are defined in shared/schema.ts and queried by mdx-ivdr.ts / mdx-cdx.ts
-- (EU IVDR + Companion Diagnostic surfaces), but drizzle-kit push does not
-- materialize them here. Idempotent CREATEs mirroring the drizzle defs.
-- ============================================================================

-- ivdr_classifications already exists in some environments from an older
-- drizzle-push shape (classification / is_cdx / intended_purpose) that lacks
-- the columns the current route + aggregate expect. CREATE the table if it's
-- absent, then reconcile via ADD COLUMN IF NOT EXISTS so both the legacy and
-- current column sets coexist (the route reads the current names; old rows get
-- NULLs). This also repairs the pre-existing /ivdr/classifications 500.
CREATE TABLE IF NOT EXISTS ivdr_classifications (
    id                     SERIAL PRIMARY KEY,
    organization_id        INTEGER NOT NULL REFERENCES organizations(id),
    device_name            TEXT NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS program_id             UUID;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS ivdr_class             TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS classification_rule    TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS rationale              TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS companion_diagnostic   BOOLEAN DEFAULT false;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS self_test              BOOLEAN DEFAULT false;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS near_patient_test      BOOLEAN DEFAULT false;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_required BOOLEAN;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_name     TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS notified_body_id       TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS certificate_no         TEXT;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS certificate_expiry     DATE;
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS metadata               JSONB DEFAULT '{}';
ALTER TABLE ivdr_classifications ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ivdr_class_org_idx     ON ivdr_classifications (organization_id);
CREATE INDEX IF NOT EXISTS ivdr_class_program_idx ON ivdr_classifications (program_id);

CREATE TABLE IF NOT EXISTS ivdr_per_documents (
    id                          SERIAL PRIMARY KEY,
    organization_id             INTEGER NOT NULL REFERENCES organizations(id),
    program_id                  UUID,
    device_name                 TEXT NOT NULL,
    per_version                 TEXT NOT NULL,
    per_status                  TEXT DEFAULT 'draft',
    scientific_validity_done    BOOLEAN DEFAULT false,
    analytical_performance_done BOOLEAN DEFAULT false,
    clinical_performance_done   BOOLEAN DEFAULT false,
    benefit_risk_conclusion     TEXT,
    pmpf_plan_attached          BOOLEAN DEFAULT false,
    author_name                 TEXT,
    author_qualifications       TEXT,
    per_date                    DATE,
    artifact_id                 INTEGER,
    metadata                    JSONB DEFAULT '{}',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ivdr_per_org_idx     ON ivdr_per_documents (organization_id);
CREATE INDEX IF NOT EXISTS ivdr_per_program_idx ON ivdr_per_documents (program_id);

CREATE TABLE IF NOT EXISTS cdx_pairings (
    id                     SERIAL PRIMARY KEY,
    organization_id        INTEGER NOT NULL REFERENCES organizations(id),
    device_program_id      UUID,
    drug_name              TEXT NOT NULL,
    drug_innn              TEXT,
    drug_application_type  TEXT,
    drug_application_no     TEXT,
    drug_sponsor           TEXT,
    indication             TEXT,
    biomarker              TEXT,
    approval_status        TEXT DEFAULT 'planned',
    fda_approval_date      DATE,
    ema_approval_date      DATE,
    cdx_label_text         TEXT,
    metadata               JSONB DEFAULT '{}',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cdx_pairings_org_idx       ON cdx_pairings (organization_id);
CREATE INDEX IF NOT EXISTS cdx_pairings_program_idx   ON cdx_pairings (device_program_id);
CREATE INDEX IF NOT EXISTS cdx_pairings_biomarker_idx ON cdx_pairings (organization_id, biomarker);

CREATE TABLE IF NOT EXISTS cdx_concordance_studies (
    id                    SERIAL PRIMARY KEY,
    organization_id       INTEGER NOT NULL REFERENCES organizations(id),
    cdx_pairing_id        INTEGER NOT NULL REFERENCES cdx_pairings(id) ON DELETE CASCADE,
    study_id              TEXT,
    reference_assay       TEXT NOT NULL,
    candidate_assay       TEXT NOT NULL,
    n_samples             INTEGER,
    ppa_pct               DECIMAL(5, 2),
    ppa_lower             DECIMAL(5, 2),
    ppa_upper             DECIMAL(5, 2),
    npa_pct               DECIMAL(5, 2),
    npa_lower             DECIMAL(5, 2),
    npa_upper             DECIMAL(5, 2),
    opa_pct               DECIMAL(5, 2),
    discordant_resolution TEXT,
    report_artifact_id    INTEGER,
    metadata              JSONB DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cdx_concord_org_idx     ON cdx_concordance_studies (organization_id);
CREATE INDEX IF NOT EXISTS cdx_concord_pairing_idx ON cdx_concordance_studies (cdx_pairing_id);
