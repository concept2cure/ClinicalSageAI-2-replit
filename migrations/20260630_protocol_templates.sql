-- ============================================================================
-- Protocol Templates Library (Capability C2C-20a)
-- ============================================================================
-- Org-reusable protocol templates: named, kind-scoped section presets that can be
-- cloned into a new protocol_document or saved from an existing one. CHECK-
-- constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-templates.ts
-- Service: server/services/protocol-templates/*
-- Routes:  server/routes/protocol-templates.ts (/api/protocol-templates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_templates (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  name            text NOT NULL,
  protocol_kind   text NOT NULL CHECK (protocol_kind IN ('iacuc','irb','clinical','ibc')),
  design_type     text,
  description     text,
  source          text NOT NULL DEFAULT 'org' CHECK (source IN ('system','org')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_templates_org  ON protocol_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_templates_kind ON protocol_templates(organization_id, protocol_kind);

CREATE TABLE IF NOT EXISTS protocol_template_sections (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  template_id     integer NOT NULL REFERENCES protocol_templates(id),
  section_key     text NOT NULL,
  title           text NOT NULL,
  content         text,
  required        boolean NOT NULL DEFAULT true,
  order_index     integer NOT NULL DEFAULT 0,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_template_sections_org      ON protocol_template_sections(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_template_sections_template ON protocol_template_sections(template_id);
