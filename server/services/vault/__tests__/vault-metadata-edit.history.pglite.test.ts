/**
 * Edit details, end to end on real Postgres (PGlite): the change it records
 * reads back in the document's history with the reason for the change and a
 * description of what changed.
 *
 * The history labels an event from its details.description and carries the
 * reason from the audit row's own column (audit-trail-ledger.routes.ts). An
 * edit that wrote the reason only inside its details showed the bare event
 * name and no reason, so a reviewer could not see why a document was re-typed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ pg: null as unknown as PGlite }));
const client = {
  query: (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]),
  release: () => {},
};
vi.mock('../../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]),
    connect: async () => client,
  },
}));
// The role gate reads the request's tenant scope; this test is about the
// record, so the caller is a member.
vi.mock('../vault-write-authority.js', () => ({ vaultWriteRefusal: () => null }));

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { verifyAuditChain, type PoolClient } from '../../../services/audit/chain';
import { readRecordAuditHistory } from '../../../routes/audit-trail-ledger.routes';
import { editVaultDocumentMetadata } from '../vault-metadata-edit.service';

const ORG = 41;
const USER = 7;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const REASON = 'Reclassified after the quality review of the batch analysis.';
const verified = async () => ({ ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 }) as never;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  // The real table has reason (migrations/20260527_mutation_primitives.sql); the shared fixture predates it.
  await h.pg.exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;');
  await h.pg.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
                   INSERT INTO users (id, name) VALUES (${USER}, 'Dana Reviewer') ON CONFLICT DO NOTHING;
                   CREATE TABLE IF NOT EXISTS organization_users (user_id integer, organization_id integer);`);
  await h.pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260929_actor_names.sql'), 'utf8'));
  await h.pg.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, deleted_at TIMESTAMPTZ);
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL, organization_id INTEGER, document_code TEXT, document_title TEXT,
      document_type TEXT, classification TEXT, version TEXT, content_hash TEXT,
      supersedes_id UUID, deleted_at TIMESTAMPTZ, created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE canonical_documents (
      organization_id INTEGER, canonical_id TEXT, stage TEXT, source_refs JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
});
afterAll(async () => { await h.pg.close(); });

beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  await h.pg.exec(`DELETE FROM audit_logs; DELETE FROM vault.documents; DELETE FROM regulatory_programs;
                   DELETE FROM canonical_documents;`);
  await h.pg.exec(`INSERT INTO regulatory_programs (id, organization_id) VALUES ('${PROGRAM}', ${ORG});
                   INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, classification, version, content_hash)
                     VALUES ('${DOC}', '${PROGRAM}', ${ORG}, 'Protocol-Stability.pdf', 'Protocol-Stability', 'MODULE_3', 'INTERNAL', '1.0', '${'a'.repeat(64)}');`);
});

describe('Edit details reads back in the document history with its reason and what changed', () => {
  it('a re-type records the reason on the entry and names the old and new type', async () => {
    const r = await editVaultDocumentMetadata({
      programId: PROGRAM, documentId: DOC, organizationId: ORG, userId: USER, documentType: 'REPORT', reason: REASON,
    });
    expect(r).toMatchObject({ ok: true, unchanged: false });

    const hist = await readRecordAuditHistory(h.pg as never, ORG, { tableName: 'vault_document', recordId: DOC }, verified);
    expect(hist.data).toHaveLength(1);
    expect(hist.data[0].reason, 'the entry carries the reason for the change').toBe(REASON);
    expect(hist.data[0].event, 'the entry names what changed').toBe('Type: Module 3 · quality -> Report');
    expect(hist.data[0].actor).toBe('Dana Reviewer');
  });

  it('a title and a type changed together are both named, in the order the form lists them', async () => {
    await editVaultDocumentMetadata({
      programId: PROGRAM, documentId: DOC, organizationId: ORG, userId: USER,
      documentTitle: 'Clinical protocol', documentType: 'PROTOCOL', reason: REASON,
    });
    const hist = await readRecordAuditHistory(h.pg as never, ORG, { tableName: 'vault_document', recordId: DOC }, verified);
    expect(hist.data[0].event).toBe('Title: Protocol-Stability -> Clinical protocol; Type: Module 3 · quality -> Protocol');
  });

  it('the reason stays in the recorded details too, where the existing record reads it', async () => {
    await editVaultDocumentMetadata({
      programId: PROGRAM, documentId: DOC, organizationId: ORG, userId: USER, documentType: 'REPORT', reason: REASON,
    });
    const row = await h.pg.query<{ reason: string | null; new_values: { reason?: string; description?: string } }>(
      `SELECT reason, new_values FROM audit_logs WHERE action = 'vault.document.metadata_edit'`);
    expect(row.rows[0].reason).toBe(REASON);
    expect(row.rows[0].new_values.reason).toBe(REASON);
  });

  it('the chain still verifies with the reason on the row', async () => {
    await editVaultDocumentMetadata({
      programId: PROGRAM, documentId: DOC, organizationId: ORG, userId: USER, documentType: 'REPORT', reason: REASON,
    });
    const v = await verifyAuditChain(h.pg as unknown as PoolClient, { tenantId: ORG });
    expect(v.ok).toBe(true);
  });
});
