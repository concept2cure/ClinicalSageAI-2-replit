-- ============================================================================
-- Grant Budget Lines & Expenditures (C2C-14 extension)
-- 2 CFR 200.308 (revisions) / 200.403 (allowable costs) / 200.414 (F&A)
-- ============================================================================
--
-- Per-award budget by cost category and the actual expenditures booked against
-- it. budgetVsActual reconciles the two (per-category budgeted/actual/remaining,
-- over-budget + over-allocation flags). The budget may not over-allocate the
-- award amount — enforced when adding a budget line.
--
-- Schema:  shared/schema/grants.ts (grantBudgetLines, grantExpenditures)
-- Service: server/services/grants/grants-service.ts
-- Logic:   server/services/grants/grants-logic.ts (budgetVsActual, computeIndirectCost)
-- Routes:  server/routes/grants.ts (/api/grants/awards/:id/budget|expenditures)
-- ============================================================================

CREATE TABLE IF NOT EXISTS grant_budget_lines (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  award_id          integer NOT NULL REFERENCES grant_awards(id),
  category          text NOT NULL CHECK (category IN ('personnel','fringe','equipment','travel','supplies','contractual','construction','other_direct','indirect')),
  budgeted_amount   numeric(14,2) NOT NULL,
  indirect_rate_pct numeric(6,3),
  notes             text,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_budget_lines_org   ON grant_budget_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_budget_lines_award ON grant_budget_lines(award_id);

CREATE TABLE IF NOT EXISTS grant_expenditures (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  award_id          integer NOT NULL REFERENCES grant_awards(id),
  category          text NOT NULL CHECK (category IN ('personnel','fringe','equipment','travel','supplies','contractual','construction','other_direct','indirect')),
  amount            numeric(14,2) NOT NULL,
  expenditure_date  date,
  description       text,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_expenditures_org   ON grant_expenditures(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_expenditures_award ON grant_expenditures(award_id);
