-- ============================================================================
-- Protocol Amendments — amendment authoring (Capability C2C-18a)
-- ============================================================================
--
-- A versioned amendment record against a protocol_documents row, classified by
-- type (major / minor / administrative) and by whether it touches informed
-- consent or subject risk, with a line-item change list. The classification
-- drives the review path: minor changes to approved research may be reviewed by
-- expedited procedure (45 CFR 46.110 / 21 CFR 56.110); major or consent/risk-
-- affecting changes require full convened-board review and may trigger re-consent
-- (45 CFR 46.109 / .116). CHECK-constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-amendments.ts
-- Service: server/services/protocol-amendments/*
-- Routes:  server/routes/protocol-amendments.ts (/api/protocol-amendments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_amendments (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  amendment_number     text,
  title                text NOT NULL,
  rationale            text,
  amendment_type       text CHECK (amendment_type IN ('major','minor','administrative')),
  affects_consent      boolean NOT NULL DEFAULT false,
  affects_risk         boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected','implemented')),
  submitted_date       date,
  decided_date         date,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_amendments_org ON protocol_amendments(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_amendments_doc ON protocol_amendments(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_amendment_changes (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  amendment_id       integer NOT NULL,
  section_ref        text,
  change_description text NOT NULL,
  previous_text      text,
  proposed_text      text,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_amendment_changes_org ON protocol_amendment_changes(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_amendment_changes_amd ON protocol_amendment_changes(amendment_id);
