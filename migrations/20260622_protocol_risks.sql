-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Protocol risk register (ICH E6(R3) Annex 1 §3.10 risk management).
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (clinical protocol risk management)
--   - Integrity Risk Addressed: a risk level recorded from ratings nobody made
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - AMENDED 2026-10-15: likelihood / impact lose their 'possible' /
--     'moderate' defaults (3 x 3 = 9, banded 'high', for a risk nobody rated).
--     Amended in place per CLAUDE.md RULE 1; this file is applied by the
--     migrations/ overlay only, so
--     migrations/20261015d_protocol_risk_ratings_no_default.sql (deploy set)
--     drops the defaults on databases provisioned before.
-- =============================================================================
-- ============================================================================
-- Protocol Risk Register (Capability C2C-19)
-- ============================================================================
--
-- Per-protocol risk assessment on a likelihood × impact matrix with mitigations
-- and a residual score, soft-linked to a protocol document. Scoring is
-- deterministic (protocol-risks-logic.ts). Grounded in ICH E6(R2) §5.0 (quality
-- risk management) / ISO 14971. CHECK-constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-risks.ts
-- Service: server/services/protocol-risks/*
-- Routes:  server/routes/protocol-risks.ts (/api/protocol-risks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_risks (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  category             text NOT NULL DEFAULT 'operational'
                         CHECK (category IN ('participant_safety','data_integrity','regulatory','operational','privacy','other')),
  description          text NOT NULL,
  likelihood           text NOT NULL CHECK (likelihood IN ('rare','unlikely','possible','likely','almost_certain')),
  impact               text NOT NULL CHECK (impact IN ('negligible','minor','moderate','major','severe')),
  mitigation           text,
  residual_likelihood  text CHECK (residual_likelihood IN ('rare','unlikely','possible','likely','almost_certain')),
  residual_impact      text CHECK (residual_impact IN ('negligible','minor','moderate','major','severe')),
  owner                text,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','accepted','closed')),
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_risks_org ON protocol_risks(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_risks_doc ON protocol_risks(protocol_document_id);
