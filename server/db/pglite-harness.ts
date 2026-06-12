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
`;

export interface IndPgliteDb {
  pglite: PGlite;
  /** Drizzle instance over PGlite (insert/select against the pg-core schema). */
  db: ReturnType<typeof drizzle>;
  close: () => Promise<void>;
}

/** Create an in-process PGlite database with the IND tables applied. */
export async function createIndPgliteDb(): Promise<IndPgliteDb> {
  const pglite = new PGlite();
  await pglite.exec(IND_PGLITE_DDL);
  const db = drizzle(pglite);
  return { pglite, db, close: () => pglite.close() };
}
