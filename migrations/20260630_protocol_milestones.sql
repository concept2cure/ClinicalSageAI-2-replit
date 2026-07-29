-- ============================================================================
-- Protocol Milestones / Timeline (Capability C2C-20b)
-- ============================================================================
-- Per-protocol milestone timeline (IRB submission, first/last subject, database
-- lock, CSR, …) with target dates and status. CHECK-constrained enums;
-- governed/audited.
--
-- Schema:  shared/schema/protocol-milestones.ts
-- Service: server/services/protocol-milestones/*
-- Routes:  server/routes/protocol-milestones.ts (/api/protocol-milestones)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_milestones (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  name                 text NOT NULL,
  milestone_type       text NOT NULL DEFAULT 'other'
                         CHECK (milestone_type IN ('protocol_approval','irb_submission','site_activation','first_subject','last_subject','enrollment_complete','database_lock','csr','closeout','other')),
  target_date          date,
  actual_date          date,
  status               text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','met','missed','cancelled')),
  notes                text,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_milestones_org ON protocol_milestones(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_milestones_doc ON protocol_milestones(protocol_document_id);
