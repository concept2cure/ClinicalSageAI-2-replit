-- ============================================================================
-- Grant Subawards / Subrecipient Monitoring (C2C-14 extension)
-- 2 CFR 200.331–200.332 (subrecipient monitoring) + 2 CFR 200.214 (debarment)
-- ============================================================================
--
-- Pass-through subawards under a prime award. A subaward may not be EXECUTED
-- until the subrecipient is screened against the SAM.gov exclusions list (not
-- suspended/debarred) and a risk assessment is recorded. The deterministic
-- eligibility gate (evaluateSubawardEligibility) enforces this at execute time.
--
-- Schema:  shared/schema/grants.ts (grantSubawards)
-- Service: server/services/grants/grants-service.ts
-- Logic:   server/services/grants/grants-logic.ts (evaluateSubawardEligibility)
-- Routes:  server/routes/grants.ts (/api/grants/awards/:id/subawards ...)
-- ============================================================================

CREATE TABLE IF NOT EXISTS grant_subawards (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  award_id          integer NOT NULL REFERENCES grant_awards(id),
  subrecipient_name text NOT NULL,
  subrecipient_uei  text,
  institution_type  text CHECK (institution_type IN ('higher_ed','nonprofit','commercial','foreign','government','other')),
  amount            numeric(14,2),
  period_start      date,
  period_end        date,
  risk_level        text CHECK (risk_level IN ('low','medium','high')),
  screen_status     text NOT NULL DEFAULT 'not_screened' CHECK (screen_status IN ('not_screened','cleared','excluded')),
  screen_date       date,
  screen_source     text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','screened','executed','terminated')),
  executed_by       integer REFERENCES users(id),
  executed_at       timestamptz,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_subawards_org   ON grant_subawards(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_subawards_award ON grant_subawards(award_id);
