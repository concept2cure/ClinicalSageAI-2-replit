-- ============================================================================
-- NIH Other Support document builder (Capability C2C-24A)
-- ============================================================================
--
-- An NIH "Other Support" document for a PD/PI or senior/key person listing all
-- resources (financial and in-kind, foreign and domestic) supporting their
-- research, with committed person-months, active/pending status, major goals and
-- an overlap statement per project. Required at Just-in-Time / RPPR and digitally
-- certified via SciENcv since FORMS-H (eff. 2023-01-25). Grounded in NIH GPS 2.5.1
-- and the research-security disclosure notices NOT-OD-19-114 / NOT-OD-21-073.
--
-- Soft-links to research_personnel(id) via personnel_id and grant_proposals(id)
-- via grant_proposal_id (nullable, no FK). CHECK-constrained status/type enums;
-- governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/other-support.ts
-- Service: server/services/other-support/*
-- Routes:  server/routes/other-support.ts (/api/other-support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS other_support_documents (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  personnel_id      integer,
  grant_proposal_id integer,
  person_name       text NOT NULL,
  era_commons_id    text,
  role              text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','certified','superseded')),
  certified_by      integer REFERENCES users(id),
  certified_at      timestamptz,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_other_support_docs_org       ON other_support_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_other_support_docs_personnel ON other_support_documents(personnel_id);
CREATE INDEX IF NOT EXISTS idx_other_support_docs_proposal  ON other_support_documents(grant_proposal_id);

CREATE TABLE IF NOT EXISTS other_support_entries (
  id                     serial PRIMARY KEY,
  organization_id        integer NOT NULL REFERENCES organizations(id),
  document_id            integer NOT NULL REFERENCES other_support_documents(id),
  support_type           text NOT NULL DEFAULT 'grant' CHECK (support_type IN ('grant','contract','in_kind','other')),
  project_title          text NOT NULL,
  funding_source         text NOT NULL,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
  is_foreign             boolean NOT NULL DEFAULT false,
  foreign_country        text,
  person_months_calendar numeric(6,2) NOT NULL DEFAULT 0,
  person_months_academic numeric(6,2) NOT NULL DEFAULT 0,
  person_months_summer   numeric(6,2) NOT NULL DEFAULT 0,
  major_goals            text,
  overlap_statement      text,
  award_identifier       text,
  order_index            integer NOT NULL DEFAULT 0,
  created_by             integer NOT NULL REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_other_support_entries_org ON other_support_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_other_support_entries_doc ON other_support_entries(document_id);
