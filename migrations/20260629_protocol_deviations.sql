-- ============================================================================
-- Protocol Deviations & CAPA (Capability C2C-18b)
-- ============================================================================
--
-- Captures protocol deviations against an authored protocol document, classifies
-- them by category/severity, flags reportability, and tracks Corrective And
-- Preventive Action (CAPA) items through to verified closure. A deviation may
-- only be closed once every linked CAPA action is completed/verified.
--
-- Soft-links to protocol_documents(id) via protocol_document_id. Reportability
-- timeliness follows 45 CFR 46.108(a)(4) and ICH E6(R2) §4.5.3/§5.20. CHECK-
-- constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-deviations.ts
-- Service: server/services/protocol-deviations/*
-- Routes:  server/routes/protocol-deviations.ts (/api/protocol-deviations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_deviations (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL REFERENCES protocol_documents(id),
  deviation_number     text,
  description          text NOT NULL,
  category             text NOT NULL DEFAULT 'other' CHECK (category IN ('enrollment','consent','procedure','safety','data','other')),
  severity             text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','major','critical')),
  is_reportable        boolean NOT NULL DEFAULT false,
  root_cause           text,
  discovered_date      date,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','capa_pending','closed')),
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_deviations_org    ON protocol_deviations(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_deviations_doc    ON protocol_deviations(protocol_document_id);
CREATE INDEX IF NOT EXISTS idx_protocol_deviations_status ON protocol_deviations(organization_id, status);

CREATE TABLE IF NOT EXISTS protocol_capa_actions (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  deviation_id    integer NOT NULL REFERENCES protocol_deviations(id),
  action          text NOT NULL,
  owner           text,
  due_date        date,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','verified')),
  completed_date  date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_capa_org       ON protocol_capa_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_capa_deviation ON protocol_capa_actions(deviation_id);
