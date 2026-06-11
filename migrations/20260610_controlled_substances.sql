-- ============================================================================
-- Controlled Substances Tracking (DEA) (Capability C2C-15)
-- ============================================================================
--
-- DEA registration tracking, controlled-substances inventory, and a perpetual
-- transaction ledger (receipt/dispense/use/disposal/transfer). Closes "DEA
-- scheduling and usage logs outside the compliance system".
--
-- Grounded in the Controlled Substances Act and 21 CFR 1300-series (schedules
-- 1308; registration 1301; recordkeeping/inventory 1304). Tenancy/audit mirror
-- the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/controlled-substances.ts
-- Service: server/services/controlled-substances/*
-- Routes:  server/routes/controlled-substances.ts (/api/controlled-substances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dea_registrations (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  registrant_name   text NOT NULL,
  dea_number        text NOT NULL,
  business_activity text NOT NULL CHECK (business_activity IN ('researcher','analytical_lab','manufacturer','distributor','practitioner','teaching_institution','other')),
  schedules         text[] NOT NULL DEFAULT '{}',
  expiration_date   date,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','surrendered','revoked')),
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_dea_registrations_org ON dea_registrations(organization_id);

CREATE TABLE IF NOT EXISTS controlled_substances (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  dea_registration_id integer REFERENCES dea_registrations(id),
  substance_name      text NOT NULL,
  dea_schedule        text NOT NULL CHECK (dea_schedule IN ('I','II','III','IV','V')),
  unit                text NOT NULL DEFAULT 'g',
  current_balance     numeric(14,4) NOT NULL DEFAULT 0,
  created_by          integer NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_controlled_substances_org          ON controlled_substances(organization_id);
CREATE INDEX IF NOT EXISTS idx_controlled_substances_registration ON controlled_substances(dea_registration_id);

CREATE TABLE IF NOT EXISTS cs_transactions (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  substance_id     integer NOT NULL REFERENCES controlled_substances(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('receipt','dispense','use','disposal','transfer','adjustment')),
  quantity         numeric(14,4) NOT NULL,
  balance_after    numeric(14,4) NOT NULL,
  transaction_date date,
  witnessed_by     text,
  reference        text,
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cs_transactions_org       ON cs_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_cs_transactions_substance ON cs_transactions(substance_id);
