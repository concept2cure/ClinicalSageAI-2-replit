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

CREATE TABLE IF NOT EXISTS ind_icsr_transmissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             INTEGER NOT NULL,
  submission_id               INTEGER NOT NULL,
  adverse_event_id            TEXT NOT NULL,
  gateway                     TEXT NOT NULL,
  message_number              TEXT NOT NULL,
  sender_id                   TEXT NOT NULL,
  receiver_id                 TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'prepared',
  transmit_ready              BOOLEAN NOT NULL DEFAULT FALSE,
  transmitted_at              TIMESTAMPTZ,
  transport_receipt_id        TEXT,
  acknowledged_at             TIMESTAMPTZ,
  ack_code                    TEXT,
  acknowledged_message_number TEXT,
  errors                      JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  message                     TEXT NOT NULL,
  created_by                  INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regulatory_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER NOT NULL,
  submission_id    INTEGER NOT NULL,
  assessment_type  TEXT NOT NULL,
  ready            BOOLEAN,
  summary          JSONB NOT NULL DEFAULT '{}'::jsonb,
  result           JSONB NOT NULL,
  created_by       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tmf_artifact_filings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER NOT NULL,
  trial_id         TEXT NOT NULL,
  artifact_code    TEXT NOT NULL,
  zone_number      INTEGER,
  document_ref     TEXT,
  created_by       INTEGER,
  filed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tmf_artifact_filings_unique UNIQUE (organization_id, trial_id, artifact_code)
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
  -- Source pin (migrations/20260814e_submission_leaf_source_pin.sql): SHA-256 of
  -- the SOURCE document's content when the leaf was filed, distinct from the
  -- MD5 checksum column of RENDERED bytes above.
  document_content_sha256 TEXT,
  document_pinned_at      TIMESTAMPTZ,
  organization_id INTEGER NOT NULL,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- rendered_leaf_files: the retained bytes of a server-rendered filing document
