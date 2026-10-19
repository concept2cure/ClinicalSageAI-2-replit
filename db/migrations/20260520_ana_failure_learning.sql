-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: AnA failure learning — the per-turn interaction log, the cross-tenant
--          failure patterns, and the agency requirements promoted from them.
-- Integrity Risk Addressed: tenant isolation of unvalidated agency requirements.
--
-- AMENDED 2026-10-15 (in place, per CLAUDE.md RULE 1):
--   intelligence.agency_requirements gains organization_id BIGINT, the
--   organization whose member wrote the requirement. The table had no
--   organization column, and GET /api/regulatory-intelligence/agency-requirements
--   served every unvalidated row — free text any member of any tenant can write
--   through POST /patterns/:id/promote — to every tenant. The store now serves an
--   unvalidated row only to its writer's organization, a validated one to all.
--   Added in the CREATE TABLE (fresh databases) and by ADD COLUMN IF NOT EXISTS
--   after it (databases created earlier). Nullable on purpose: rows written
--   before this record no writer, none is guessed, and such a row is served to
--   no one until a curator validates it.
--
-- AMENDED 2026-10-17 (in place, per CLAUDE.md RULE 1):
--   Protect agency_requirements with ENABLE/FORCE RLS and command-specific
--   policies. Both deploy-time tenant sweeps miss this non-public BIGINT key;
--   the all-schema coverage gate correctly refused a fresh deployment. A
--   generic tenant policy would also hide validated, canonical requirements
--   from other organizations. SELECT therefore admits validated rules and
--   only the current organization's unvalidated suggestions; legacy NULL-owner
--   suggestions and rejected rows remain hidden. INSERT requires the current
--   organization. Validation authority remains the route's live platform-curator
--   check, never a request-body validator name. There are no UPDATE/DELETE
--   callers or policies. Instrumented runtime queries apply verified request
--   tenant scope. Policy creation is guarded for every-deploy replay; no rows,
--   owners or validation states are changed by this amendment.
-- =============================================================================
-- AnA Failure Learning — extension of the Regulatory Intelligence layer
--
-- Every AnA conversation turn whose outcome is anything other than "accepted"
-- is a signal: the model said something the user had to edit, reject,
-- regenerate, or abandon. Across tenants, repeated failures on the same
-- (agency × document_type × intent) tuple reveal:
--   - Latent agency-specific requirements AnA didn't know
--   - Document-type-specific phrasing the model gets wrong
--   - Intent classifications the model misroutes
--
-- The learning happens in three tables:
--
--   intelligence.ana_interactions   — per-turn log (tenant-scoped)
--   intelligence.failure_patterns   — DP-anonymized cross-tenant clusters
--   intelligence.agency_requirements — discovered per-agency rules
--
-- The pattern table is the moat. A single tenant's corrections stay private;
-- when N≥3 tenants surface the same corrected pattern, we promote it to a
-- cross-platform rule AnA consults on every future relevant turn.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS intelligence;

-- ─────────────────────────────────────────────────────────────────────────────
-- AnA interactions — append-only log of every conversation turn whose outcome
-- the system recorded. Tenant-scoped; the only field that ever crosses tenant
-- boundaries is the `pattern_fingerprint`, which is a hashed projection that
-- can be safely aggregated.
--
-- `prompt_summary` / `response_summary` are deliberately sanitized
-- (no PII, no proprietary content) — the user-correction text is stored as
-- `correction_text` and is also sanitized at write time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.ana_interactions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      BIGINT NOT NULL,
    project_id           BIGINT,
    user_id              BIGINT,
    session_id           TEXT,                                -- opaque AnA session
    artifact_id          TEXT,                                -- doc or section being edited (optional)

    -- Closed-enum dimensions. Match the binners in outcome-feature-extraction.
    agency               TEXT NOT NULL,                       -- 'fda' | 'ema' | 'pmda' | 'mhra' | 'hc' | 'swissmedic' | 'other'
    document_type        TEXT NOT NULL,                       -- 'protocol' | 'ib' | 'cmc' | 'labeling' | 'cer' | 'response_letter' | 'section' | 'other'
    submission_type      TEXT,                                -- same enum as the risk-model
    intent_class         TEXT NOT NULL,                       -- 'draft' | 'review' | 'explain' | 'fix' | 'compare' | 'extract' | 'plan' | 'other'

    -- The signal — what happened.
    outcome              TEXT NOT NULL,                       -- 'accepted' | 'edited' | 'rejected' | 'regenerated' | 'abandoned'
    ana_confidence       DOUBLE PRECISION,                    -- 0..1 if AnA reported one
    user_corrected       BOOLEAN NOT NULL DEFAULT FALSE,      -- did the user provide an explicit correction?

    -- Content (sanitized at the service layer — never raw prompt/response).
    prompt_summary       TEXT,                                -- short summary, ≤500 chars
    response_summary     TEXT,                                -- short summary, ≤500 chars
    correction_text      TEXT,                                -- the user's correction, sanitized

    -- Fingerprint of (agency, document_type, intent_class, prompt_summary).
    -- SHA-256 hex over the canonicalized tuple — lets the aggregator cluster
    -- similar failures across tenants without exposing the underlying text.
    pattern_fingerprint  TEXT NOT NULL,

    recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_org             ON intelligence.ana_interactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_project         ON intelligence.ana_interactions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_outcome         ON intelligence.ana_interactions(outcome);
