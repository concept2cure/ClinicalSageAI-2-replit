-- EU SmPC (Summary of Product Characteristics) authoring-status store — the
-- per-section authoring state backing the v2 SmpcLabeling surface. The QRD
-- section catalog (numbers/titles) is static config in
-- server/services/labeling/smpc-qrd-catalog.ts; this store holds only the
-- per-org, per-section instance state (authoring status + optional content).
-- Readiness is computed on read by buildSmpcReadiness over the catalog + these
-- statuses. Org-scoped, FK-free, schema-only, idempotent. This is the EU
-- companion to the USPI c2c_labeling_pi store.

CREATE TABLE IF NOT EXISTS c2c_smpc_sections (
  organization_id  INTEGER     NOT NULL,
  section_number   TEXT        NOT NULL,   -- QRD number, e.g. '4.1'
  status           TEXT        NOT NULL DEFAULT 'draft',  -- missing | draft | review | final
  content          JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, section_number)
);
