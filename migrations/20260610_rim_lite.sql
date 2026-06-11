-- ============================================================================
-- RIM-lite — Registration Grid + Labeling (Capability C2C-12)
-- ============================================================================
--
-- Lightweight Regulatory Information Management: product registry, product ×
-- country registration status grid (with renewal tracking), and label-version
-- tracking (USPI / SmPC / PIL / core data sheet). Low-end Veeva-RIM displacement.
--
-- Grounded in FDA labeling (21 CFR 201; USPI), EU labeling (Directive 2001/83/EC;
-- SmPC + PIL), the company core data sheet (CCDS), and EU 5-year MA renewal.
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/rim.ts
-- Service: server/services/rim/*
-- Routes:  server/routes/rim.ts (/api/rim)
-- ============================================================================

-- ─── Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rim_products (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  product_name    text NOT NULL,
  inn             text,
  dosage_form     text,
  atc_code        text,
  status          text NOT NULL DEFAULT 'development' CHECK (status IN ('development','active','discontinued')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_rim_products_org ON rim_products(organization_id);

-- ─── Registrations (product × country grid) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rim_registrations (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  product_id           integer NOT NULL REFERENCES rim_products(id),
  country              text NOT NULL,
  market_status        text NOT NULL DEFAULT 'planned' CHECK (market_status IN
                         ('planned','submitted','under_review','approved','withdrawn','suspended','cancelled')),
  registration_number  text,
  marketing_auth_holder text,
  approval_date        date,
  renewal_due_date     date,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_rim_registrations_org     ON rim_registrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_rim_registrations_product ON rim_registrations(product_id);

-- ─── Label versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rim_labels (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  product_id      integer NOT NULL REFERENCES rim_products(id),
  country         text,
  label_type      text NOT NULL CHECK (label_type IN ('uspi','smpc','pil','core_data_sheet','carton_labeling','patient_leaflet')),
  version         text NOT NULL DEFAULT '1.0',
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','superseded')),
  approved_date   date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_rim_labels_org     ON rim_labels(organization_id);
CREATE INDEX IF NOT EXISTS idx_rim_labels_product ON rim_labels(product_id);
