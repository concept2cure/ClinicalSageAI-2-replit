-- ============================================================================
-- Lifecycle Obligation Tracking (Capability C2C-11)
-- ============================================================================
--
-- Post-approval recurring-obligation engine: variations (EU IA/IB/II),
-- supplements (FDA PAS/CBE/Annual Report), periodic safety reports (PSUR/PBRER
-- cadence), pediatric (PREA/PIP), renewals. A recurring obligation spawns dated
-- occurrences (events) so the calendar never slips.
--
-- Grounded in EU Reg 1234/2008, 21 CFR 314.70, GVP Module VII / ICH E2C, PREA /
-- EU PIP. Tenancy/audit mirror the platform; status/type columns CHECK-constrained.
--
-- Schema:  shared/schema/lifecycle.ts
-- Service: server/services/lifecycle-obligations/*
-- Routes:  server/routes/lifecycle.ts (/api/lifecycle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lifecycle_obligations (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  product_id        integer REFERENCES rim_products(id),
  submission_id     integer REFERENCES submissions(id),
  obligation_type   text NOT NULL CHECK (obligation_type IN ('variation','supplement','periodic_report','pediatric','renewal','annual_report')),
  region            text NOT NULL CHECK (region IN ('fda','eu','jp','mhra','other')),
  classification    text,
  title             text NOT NULL,
  status            text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_preparation','submitted','approved','rejected','overdue','closed')),
  due_date          date,
  submitted_date    date,
  recurrence_months integer,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_obligations_org     ON lifecycle_obligations(organization_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_obligations_product ON lifecycle_obligations(product_id);

CREATE TABLE IF NOT EXISTS lifecycle_obligation_events (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  obligation_id   integer NOT NULL REFERENCES lifecycle_obligations(id),
  period_start    date,
  period_end      date,
  due_date        date,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_preparation','submitted','approved','overdue')),
  submitted_date  date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_org        ON lifecycle_obligation_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_obligation ON lifecycle_obligation_events(obligation_id);
