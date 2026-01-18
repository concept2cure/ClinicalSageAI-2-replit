-- CERV2 standards and outcomes tables for enterprise workbench
CREATE TABLE IF NOT EXISTS cerv2_standards (
    id BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    program_id TEXT NOT NULL,
    standard_id TEXT NOT NULL,
    name TEXT NOT NULL,
    requirement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'missing',
    owner TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cerv2_standards_unique
    ON cerv2_standards (organization_id, program_id, standard_id);

CREATE INDEX IF NOT EXISTS cerv2_standards_org_program_idx
    ON cerv2_standards (organization_id, program_id);

CREATE TABLE IF NOT EXISTS cerv2_outcomes (
    id BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    program_id TEXT NOT NULL,
    outcome_id TEXT NOT NULL,
    name TEXT NOT NULL,
    timepoint TEXT,
    comparator TEXT,
    confidence TEXT NOT NULL DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'missing',
    owner TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cerv2_outcomes_unique
    ON cerv2_outcomes (organization_id, program_id, outcome_id);

CREATE INDEX IF NOT EXISTS cerv2_outcomes_org_program_idx
    ON cerv2_outcomes (organization_id, program_id);

CREATE OR REPLACE FUNCTION update_cerv2_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_cerv2_standards_updated_at ON cerv2_standards;
CREATE TRIGGER update_cerv2_standards_updated_at
    BEFORE UPDATE ON cerv2_standards
    FOR EACH ROW EXECUTE FUNCTION update_cerv2_updated_at();

DROP TRIGGER IF EXISTS update_cerv2_outcomes_updated_at ON cerv2_outcomes;
CREATE TRIGGER update_cerv2_outcomes_updated_at
    BEFORE UPDATE ON cerv2_outcomes
    FOR EACH ROW EXECUTE FUNCTION update_cerv2_updated_at();
