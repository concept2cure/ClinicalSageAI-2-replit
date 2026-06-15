/**
 * PGlite dev/test database harness.
 *
 * A free, in-process Postgres (pure WASM, no server/daemon/cloud) for exercising
 * the DB-backed IND features locally and in integration tests — no Neon, no
 * docker required. This is a DEV/TEST path only: production uses the standard
 * node-postgres pool (server/db/runtime.ts) over whatever DATABASE_URL you set.
 *
 * Usage (test):
 *   const h = await createIndPgliteDb();
 *   // h.db is a drizzle instance over PGlite with the IND tables created.
 *   // Mock the service's `db` import to point at h.db, then call the service.
 *   await h.close();
 *
 * The DDL below mirrors migrations/20260609_ind_master_data.sql and
 * 20260610_ind_dispatch_snapshots.sql; keep them in sync.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

/** CREATE TABLE statements for the IND tables (mirrors the migrations). */
export const IND_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS ind_sponsors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  city            VARCHAR(128),
  state_province  VARCHAR(128),
  postal_code     VARCHAR(32),
  country         VARCHAR(64),
  contact_name    TEXT,
  contact_phone   VARCHAR(64),
  contact_email   VARCHAR(256),
  duns            VARCHAR(16),
  signatory_name  TEXT,
  signatory_title TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INTEGER
);

CREATE TABLE IF NOT EXISTS ind_regulatory_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  city            VARCHAR(128),
  state_province  VARCHAR(128),
  postal_code     VARCHAR(32),
  country         VARCHAR(64),
  contact_name    TEXT,
  contact_phone   VARCHAR(64),
  contact_email   VARCHAR(256),
  is_us_agent     BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INTEGER
);

CREATE TABLE IF NOT EXISTS ind_investigators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  credentials       VARCHAR(128),
  site_name         TEXT,
  site_address      TEXT,
  irb_name          TEXT,
  irb_address       TEXT,
  cv_document_ref   TEXT,
  phone             VARCHAR(64),
  email             VARCHAR(256),
  sub_investigators JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        INTEGER
);

CREATE TABLE IF NOT EXISTS ind_dispatch_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  submission_id   INTEGER NOT NULL,
  sequence_id     INTEGER NOT NULL,
  sequence_number TEXT NOT NULL,
  can_dispatch    BOOLEAN NOT NULL,
  blocker_count   INTEGER NOT NULL DEFAULT 0,
  warning_count   INTEGER NOT NULL DEFAULT 0,
  blocker_codes   JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict         JSONB NOT NULL,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ind_cross_references (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER NOT NULL,
  submission_id          INTEGER NOT NULL,
  referenced_file_type   TEXT NOT NULL,
  referenced_file_number TEXT NOT NULL,
  subject_name           TEXT NOT NULL,
  authorized_sections    JSONB NOT NULL DEFAULT '[]'::jsonb,
  loa_on_file            BOOLEAN NOT NULL DEFAULT FALSE,
  loa_leaf_section       TEXT,
  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ind_safety_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       INTEGER NOT NULL,
  submission_id         INTEGER NOT NULL,
  adverse_event_id      TEXT NOT NULL,
  obligation            TEXT NOT NULL,
  reporting_window_days INTEGER,
  deadline              TIMESTAMPTZ,
  regulatory_basis      TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  sequence_id           INTEGER,
  filed_at              TIMESTAMPTZ,
  classification        JSONB NOT NULL,
  document              JSONB NOT NULL,
  created_by            INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ind_annual_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER NOT NULL,
  submission_id          INTEGER NOT NULL,
  ind_number             TEXT NOT NULL,
  product_name           TEXT NOT NULL,
  reporting_period_start TIMESTAMPTZ,
  reporting_period_end   TIMESTAMPTZ,
  due_date               TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'draft',
  sequence_id            INTEGER,
  filed_at               TIMESTAMPTZ,
  gap_count              INTEGER NOT NULL DEFAULT 0,
  model                  JSONB NOT NULL,
  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ind_amendments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL,
  submission_id     INTEGER NOT NULL,
  ind_number        TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  amendment_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft',
  sequence_id       INTEGER,
  filed_at          TIMESTAMPTZ,
  leaf_count        INTEGER NOT NULL DEFAULT 0,
  warning_count     INTEGER NOT NULL DEFAULT 0,
  plan              JSONB NOT NULL,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * Submission core tables (submissions / ectd_sequences / submission_leaves)
 * mirrored from shared/schema/submissions.ts, WITHOUT the organizations/users
 * foreign-key constraints (not needed for a test harness). Enables exercising
 * the full filing → sequence → leaf flow via submission-service against PGlite.
 */
export const SUBMISSION_CORE_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS submissions (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  product_name     TEXT,
  application_type TEXT NOT NULL,
  client_type      TEXT NOT NULL,
  primary_region   TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'planning',
  lifecycle_stage  TEXT NOT NULL DEFAULT 'planning',
  organization_id  INTEGER NOT NULL,
  created_by       INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ectd_sequences (
  id                SERIAL PRIMARY KEY,
  submission_id     INTEGER NOT NULL,
  region            TEXT NOT NULL,
  sequence_number   TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'original',
  status            TEXT NOT NULL DEFAULT 'draft',
  validation_status TEXT,
  dispatch_status   TEXT,
  frozen_at         TIMESTAMPTZ,
  organization_id   INTEGER NOT NULL,
  created_by        INTEGER NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS submission_leaves (
  id              SERIAL PRIMARY KEY,
  sequence_id     INTEGER NOT NULL,
  section_code    TEXT NOT NULL,
  title           TEXT NOT NULL,
  granularity     TEXT,
  lifecycle_op    TEXT NOT NULL DEFAULT 'new',
  document_table  TEXT,
  document_id     INTEGER,
  document_type   TEXT,
  leaf_guid       TEXT,
  parent_leaf_id  INTEGER,
  checksum        TEXT,
  organization_id INTEGER NOT NULL,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
`;

/**
 * Minimal audit_logs DDL (just the columns the chain + seal verifiers read),
 * for testing audit-integrity verification in-process.
 */
export const AUDIT_LOGS_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  action       TEXT,
  actor_id     INTEGER,
  target       TEXT,
  payload_hash TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sha256_chain TEXT,
  hmac_seal    TEXT
);
`;

export interface IndPgliteDb {
  pglite: PGlite;
  /** Drizzle instance over PGlite (insert/select against the pg-core schema). */
  db: ReturnType<typeof drizzle>;
  close: () => Promise<void>;
}

/**
 * Create an in-process PGlite database with the IND tables applied. Pass
 * `{ submissionCore: true }` to also create submissions / ectd_sequences /
 * submission_leaves (for the full filing → sequence → leaf flow).
 */
export async function createIndPgliteDb(opts: { submissionCore?: boolean } = {}): Promise<IndPgliteDb> {
  const pglite = new PGlite();
  await pglite.exec(IND_PGLITE_DDL);
  if (opts.submissionCore) await pglite.exec(SUBMISSION_CORE_PGLITE_DDL);
  const db = drizzle(pglite);
  return { pglite, db, close: () => pglite.close() };
}
