/**
 * The database the eTMF route tests run on: PGlite with the filings table as
 * the deploy path builds it, plus the little the study binding reads.
 *
 * `tmf_artifact_filings` comes from the harness (the 20260615 shape), and the
 * study reference and removal columns are added by the real migration file,
 * applied from disk (migrations/20261110_tmf_filings_study_ref.sql), so the
 * routes write against the columns, the same-organization key and the removal
 * CHECK production has. `cdisc_prm_studies`, `regulatory_programs` and
 * `vault.documents` are laid here with only the columns the eTMF service
 * reads; the real tables, the real project admission and the real audit chain
 * are exercised on PostgreSQL in tests/db/etmf-study-binding.dbtest.ts and
 * tests/db/etmf-governed-filing.dbtest.ts.
 *
 * Not a test file: it is imported by the two route suites beside it.
 */
import { readFileSync } from 'node:fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const STUDY_REF_MIGRATION = new URL('../../../migrations/20261110_tmf_filings_study_ref.sql', import.meta.url);

const STUDY_BINDING_DDL = `
CREATE TABLE IF NOT EXISTS cdisc_prm_studies (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  study_id        VARCHAR(100) NOT NULL UNIQUE,
  program_id      UUID,
  protocol_id     VARCHAR(100) NOT NULL,
  protocol_title  TEXT NOT NULL,
  study_phase     VARCHAR(20),
  indication      TEXT,
  protocol_status VARCHAR(50) DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS regulatory_programs (
  id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, deleted_at TIMESTAMP
);
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.documents (
  id UUID PRIMARY KEY, program_id UUID NOT NULL, organization_id INTEGER NOT NULL, deleted_at TIMESTAMPTZ,
  document_code TEXT, document_title TEXT, file_name TEXT, version TEXT, supersedes_id UUID
);
-- What the audit-writer double records, on the client it is handed: a row here
-- commits or rolls back with the filing it describes.
CREATE TABLE IF NOT EXISTS tmf_test_audit (
  seq SERIAL PRIMARY KEY, action TEXT NOT NULL, record_id TEXT NOT NULL, reason TEXT, details JSONB
);
`;

export const PROGRAM_A = '0a000000-0000-4000-8000-00000000000a';
export const PROGRAM_B = '0b000000-0000-4000-8000-00000000000b';
export const DOC_A = 'd0c0000a-0000-4000-8000-00000000000a';
export const DOC_B = 'd0c0000b-0000-4000-8000-00000000000b';

type Run = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface TmfRouteDb {
  harness: IndPgliteDb;
  /** `pool` and `transaction` as server/db exports them, over the one PGlite connection. */
  pool: { query: Run };
  transaction: <T>(work: (client: { query: Run }) => Promise<T>) => Promise<T>;
  query: Run;
}

/**
 * Organization 1 holds two projects, each with one study and one Vault
 * document: STUDY-A in project A, STUDY-B in project B. Organization 2 holds
 * STUDY-Z in a project of its own.
 */
export async function createTmfRouteDb(): Promise<TmfRouteDb> {
  const harness = await createIndPgliteDb();
  await harness.pglite.exec(STUDY_BINDING_DDL);
  await harness.pglite.exec(readFileSync(STUDY_REF_MIGRATION, 'utf8'));
  const query: Run = async (text, params) => {
    const result = await harness.pglite.query(text, params as unknown[]);
    return { rows: result.rows as Array<Record<string, unknown>> };
  };
  const transaction: TmfRouteDb['transaction'] = async (work) => {
    await query('BEGIN');
    try {
      const out = await work({ query });
      await query('COMMIT');
      return out;
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  };
  await query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1, 1), ($2, 1), ($3, 2)`,
    [PROGRAM_A, PROGRAM_B, '0c000000-0000-4000-8000-00000000000c']);
  await query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, program_id, protocol_id, protocol_title, study_phase, indication) VALUES
       (1, 'STUDY-A', $1, 'PROT-A', 'Study A', 'Phase II', 'Hypertension'),
       (1, 'STUDY-B', $2, 'PROT-B', 'Study B', 'Phase III', 'Hypertension'),
       (2, 'STUDY-Z', $3, 'PROT-Z', 'Study Z', 'Phase I', 'Asthma')`,
    [PROGRAM_A, PROGRAM_B, '0c000000-0000-4000-8000-00000000000c']);
  await query(
    `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, file_name, version) VALUES
       ($1, $2, 1, 'DOC-A', 'Sample case report form', 'sample-crf.pdf', '2.0'),
       ($3, $4, 1, 'DOC-B', 'A document of project B', 'project-b.pdf', '1.0')`,
    [DOC_A, PROGRAM_A, DOC_B, PROGRAM_B]);
  return { harness, pool: { query }, transaction, query };
}
