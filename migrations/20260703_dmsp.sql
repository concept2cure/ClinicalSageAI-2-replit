-- ============================================================================
-- NIH Data Management & Sharing Plan (DMSP) builder (Capability C2C-23)
-- ============================================================================
--
-- The data-sharing-plan side of grant proposal development: a DMS plan composed
-- of the six required elements of the NIH Data Management & Sharing Policy
-- (NOT-OD-21-013, effective 2023-01-25), each tracked for whether it has been
-- addressed + its narrative content so completeness can be scored before the plan
-- is finalized. Soft-links to a grant_proposals(id) and/or protocol_documents(id).
--
-- CHECK-constrained status enums; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/dmsp.ts
-- Service: server/services/dmsp/*
-- Routes:  server/routes/dmsp.ts (/api/dmsp)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dms_plans (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  grant_proposal_id    integer,
  protocol_document_id integer,
  title                text NOT NULL,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_development','in_review','final')),
  finalized_by         integer REFERENCES users(id),
  finalized_at         timestamptz,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_dms_plans_org      ON dms_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_dms_plans_proposal ON dms_plans(grant_proposal_id);
CREATE INDEX IF NOT EXISTS idx_dms_plans_doc      ON dms_plans(protocol_document_id);

CREATE TABLE IF NOT EXISTS dms_plan_elements (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  plan_id              integer NOT NULL REFERENCES dms_plans(id),
  element_key          text NOT NULL,
  title                text NOT NULL,
  content              text,
  addressed            boolean NOT NULL DEFAULT false,
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dms_plan_elements_org  ON dms_plan_elements(organization_id);
CREATE INDEX IF NOT EXISTS idx_dms_plan_elements_plan ON dms_plan_elements(plan_id);
