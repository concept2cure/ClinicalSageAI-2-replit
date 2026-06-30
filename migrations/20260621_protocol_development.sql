-- ============================================================================
-- Protocol Development — structured protocol authoring (Capability C2C-17)
-- ============================================================================
--
-- The "build" side of research protocols: a versioned protocol document assembled
-- from templated sections (by protocol kind), with structured objectives/
-- endpoints, eligibility criteria, a schedule of assessments, a training-gated
-- study team, and a revision history. Soft-links to the governed protocol records
-- via (protocol_kind, linked_protocol_id).
--
-- Section templates follow ICH M11 / ICH E6(R2) (clinical), PHS Policy / AWA 9 CFR
-- 2.31 3Rs (IACUC), 45 CFR 46.111 (IRB). CHECK-constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-development.ts
-- Service: server/services/protocol-development/*
-- Routes:  server/routes/protocol-development.ts (/api/protocol-development)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_documents (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  protocol_kind      text NOT NULL CHECK (protocol_kind IN ('iacuc','irb','clinical','ibc')),
  linked_protocol_id integer,
  protocol_number    text,
  title              text NOT NULL,
  design_type        text CHECK (design_type IN ('interventional','observational','expanded_access','animal_study','basic_science','registry','other')),
  phase              text,
  therapeutic_area   text,
  version            text NOT NULL DEFAULT '0.1',
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_development','in_review','finalized','superseded')),
  synopsis           text,
  finalized_by       integer REFERENCES users(id),
  finalized_at       timestamptz,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_documents_org  ON protocol_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_documents_kind ON protocol_documents(organization_id, protocol_kind);

CREATE TABLE IF NOT EXISTS protocol_sections (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  section_key          text NOT NULL,
  title                text NOT NULL,
  content              text,
  required             boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','draft','complete')),
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_sections_org ON protocol_sections(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_sections_doc ON protocol_sections(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_objectives (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  objective_type       text NOT NULL DEFAULT 'primary' CHECK (objective_type IN ('primary','secondary','exploratory')),
  objective            text NOT NULL,
  endpoint             text,
  timepoint            text,
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_objectives_org ON protocol_objectives(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_objectives_doc ON protocol_objectives(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_eligibility_criteria (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  kind                 text NOT NULL CHECK (kind IN ('inclusion','exclusion')),
  criterion            text NOT NULL,
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_eligibility_org ON protocol_eligibility_criteria(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_eligibility_doc ON protocol_eligibility_criteria(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_schedule_visits (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  visit_name           text NOT NULL,
  timepoint            text,
  procedures           text[],
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_visits_org ON protocol_schedule_visits(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_visits_doc ON protocol_schedule_visits(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_team_members (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  personnel_id         integer REFERENCES research_personnel(id),
  user_id              integer REFERENCES users(id),
  member_name          text NOT NULL,
  role                 text NOT NULL DEFAULT 'co_investigator'
                         CHECK (role IN ('principal_investigator','co_investigator','sub_investigator','coordinator','biostatistician','data_manager','pharmacist','veterinarian','regulatory','other')),
  responsibilities     text,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_team_org ON protocol_team_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_team_doc ON protocol_team_members(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_versions (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  version              text NOT NULL,
  change_summary       text,
  snapshot             text,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_versions_org ON protocol_versions(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_versions_doc ON protocol_versions(protocol_document_id);
