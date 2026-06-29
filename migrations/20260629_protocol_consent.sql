-- ============================================================================
-- Informed Consent Form builder (Capability C2C-18d)
-- ============================================================================
--
-- The consent-authoring side of protocol development: a versioned informed-consent
-- form composed of the regulatory-required elements of consent (45 CFR 46.116),
-- each tracked for presence + content so completeness can be scored before
-- approval. Soft-links to a protocol_documents(id) record via protocol_document_id.
--
-- CHECK-constrained status enums; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/protocol-consent.ts
-- Service: server/services/protocol-consent/*
-- Routes:  server/routes/protocol-consent.ts (/api/protocol-consent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS consent_forms (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer,
  title                text NOT NULL,
  version              text NOT NULL DEFAULT '0.1',
  language             text NOT NULL DEFAULT 'en',
  reading_level        text,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','superseded')),
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_consent_forms_org ON consent_forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_consent_forms_doc ON consent_forms(protocol_document_id);

CREATE TABLE IF NOT EXISTS consent_form_elements (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  consent_form_id      integer NOT NULL REFERENCES consent_forms(id),
  element_key          text NOT NULL,
  title                text NOT NULL,
  content              text,
  required             boolean NOT NULL DEFAULT true,
  present              boolean NOT NULL DEFAULT false,
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_form_elements_org  ON consent_form_elements(organization_id);
CREATE INDEX IF NOT EXISTS idx_consent_form_elements_form ON consent_form_elements(consent_form_id);
