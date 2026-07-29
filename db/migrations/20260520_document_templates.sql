-- =============================================================================
-- Document Template Registry
--
-- A canonical, cross-tenant registry of regulatory document templates per
-- (agency × document_type × submission_type) tuple. Lets AnA pick the right
-- template for the user's context — protocol vs IB vs Module 3 CMC vs
-- 510(k) substantial-equivalence package vs response letter — and validate
-- drafts against the section schema before they ship.
--
-- Why this matters: a "Module 3 CMC" rendered for FDA, EMA, and PMDA looks
-- materially different — different forms in Module 1, different QOS scope,
-- different regional information. Without a structured template the LLM
-- defaults to a generic CTD outline that fails agency-specific review.
--
-- Tables:
--   intelligence.document_templates    canonical template per (agency, doc_type, submission_type)
--   intelligence.template_sections     ordered section schema per template
--   intelligence.template_validations  per-draft conformance result, linked back to ana_interactions
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS intelligence;

-- ─────────────────────────────────────────────────────────────────────────────
-- Document templates — top-level registry.
--
-- Each row is a canonical template for one (agency × document_type ×
-- submission_type [× indication_area]) tuple. Variants share a base via
-- `base_template_id`; the read path resolves to the most specific matching
-- variant first, falling back to the base when the variant isn't authored.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.document_templates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code         TEXT NOT NULL,             -- 'fda_nda_m3_cmc', 'ema_maa_m1_application_form', etc.
    template_name         TEXT NOT NULL,
    version               TEXT NOT NULL DEFAULT '1.0',

    -- Routing dimensions (closed enums; binners match those in ana-failure-learning).
    agency                TEXT NOT NULL,             -- 'fda' | 'ema' | 'pmda' | 'mhra' | 'hc' | 'swissmedic' | 'cross_agency'
    document_type         TEXT NOT NULL,             -- 'protocol' | 'ib' | 'cmc' | 'labeling' | 'cer' | 'response_letter' | 'section' | 'briefing_package' | 'meeting_minutes' | 'other'
    submission_type       TEXT,                      -- 'NDA' | 'BLA' | 'IND' | 'ANDA' | '505b2' | '510k' | 'PMA' | 'DeNovo' | 'MAA' | 'CTA' | 'NDS' | 'ANDS' | 'TYPE_IA' | 'TYPE_IB' | 'TYPE_II' | NULL
    indication_area       TEXT,                      -- 'oncology' | 'cns' | ... | NULL means any
    module_path           TEXT,                      -- '1', '2.3', '3.2.S', '4.2', '5.3.5' etc. NULL when not a module-scoped doc

    -- Variant hierarchy.
    base_template_id      UUID REFERENCES intelligence.document_templates(id),

    -- Content & rules.
    description           TEXT,
    formatting_rules      JSONB NOT NULL DEFAULT '{}', -- { pageSize, fontFamily, headingStyle, citationStyle, sectionNumbering, ... }
    agency_specific_notes TEXT,                       -- short reviewer-facing notes ("EMA expects benefit-risk in §2.5", etc.)

    -- Source & lifecycle.
    source_reference      TEXT,                      -- ICH M4Q, 21 CFR 314.50, EMA Guideline EMEA/H/EWP/..., etc.
    status                TEXT NOT NULL DEFAULT 'active', -- 'active' | 'deprecated' | 'draft'
    last_verified_at      TIMESTAMPTZ,               -- last manual or automated guidance review
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (template_code, version)
);

CREATE INDEX IF NOT EXISTS idx_dt_routing
    ON intelligence.document_templates(agency, document_type, submission_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_dt_base
    ON intelligence.document_templates(base_template_id);
CREATE INDEX IF NOT EXISTS idx_dt_indication
    ON intelligence.document_templates(indication_area) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- Template sections — ordered schema rows for each template.
--
-- Stored as rows rather than a JSONB blob so we can index / query / mutate
-- sections individually as guidance evolves. `ordering` is sparse-numeric so
-- inserts don't require rewriting siblings.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.template_sections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID NOT NULL REFERENCES intelligence.document_templates(id) ON DELETE CASCADE,
    section_code        TEXT NOT NULL,             -- '1.1', '2.3', '3.2.P.2', or freeform key
    section_title       TEXT NOT NULL,
    ordering            INTEGER NOT NULL,          -- sparse; assign 100, 200, 300 to allow insertion
    required            BOOLEAN NOT NULL DEFAULT TRUE,
    criticality         TEXT NOT NULL DEFAULT 'important', -- 'blocking' | 'important' | 'supporting'

    -- Authoring guidance.
    content_guidance    TEXT,                       -- what reviewers expect to see, short prose
    required_elements   JSONB NOT NULL DEFAULT '[]', -- ['benefit-risk statement', 'PIP statement', 'sample size justification'] etc.
    citation_rules      JSONB NOT NULL DEFAULT '{}', -- { 'styleGuide': 'icmje', 'minimumCitations': 5, ... }
    agency_quirks       TEXT,                       -- short note on things that differ from the cross-agency base

    -- Validation hints (consumed by template-validator).
    min_words           INTEGER,
    max_words           INTEGER,
    forbidden_phrases   JSONB NOT NULL DEFAULT '[]',
    required_phrases    JSONB NOT NULL DEFAULT '[]',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_id, section_code)
);

CREATE INDEX IF NOT EXISTS idx_ts_template_order
    ON intelligence.template_sections(template_id, ordering);

-- ─────────────────────────────────────────────────────────────────────────────
-- Template validations — per-draft conformance results.
--
-- Written by the template validator each time a draft is scored against a
-- template. The orchestrator surfaces aggregated metrics to the UI and feeds
-- the most common violations into failure_patterns so AnA learns format
-- mistakes the same way it learns regulatory mistakes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.template_validations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     BIGINT NOT NULL,
    project_id          BIGINT,
    artifact_id         TEXT,
    template_id         UUID NOT NULL REFERENCES intelligence.document_templates(id) ON DELETE CASCADE,

    conformance_score   DOUBLE PRECISION NOT NULL,  -- 0..1
    missing_required    JSONB NOT NULL DEFAULT '[]', -- [{ section_code, section_title }]
    weak_sections       JSONB NOT NULL DEFAULT '[]', -- below recommended word count etc.
    violations          JSONB NOT NULL DEFAULT '[]', -- [{ section_code, rule, message }]

    validated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validator_version   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tv_org_project ON intelligence.template_validations(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tv_template    ON intelligence.template_validations(template_id);
CREATE INDEX IF NOT EXISTS idx_tv_validated   ON intelligence.template_validations(validated_at DESC);

COMMIT;
