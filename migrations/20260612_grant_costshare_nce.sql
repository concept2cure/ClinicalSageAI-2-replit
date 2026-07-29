-- ============================================================================
-- Grant Cost-Share + No-Cost Extensions (C2C-14 extension)
-- 2 CFR 200.306 (cost sharing) + 2 CFR 200.308 (period extensions)
-- ============================================================================
--
-- Cost share: a committed match on the award (grant_awards.cost_share_committed)
-- and a ledger of actual contributions; costShareStatus reconciles the two.
-- No-cost extensions: period-of-performance extensions; the first ≤12-month
-- extension is within grantee authority, otherwise sponsor prior approval is
-- required. Approving an NCE moves grant_awards.period_end.
--
-- Schema:  shared/schema/grants.ts (grantCostShareContributions, grantNceRecords)
-- Service: server/services/grants/grants-service.ts
-- Logic:   server/services/grants/grants-logic.ts (costShareStatus, evaluateNce)
-- ============================================================================

ALTER TABLE grant_awards ADD COLUMN IF NOT EXISTS cost_share_committed numeric(14,2);

CREATE TABLE IF NOT EXISTS grant_cost_share_contributions (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  award_id          integer NOT NULL REFERENCES grant_awards(id),
  source            text NOT NULL CHECK (source IN ('institutional','third_party','in_kind','other')),
  amount            numeric(14,2) NOT NULL,
  contribution_date date,
  description       text,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_cost_share_org   ON grant_cost_share_contributions(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_cost_share_award ON grant_cost_share_contributions(award_id);

CREATE TABLE IF NOT EXISTS grant_nce_records (
  id                        serial PRIMARY KEY,
  organization_id           integer NOT NULL REFERENCES organizations(id),
  award_id                  integer NOT NULL REFERENCES grant_awards(id),
  original_end_date         date,
  new_end_date              date NOT NULL,
  months                    integer,
  authority                 text CHECK (authority IN ('grantee','sponsor')),
  requires_sponsor_approval boolean NOT NULL DEFAULT false,
  reason                    text,
  status                    text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','denied')),
  approved_by               integer REFERENCES users(id),
  approved_at               timestamptz,
  created_by                integer NOT NULL REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_nce_org   ON grant_nce_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_nce_award ON grant_nce_records(award_id);
