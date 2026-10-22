// shared/schema.ts electronicSignatures, as the Part 11 PGlite suites build it
// (server/services/__tests__/part11-release-signature-single-write-path…).
// FKs omitted: their referents are out of scope here.
export const ELECTRONIC_SIGNATURES_READ_FIXTURE_DDL = `
CREATE TABLE electronic_signatures (
  id                      SERIAL PRIMARY KEY,
  document_id             INTEGER,
  version_id              INTEGER,
  signed_target           TEXT,
  binding_basis           TEXT,
  signature_type          VARCHAR(50) NOT NULL,
  signature_purpose       TEXT NOT NULL,
  signature_level         INTEGER DEFAULT 1,
  signer_id               INTEGER NOT NULL,
  signer_name             TEXT NOT NULL,
  signer_title            TEXT,
  signer_email            TEXT NOT NULL,
  authentication_method   VARCHAR(50) NOT NULL,
  authentication_timestamp TIMESTAMP NOT NULL,
  second_factor_verified  BOOLEAN DEFAULT false,
  signature_hash          VARCHAR(256) NOT NULL,
  signature_meaning       TEXT,
  signature_manifest      JSON,
  is_valid                BOOLEAN DEFAULT true,
  verification_status     VARCHAR(50),
  verification_date       TIMESTAMP,
  compliance_statement    TEXT,
  legal_disclaimer        TEXT,
  ip_address              VARCHAR(45),
  device_info             JSON,
  signed_at               TIMESTAMP NOT NULL DEFAULT now(),
  created_at              TIMESTAMP NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP DEFAULT now(),
  organization_id         INTEGER,
  bound_payload_digest    TEXT NOT NULL DEFAULT '',
  superseded_by           INTEGER,
  CONSTRAINT electronic_signatures_anchor_ck CHECK (
    (document_id IS NOT NULL AND version_id IS NOT NULL) OR signed_target IS NOT NULL
  )
);`;
