-- ============================================================================
-- Contradiction Engine schema — backfill for the contradiction subsystem
-- ============================================================================
--
-- contradiction-engine-service.ts and contradiction-consequence-service.ts
-- read/write four tables that were never defined in any migration or in the
-- drizzle schema — they are addressed only through raw `pool.query` SQL. The
-- PDEV Contradictions surface (GET /api/pdev/programs/:id/contradictions)
-- calls the engine's list path, so without these tables the surface throws
-- at runtime against a real database.
--
-- Column definitions are reconstructed verbatim from the service SQL (the
-- INSERT column lists, UPDATE SETs, and the map*() row readers are the
-- contract). `applicable_domains` / `applicable_program_types` are TEXT[]
-- because the service passes JS string arrays and reads them straight back
-- as arrays via node-postgres. `confidence_score` is NUMERIC because the
-- reader parseFloat()s it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- contradiction_findings — detected contradictions between two objects
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contradiction_findings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             INTEGER NOT NULL,
    project_id                  INTEGER,

    source_classification       TEXT,

    object_a_type               TEXT NOT NULL,
    object_a_id                 TEXT NOT NULL,
    object_a_label              TEXT,
    object_b_type               TEXT NOT NULL,
    object_b_id                 TEXT NOT NULL,
    object_b_label              TEXT,

    contradiction_type          TEXT NOT NULL,
    severity                    TEXT NOT NULL,
    truth_hierarchy_level       TEXT,

    confidence_score            NUMERIC,
    confidence_level            TEXT,

    title                       TEXT NOT NULL,
    description                 TEXT,
    evidence_summary            TEXT,
    deterministic_rule          TEXT,

    llm_role                    TEXT,
    llm_explanation             TEXT,

    regulator_body              TEXT,
    overlay_rule_id             UUID,
    regulator_severity_override TEXT,
    authority_state             TEXT NOT NULL DEFAULT 'advisory_only',

    review_state                TEXT NOT NULL DEFAULT 'unresolved',
    resolved_at                 TIMESTAMP,
    resolved_by                 TEXT,
    resolution_notes            TEXT,

    consequence_type            TEXT,
    consequence_object_id       TEXT,
    consequence_executed        BOOLEAN DEFAULT false,

    detected_by                 TEXT,

    created_at                  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contradiction_findings_org_idx     ON contradiction_findings (organization_id);
CREATE INDEX IF NOT EXISTS contradiction_findings_project_idx ON contradiction_findings (project_id);
CREATE INDEX IF NOT EXISTS contradiction_findings_review_idx  ON contradiction_findings (review_state);
CREATE INDEX IF NOT EXISTS contradiction_findings_sev_idx     ON contradiction_findings (severity);

-- ----------------------------------------------------------------------------
-- contradiction_overlay_rules — regulator-specific severity/authority overlays
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contradiction_overlay_rules (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             INTEGER NOT NULL,

    rule_code                   TEXT NOT NULL,
    rule_name                   TEXT NOT NULL,
    regulator_body              TEXT NOT NULL,
    jurisdiction                TEXT,

    contradiction_type          TEXT NOT NULL,
    applicable_domains          TEXT[] DEFAULT '{}',
    applicable_program_types    TEXT[] DEFAULT '{}',

    severity_override           TEXT,
    authority_override          TEXT,
    consequence_override        TEXT,

    description                 TEXT,
    regulatory_reference        TEXT,
    rationale                   TEXT,

    priority                    INTEGER NOT NULL DEFAULT 100,
    active                      BOOLEAN NOT NULL DEFAULT true,

    created_at                  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contradiction_overlay_org_idx    ON contradiction_overlay_rules (organization_id);
CREATE INDEX IF NOT EXISTS contradiction_overlay_active_idx ON contradiction_overlay_rules (active);
CREATE UNIQUE INDEX IF NOT EXISTS contradiction_overlay_code_idx ON contradiction_overlay_rules (organization_id, rule_code);

-- ----------------------------------------------------------------------------
-- contradiction_consequence_log — record of executed consequences per finding
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contradiction_consequence_log (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             INTEGER NOT NULL,
    finding_id                  UUID NOT NULL
                                REFERENCES contradiction_findings(id) ON DELETE CASCADE,

    consequence_type            TEXT NOT NULL,
    consequence_object_id       TEXT,
    consequence_object_type     TEXT,

    executed_by                 TEXT,
    execution_status            TEXT NOT NULL DEFAULT 'executed',
    notes                       TEXT,

    created_at                  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contradiction_conseq_org_idx     ON contradiction_consequence_log (organization_id);
CREATE INDEX IF NOT EXISTS contradiction_conseq_finding_idx ON contradiction_consequence_log (finding_id);

-- ----------------------------------------------------------------------------
-- contradiction_decision_links — link findings to governance decisions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contradiction_decision_links (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             INTEGER NOT NULL,
    contradiction_id            UUID NOT NULL
                                REFERENCES contradiction_findings(id) ON DELETE CASCADE,
    decision_id                 TEXT NOT NULL,
    link_type                   TEXT NOT NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT now(),

    UNIQUE (organization_id, contradiction_id, decision_id, link_type)
);

CREATE INDEX IF NOT EXISTS contradiction_decision_org_idx     ON contradiction_decision_links (organization_id);
CREATE INDEX IF NOT EXISTS contradiction_decision_finding_idx ON contradiction_decision_links (contradiction_id);
