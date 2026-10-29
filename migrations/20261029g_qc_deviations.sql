-- =============================================================================
-- 20261029g_qc_deviations.sql — the GMP deviation record (D2, 2026-10-29, P-57)
-- =============================================================================
-- WHY. A deviation is a departure from an approved procedure or instruction
-- (21 CFR 211.192, 211.100(b); EU GMP Chapter 1, 1.4(xiv)) and is often not
-- product-keyed: a missed environmental-monitoring reading, a skipped step.
-- The nonconformance register (qms_nonconforming_products) is keyed to a
-- product and a lot, so it cannot hold one. P-57
-- (docs/LAUNCH_DEFINITION_OF_DONE.md) gives deviations their own record in
-- Quality. Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/p57-deviations/.
--
-- WHAT. The table shared/schema/qc-schemas.ts has defined as qcDeviations
-- since the QC module, which nothing ever created: the /api/qc/deviations
-- routes over it were a stub that answered 501 (server/storage.ts). It is
-- created here as that definition reads, with one correction: client_workspace_id
-- is nullable. Quality records are the organization's, not a CRO workspace's,
-- and the definition's NOT NULL would make every Quality write impossible.
-- It carries no foreign key, so this file does not depend on the base schema's
-- order.
--
-- Rule 1 (CLAUDE.md): every statement re-runs on every deploy. Each is
-- CREATE ... IF NOT EXISTS; nothing is altered or dropped. Public, with
-- organization_id INTEGER NOT NULL, so the tenant sweep at the end of the set
-- gives it its policy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS qc_deviations (
  id                      serial PRIMARY KEY,
  organization_id         integer NOT NULL REFERENCES organizations(id),
  client_workspace_id     integer,
  deviation_number        varchar(100) NOT NULL,
  deviation_type          varchar(50)  NOT NULL,          -- planned | unplanned
  classification          varchar(20)  NOT NULL,          -- minor | major | critical
  category                varchar(100),                   -- process | equipment | documentation | material | environmental | human_error
  title                   text NOT NULL,
  description             text NOT NULL,
  detected_date           timestamp NOT NULL,
  detected_by             text,
  location                text,
  department              varchar(100),
  batch_id                integer,
  batch_number            varchar(100),
  product_name            text,
  equipment_id            integer,
  process_step            text,
  impact_assessment       json,
  impact_level            varchar(20),
  investigation_required  boolean DEFAULT true,
  investigation_status    varchar(50) DEFAULT 'pending',
  investigation_details   json,
  root_cause_identified   boolean DEFAULT false,
  root_cause              text,
  contributing_factors    json,
  capa_required           boolean DEFAULT false,
  capa_id                 integer,
  capa_number             varchar(100),
  corrective_actions      json,
  preventive_actions      json,
  immediate_actions       json,
  resolution_description  text,
  effectiveness_check     json,
  trending_data           json,
  status                  varchar(50) DEFAULT 'open',    -- open | under_investigation | pending_approval | closed
  priority                varchar(20) DEFAULT 'medium',
  assigned_to             text,
  target_closure_date     date,
  actual_closure_date     date,
  reviewed_by             text,
  reviewed_date           timestamp,
  approved_by             text,
  approved_date           timestamp,
  qa_approved_by          text,
  qa_approved_date        timestamp,
  attachments             json,
  notes                   text,
  metadata                json,
  created_at              timestamp NOT NULL DEFAULT now(),
  updated_at              timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deviation_number_qc_idx ON qc_deviations (deviation_number, organization_id);
CREATE INDEX IF NOT EXISTS deviation_classification_idx ON qc_deviations (classification);
CREATE INDEX IF NOT EXISTS deviation_status_qc_idx ON qc_deviations (status);
CREATE INDEX IF NOT EXISTS deviation_batch_qc_idx ON qc_deviations (batch_id);
CREATE INDEX IF NOT EXISTS deviation_org_detected_idx ON qc_deviations (organization_id, detected_date DESC);