CREATE INDEX IF NOT EXISTS idx_ai_fingerprint     ON intelligence.ana_interactions(pattern_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ai_agency_doctype  ON intelligence.ana_interactions(agency, document_type);
CREATE INDEX IF NOT EXISTS idx_ai_recorded_at     ON intelligence.ana_interactions(recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Failure patterns — clustered failures promoted to cross-tenant memory.
-- A pattern is promoted from raw interactions when:
--   1. ≥ 3 distinct tenants have hit the same pattern_fingerprint
--   2. Aggregate failure count ≥ 5
--   3. A clear majority correction exists (k-best correction's frequency
--      passes a quorum threshold at extraction time)
--
-- Each row carries the suggested correction the aggregator believes best
-- resolves the failure, plus metadata for ranking and decay.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.failure_patterns (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_fingerprint      TEXT NOT NULL UNIQUE,
    agency                   TEXT NOT NULL,
    document_type            TEXT NOT NULL,
    intent_class             TEXT NOT NULL,

    -- Best-known correction across tenants.
    suggested_correction     TEXT NOT NULL,
    correction_source        TEXT NOT NULL DEFAULT 'aggregated_consensus', -- 'aggregated_consensus' | 'curator_override' | 'agency_doc_match'

    -- Strength signals.
    failure_count            INTEGER NOT NULL,
    tenant_count             INTEGER NOT NULL,                -- distinct contributing tenants
    correction_quorum        DOUBLE PRECISION NOT NULL,       -- fraction of failures matching the chosen correction
    confidence               DOUBLE PRECISION NOT NULL,       -- derived overall confidence in [0,1]

    last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extractor_version        TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'superseded' | 'curator_disabled'
);

CREATE INDEX IF NOT EXISTS idx_fp_lookup ON intelligence.failure_patterns(agency, document_type, intent_class) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fp_status ON intelligence.failure_patterns(status);
CREATE INDEX IF NOT EXISTS idx_fp_extracted ON intelligence.failure_patterns(extracted_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Agency requirements — structured requirement rules AnA learned from observed
-- corrections. Distinct from failure_patterns: a requirement is the
-- declarative rule the corrections implied (e.g., "EMA requires PIP statement
-- in §1.6"), whereas a pattern is the conversational fix.
--
-- Validation lifecycle: 'unvalidated' → 'validated' (curator) | 'rejected'.
-- Unvalidated rows are surfaced to AnA at lower confidence; validated rows
-- enter the canonical rule set.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.agency_requirements (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency                   TEXT NOT NULL,
    document_type            TEXT NOT NULL,
    submission_type          TEXT,
    requirement_summary      TEXT NOT NULL,                   -- the rule, short
    requirement_detail       TEXT,                            -- expanded text / quote
    source_pattern_id        UUID REFERENCES intelligence.failure_patterns(id),
    tenant_count             INTEGER NOT NULL,
    occurrence_count         INTEGER NOT NULL,
    confidence               DOUBLE PRECISION NOT NULL,
    validation_status        TEXT NOT NULL DEFAULT 'unvalidated', -- 'unvalidated' | 'validated' | 'rejected'
    validated_by             TEXT,
    validated_at             TIMESTAMPTZ,
    discovered_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The writer's organization (2026-10-15, see header). NULL: not recorded.
    organization_id          BIGINT
);

-- Databases whose table predates the column (2026-10-15, see header).
ALTER TABLE intelligence.agency_requirements ADD COLUMN IF NOT EXISTS organization_id BIGINT;

ALTER TABLE intelligence.agency_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.agency_requirements FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'intelligence' AND tablename = 'agency_requirements'
      AND policyname = 'tenant_isolation_policy'
  ) THEN
    CREATE POLICY tenant_isolation_policy ON intelligence.agency_requirements
      FOR SELECT USING (
        validation_status = 'validated'
        OR (
          validation_status = 'unvalidated'
          AND organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::BIGINT
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'intelligence' AND tablename = 'agency_requirements'
      AND policyname = 'agency_requirements_insert_own_org'
  ) THEN
    CREATE POLICY agency_requirements_insert_own_org ON intelligence.agency_requirements
      FOR INSERT WITH CHECK (
        organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::BIGINT
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ar_lookup     ON intelligence.agency_requirements(agency, document_type);
CREATE INDEX IF NOT EXISTS idx_ar_validation ON intelligence.agency_requirements(validation_status);
CREATE INDEX IF NOT EXISTS idx_ar_discovered ON intelligence.agency_requirements(discovered_at DESC);

COMMIT;