-- (the IND safety report, annual report, LOA). Part of the CORE because the
-- lifecycle filing path writes it and submission_leaves points at it; the leaf
-- resolver reads it back through the storage provider. Migration
-- migrations/20260903_rendered_leaf_files.sql.
CREATE TABLE IF NOT EXISTS rendered_leaf_files (
  id                SERIAL PRIMARY KEY,
  organization_id   INTEGER NOT NULL,
  vault_version_id  TEXT NOT NULL,
  sha256            TEXT NOT NULL,
  md5               TEXT NOT NULL,
  mime              TEXT NOT NULL,
  byte_size         INTEGER NOT NULL,
  file_name         TEXT NOT NULL,
  rendered_from     TEXT NOT NULL,
  section_code      TEXT,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * audit_logs DDL — EVERY COLUMN `writeChainedAuditRow` WRITES, not just the
 * ones the chain + seal verifiers read.
 *
 * It used to be the reader's subset, described as "minimal … for testing
 * audit-integrity verification in-process". That was true of the verifier and
 * false of the fixture as a whole: `writeChainedAuditRow` INSERTs sixteen
 * columns, so any suite that used this table and reached a governed write got
 * `column "old_values" of relation "audit_logs" does not exist` — and because
 * the chained write is deliberately fail-closed (the audit row and the mutation
 * commit together or neither does), that error rolled the mutation back.
 *
 * The consequence was worse than a broken test: this fixture made the chained
 * audit path UNEXERCISABLE. A suite could only stay green by never reaching it,
 * so the two suites that do verify it (esignature-audit-atomicity, the IND
 * authoring journey) each declared their own fuller copy, and everything else
 * silently tested a world in which governed writes leave no chain entry.
 *
 * Keep this in agreement with the INSERT in `writeChainedAuditRow`
 * (server/services/auditService.ts). `scripts/ci/check-audit-logs-fixture.mjs`
 * enforces that agreement — a fixture the writer cannot write into is a fixture
 * that hides the writer.
 */
export const AUDIT_LOGS_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  tenant_id    INTEGER,
  user_id      INTEGER,
  action       TEXT,
  table_name   TEXT,
  record_id    TEXT,
  actor_id     INTEGER,
  target       TEXT,
  payload_hash TEXT,
  sha256_chain TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal    TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT
);
`;

/**
 * Document-source tables a leaf can point at (the polymorphic targets of
 * `submission_leaves.document_table`). Used by the assembler tests to prove
 * multi-source leaf resolution. Appended here (END of the DDL set) to minimize
 * merge friction. Mirrors the renderable columns of:
 *   - coauthor_documents          (shared/schema.ts)
 *   - unified_documents +
 *     workflow_document_versions  (shared/schema/unified_workflow.ts)
 * Only the columns the resolver reads are included.
 */
export const LEAF_SOURCE_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS coauthor_documents (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  module_number   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unified_documents (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  document_type   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  organization_id INTEGER NOT NULL,
  latest_version  INTEGER NOT NULL DEFAULT 1,
  metadata        JSON DEFAULT '{}'::json
);

CREATE TABLE IF NOT EXISTS workflow_document_versions (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL,
  version         INTEGER NOT NULL,
  content         JSON,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  comments        TEXT,
  -- Direct tenant scope (migrations 20260730 add + 20260731 NOT NULL). Mirrors
  -- production so the harness exercises the org-scoped version reads.
  organization_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_documents (
  canonical_id        TEXT PRIMARY KEY,
  organization_id     INTEGER NOT NULL,
  project_id          TEXT,
  title               TEXT NOT NULL,
  document_type       TEXT NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  stage               TEXT NOT NULL DEFAULT 'authoring',
  has_content         BOOLEAN NOT NULL DEFAULT false,
  content_hash        TEXT NOT NULL DEFAULT '',
  review_signature    JSONB,
  approval_signature  JSONB,
  placement           JSONB,
  packaging_validated BOOLEAN NOT NULL DEFAULT false,
  export_facet        JSONB,
  source_refs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  outline             JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit               JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ctd_onboarding_documents (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  mime_type       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * Governed-artifact tables the IND-forms /:formId/artifact route writes: a
 * minimal `projects` (org-scoping target) and `concept2cure_artifacts` (the
 * governed record). Only the columns the route reads/writes are included; no FK
 * constraints (test harness).
 */
export const FORM_ARTIFACT_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id                   SERIAL PRIMARY KEY,
  artifact_id          TEXT NOT NULL UNIQUE,
  project_id           INTEGER NOT NULL,
  conversation_id      INTEGER,
  organization_id      INTEGER NOT NULL,
  type                 TEXT NOT NULL,
  category             TEXT NOT NULL,
  title                TEXT NOT NULL,
  content              TEXT NOT NULL,
  content_hash         TEXT,
  version              INTEGER NOT NULL DEFAULT 1,
  ctd_section          TEXT,
  template_id          TEXT,
  ana_thread_id        TEXT,
  title_slug           TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  approved_version_id  INTEGER,
  published_version_id INTEGER,
  published_at         TIMESTAMPTZ,
  locked_at            TIMESTAMPTZ,
  locked_by_id         INTEGER,
  created_by_id        INTEGER,
  metadata             JSON,
  citations            JSONB DEFAULT '[]'::jsonb,
  citation_run_id      UUID,
  citations_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/**
 * Governed authoring store — c2c_documents + c2c_document_sections, the rows
 * the MDx editor and the eu-mdr / eu-ivdr rule packs write. Used by the
 * leaf-source-resolver and technical-file assembler tests to prove that an
 * authored MDR/IVDR section can be materialized into a package. Column names
 * mirror migrations/20260528_phase9_document_schema.sql; NO FK to
 * regulatory_programs (not part of this harness) and no triggers, so the
 * fixture stays self-contained. Only the columns the resolver/loader read plus
 * the NOT NULL columns needed to insert a row are included.
 */
export const GOVERNED_SECTIONS_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS c2c_documents (
  id                 TEXT PRIMARY KEY,
  org_id             INTEGER NOT NULL,
  project_id         UUID NOT NULL,
  doc_type           TEXT NOT NULL,
  agency             TEXT NOT NULL,
  rule_pack_version  TEXT NOT NULL,
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft',
  readiness          INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS c2c_document_sections (
  id                 BIGSERIAL PRIMARY KEY,
  document_id        TEXT NOT NULL REFERENCES c2c_documents(id) ON DELETE CASCADE,
  section_key        TEXT NOT NULL,
  parent_key         TEXT,
  label              TEXT NOT NULL,
  path_order         INTEGER NOT NULL,
  mandatory          BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'todo',
  content            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, section_key)
);
`;

