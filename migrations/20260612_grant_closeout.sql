-- ============================================================================
-- Grant Closeout (Capability C2C-14 extension) — 2 CFR 200.344
-- ============================================================================
--
-- One closeout record per award tracking the four required federal closeout
-- deliverables: final performance report, final FFR (SF-425), final property
-- inventory (2 CFR 200.313), and reconciliation/liquidation of final invoices.
-- The closeout due date is the period of performance end + 120 days. Finalizing
-- a closeout is gated on all four items being complete and closes the award.
--
-- Schema:  shared/schema/grants.ts (grantCloseoutRecords)
-- Service: server/services/grants/grants-service.ts
-- Logic:   server/services/grants/grants-logic.ts (evaluateCloseout)
-- Routes:  server/routes/grants.ts (/api/grants/awards/:id/closeout ...)
-- ============================================================================

CREATE TABLE IF NOT EXISTS grant_closeout_records (
  id                           serial PRIMARY KEY,
  organization_id              integer NOT NULL REFERENCES organizations(id),
  award_id                     integer NOT NULL REFERENCES grant_awards(id),
  closeout_due_date            date,
  final_rppr_submitted         boolean NOT NULL DEFAULT false,
  final_rppr_date              date,
  final_ffr_submitted          boolean NOT NULL DEFAULT false,
  final_ffr_date               date,
  equipment_inventory_returned boolean NOT NULL DEFAULT false,
  final_invoices_reconciled    boolean NOT NULL DEFAULT false,
  deobligation_amount          numeric(14,2),
  status                       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','submitted','completed')),
  notes                        text,
  finalized_by                 integer REFERENCES users(id),
  finalized_at                 timestamptz,
  created_by                   integer NOT NULL REFERENCES users(id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  deleted_at                   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_closeout_org ON grant_closeout_records(organization_id);
-- One active closeout record per award.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grant_closeout_award ON grant_closeout_records(award_id) WHERE deleted_at IS NULL;
