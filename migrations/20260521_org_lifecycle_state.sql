-- ============================================================================
-- Organization Lifecycle State — beta self-serve trial state machine
-- Branch: claude/beta-readiness-assessment-F37Iv
-- Plan: /root/.claude/plans/mossy-dancing-dusk.md (Track A foundation)
-- ============================================================================
--
-- Layers a canonical lifecycle state on top of the existing organizations
-- table (which already carries Stripe-derived payment_status, trial_ends_at,
-- and status). The canonical states are:
--
--   account_created → trial_active → (trial_expired | billing_active)
--                                  → billing_pending → billing_active
--                                  → suspended (terminal-ish)
--
-- Tenant isolation: both tables FK organizations(id) with ON DELETE CASCADE.
-- Once RLS_ENFORCE=on, queries are filtered by `app.current_tenant_id`
-- through the policies installed by migrations/0021_enable_rls_everywhere.sql.
-- The policies match any table with an `organization_id` column, so no
-- additional policy is needed here.
--
-- See shared/schema/org-lifecycle.ts for the Drizzle definition, closed-enum
-- constants, and legal-transition map. The service that enforces transition
-- legality is server/services/lifecycle/org-lifecycle.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- org_lifecycle_state — one row per organization, holds the current state
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_lifecycle_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id INTEGER NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,

    state           VARCHAR(32) NOT NULL,

    entered_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Optional ISO timestamp when this state should auto-evaluate
    -- (e.g. trial_expires_at for trial_active). The trial-expiry job
    -- reads this column to know which orgs to flip.
    evaluate_at     TIMESTAMP WITH TIME ZONE,

    metadata        JSONB DEFAULT '{}'::jsonb,

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_lifecycle_state_org_idx
    ON org_lifecycle_state(organization_id);

CREATE INDEX IF NOT EXISTS org_lifecycle_state_state_idx
    ON org_lifecycle_state(state);

CREATE INDEX IF NOT EXISTS org_lifecycle_state_evaluate_at_idx
    ON org_lifecycle_state(evaluate_at);

-- ----------------------------------------------------------------------------
-- org_lifecycle_state_history — immutable transition log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_lifecycle_state_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id INTEGER NOT NULL
                    REFERENCES organizations(id) ON DELETE CASCADE,

    from_state      VARCHAR(32),
    to_state        VARCHAR(32) NOT NULL,

    -- Trigger source — varchar (not enum) to allow new triggers without
    -- migration churn. See ORG_LIFECYCLE_TRIGGERS in
    -- shared/schema/org-lifecycle.ts for the canonical list.
    trigger         VARCHAR(32) NOT NULL,

    reason          TEXT,

    -- Whether the legal-transition gate was overridden. JSONB rather than
    -- BOOLEAN to keep parity with the schema's other audit detail fields.
    forced          JSONB DEFAULT 'false'::jsonb,

    actor_user_id   INTEGER,

    metadata        JSONB DEFAULT '{}'::jsonb,

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_lifecycle_history_org_idx
    ON org_lifecycle_state_history(organization_id);

CREATE INDEX IF NOT EXISTS org_lifecycle_history_org_created_idx
    ON org_lifecycle_state_history(organization_id, created_at);

CREATE INDEX IF NOT EXISTS org_lifecycle_history_trigger_idx
    ON org_lifecycle_state_history(trigger);

COMMENT ON TABLE org_lifecycle_state IS
    'Canonical onboarding/billing lifecycle state per organization. Layers on top of organizations.payment_status. State machine defined in shared/schema/org-lifecycle.ts.';

COMMENT ON TABLE org_lifecycle_state_history IS
    'Immutable transition log for org_lifecycle_state. Every transition (including forced overrides) lands here for audit.';
