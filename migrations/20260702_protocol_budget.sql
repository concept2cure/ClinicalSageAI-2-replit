-- ============================================================================
-- Protocol Budget & Feasibility (Capability C2C-22)
-- ============================================================================
-- Study-level budgeting: per-subject cost line items + study params (enrollment,
-- sponsor payment per subject, F&A rate) → deterministic feasibility verdict.
-- Indirect/F&A grounded in 2 CFR 200.414. CHECK-constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-budget.ts
-- Service: server/services/protocol-budget/*
-- Routes:  server/routes/protocol-budget.ts (/api/protocol-budget)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_budget_items (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  category             text NOT NULL DEFAULT 'other'
                         CHECK (category IN ('personnel','procedure','lab','imaging','overhead','equipment','patient_stipend','other')),
  description          text NOT NULL,
  unit_cost            numeric(14,2) NOT NULL DEFAULT 0,
  quantity_per_subject numeric(10,2) NOT NULL DEFAULT 1,
  payer                text NOT NULL DEFAULT 'sponsor' CHECK (payer IN ('sponsor','institution','other')),
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_budget_items_org ON protocol_budget_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_budget_items_doc ON protocol_budget_items(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_budget_params (
  id                          serial PRIMARY KEY,
  organization_id             integer NOT NULL REFERENCES organizations(id),
  protocol_document_id        integer NOT NULL,
  target_enrollment           integer NOT NULL DEFAULT 0,
  sponsor_payment_per_subject numeric(14,2),
  indirect_rate_pct           numeric(6,2),
  created_by                  integer NOT NULL REFERENCES users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_budget_params_org ON protocol_budget_params(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_budget_params_doc ON protocol_budget_params(protocol_document_id);