/** A statement that failed because the database lacked a relation or column. */
export interface SchemaGap {
  /** Postgres SQLSTATE: 42P01 undefined_table, 42703 undefined_column. */
  code: string;
  message: string;
  /** The statement, trimmed — enough to identify the caller. */
  sql: string;
}

const SCHEMA_GAP_CODES = new Set(['42P01', '42703']); // undefined_table, undefined_column

type StatementRunner = {
  query: (sql: string, params?: unknown[], options?: unknown) => Promise<unknown>;
  exec: (sql: string, options?: unknown) => Promise<unknown>;
};

/**
 * Record every statement this PGlite instance rejects for a missing relation or
 * column, at the one seam every caller shares: `pglite.query`, `pglite.exec`,
 * and the client `pglite.transaction` hands its callback. Drizzle, a pool shim,
 * a request-scoped client and a raw `pglite.exec` from the test all land here,
 * so a write the code under test swallows (audit and telemetry writers are
 * deliberately non-fatal) is still observed. A shim layered above PGlite cannot
 * promise that — Drizzle talks to PGlite directly and never sees the shim.
 *
 * Recorded, then rethrown unchanged — the code under test must see exactly what
 * it would see in production. Consumed by `assertNoSchemaGaps` in
 * tests/golden-journeys/harness.ts.
 */
export function recordSchemaGaps(pglite: PGlite): SchemaGap[] {
  const gaps: SchemaGap[] = [];
  const noteAndRethrow = (sql: string, err: unknown): never => {
    const code = (err as { code?: string })?.code ?? '';
    if (SCHEMA_GAP_CODES.has(code)) {
      gaps.push({
        code,
        message: (err as Error).message,
        sql: sql.replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
    throw err;
  };
  const instrument = (runner: StatementRunner) => {
    const query = runner.query.bind(runner);
    const exec = runner.exec.bind(runner);
    runner.query = async (sql, params, options) => {
      try {
        return await query(sql, params, options);
      } catch (err) {
        return noteAndRethrow(sql, err);
      }
    };
    runner.exec = async (sql, options) => {
      try {
        return await exec(sql, options);
      } catch (err) {
        return noteAndRethrow(sql, err);
      }
    };
  };
  instrument(pglite as unknown as StatementRunner);
  const transaction = pglite.transaction.bind(pglite) as PGlite['transaction'];
  pglite.transaction = ((callback: (tx: unknown) => Promise<unknown>) =>
    transaction(tx => {
      instrument(tx as unknown as StatementRunner);
      return callback(tx);
    })) as PGlite['transaction'];
  return gaps;
}

export interface IndPgliteDb {
  pglite: PGlite;
  /** Drizzle instance over PGlite (insert/select against the pg-core schema). */
  db: ReturnType<typeof drizzle>;
  /**
   * Every statement this harness rejected for a missing relation or column —
   * see `recordSchemaGaps`. Pass the harness to `assertNoSchemaGaps` in
   * `afterAll` so a journey cannot pass against a database smaller than the
   * code it exercises.
   */
  schemaGaps: SchemaGap[];
  close: () => Promise<void>;
}

/**
 * Create an in-process PGlite database with the IND tables applied. Pass
 * `{ submissionCore: true }` to also create submissions / ectd_sequences /
 * submission_leaves (for the full filing → sequence → leaf flow).
 */
export async function createIndPgliteDb(
  opts: {
    submissionCore?: boolean;
    leafSources?: boolean;
    formArtifacts?: boolean;
    governedSections?: boolean;
  } = {}
): Promise<IndPgliteDb> {
  const pglite = new PGlite();
  const schemaGaps = recordSchemaGaps(pglite);
  await pglite.exec(IND_PGLITE_DDL);
  if (opts.submissionCore) await pglite.exec(SUBMISSION_CORE_PGLITE_DDL);
  if (opts.leafSources) await pglite.exec(LEAF_SOURCE_PGLITE_DDL);
  if (opts.formArtifacts) await pglite.exec(FORM_ARTIFACT_PGLITE_DDL);
  if (opts.governedSections) await pglite.exec(GOVERNED_SECTIONS_PGLITE_DDL);
  const db = drizzle(pglite);
  return { pglite, db, schemaGaps, close: () => pglite.close() };
}
