/**
 * VR-01 (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md) — a Vault
 * document's history, from the one chained ledger, on real Postgres (PGlite)
 * with the real audit_logs DDL and the chain_seq migration.
 *
 * Two defects this pins:
 *   1. recordVaultDownload wrote its chained row through the pool, outside a
 *      transaction. The chain's position lock and its INSERT then run in
 *      different statements, so the audit_logs trigger records the row as
 *      LEGACY (chain_seq NULL): a download sat outside the sequenced chain
 *      every other governed event joins (services/audit/chain.ts header).
 *   2. A document had no history at all. The only readers were org-wide.
 *      readRecordAuditHistory reads one record's rows from the same ledger as
 *      readAuditLedger, each with its chain predecessor found by a tenant-scoped
 *      lookup on chain_seq (not a LAG over the filtered rows, which would name
 *      the document's previous row instead of the chain's).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';

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

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { writeChainedAuditRow } from '../../../services/auditService';
import { verifyAuditChain, type PoolClient } from '../../../services/audit/chain';
import { recordVaultDownload } from '../project-vault';
import { readRecordAuditHistory } from '../../audit-trail-ledger.routes';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations/20260921_audit_logs_chain_seq.sql',
);

const ORG = 41, OTHER_ORG = 42;
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A governed write the way ingest and placement make one: inside a transaction. */
async function governedWrite(tenantId: number, action: string, recordId: string, details: Record<string, unknown> = {}) {
  await h.pg.transaction(async (tx) => {
    await writeChainedAuditRow(tx as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }, {
      tenantId, userId: 7, action, resourceType: 'vault_document', resourceId: recordId, details,
    });
  });
}

const req = { user: { id: 7 }, ip: '10.0.0.1', headers: { 'user-agent': 'vitest' } } as unknown as Request;
const download = (documentId: string) => recordVaultDownload(req, {
  orgId: ORG, programId: 'p', documentId, documentTitle: 'Protocol', fileName: 'p.pdf', fileSize: 10, contentHash: 'c'.repeat(64),
});

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
  // The real table has reason (migrations/20260527_mutation_primitives.sql:86);
  // the shared PGlite fixture predates it.
  await h.pg.exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;');
  await h.pg.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
                   INSERT INTO users (id, name) VALUES (7, 'Dana Reviewer') ON CONFLICT DO NOTHING;`);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  await h.pg.exec('DELETE FROM audit_logs;');
});

describe('a Vault download joins the sequenced chain', () => {
  it('is written as a sequenced row, not a legacy one', async () => {
    await governedWrite(ORG, 'vault.document.ingest', DOC_A);
    expect(await download(DOC_A)).toBe(true);
    const r = await h.pg.query<{ chain_seq: string | null }>(
      `SELECT chain_seq FROM audit_logs WHERE action = 'vault.document.download'`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].chain_seq, 'a download outside a transaction is recorded as legacy').not.toBeNull();
  });

  it('leaves the tenant chain verifiable', async () => {
    await governedWrite(ORG, 'vault.document.ingest', DOC_A);
    await download(DOC_A);
    await governedWrite(ORG, 'vault.document.file', DOC_A);
    const v = await verifyAuditChain(h.pg as unknown as PoolClient, { tenantId: ORG });
    expect(v.ok).toBe(true);
    expect(v.legacyRows).toBe(0);
  });
});

describe('readRecordAuditHistory — one document, from the one ledger', () => {
  const verified = async () => ({ ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 }) as never;

  it('lists this document\'s events only, newest first, with who did them', async () => {
    await governedWrite(ORG, 'vault.document.ingest', DOC_A, { contentHash: 'c'.repeat(64) });
    await governedWrite(ORG, 'vault.document.ingest', DOC_B);
    await governedWrite(ORG, 'vault.document.file', DOC_A);
    await download(DOC_A);
    await governedWrite(OTHER_ORG, 'vault.document.download', DOC_A); // same id, other tenant
    const h1 = await readRecordAuditHistory(h.pg as never, ORG, { tableName: 'vault_document', recordId: DOC_A }, verified);
    expect(h1.data.map((e) => e.event)).toEqual(['Vault Document Download', 'Vault Document File', 'Vault Document Ingest']);
    expect(h1.data.every((e) => e.actor === 'Dana Reviewer')).toBe(true);
    expect(h1.data.every((e) => e.seq !== null)).toBe(true);
  });

  it('names each row\'s predecessor in the TENANT chain, not the document\'s previous row', async () => {
    await governedWrite(ORG, 'vault.document.ingest', DOC_A);
    await governedWrite(ORG, 'vault.document.ingest', DOC_B); // interleaved: A's next row chains onto THIS
    await governedWrite(ORG, 'vault.document.file', DOC_A);
    const all = await h.pg.query<{ record_id: string; sha256_chain: string }>(
      `SELECT record_id, sha256_chain FROM audit_logs WHERE tenant_id = $1 ORDER BY chain_seq`, [ORG]);
    const hist = await readRecordAuditHistory(h.pg as never, ORG, { tableName: 'vault_document', recordId: DOC_A }, verified);
    const fileEntry = hist.data[0];
    expect(fileEntry.prevHash).toBe(all.rows[1].sha256_chain); // DOC_B's ingest
    expect(fileEntry.prevHash).not.toBe(all.rows[0].sha256_chain);
  });

  it('carries the tenant chain verdict, not a verdict of its own', async () => {
    await governedWrite(ORG, 'vault.document.ingest', DOC_A);
    const broken = async () => ({ ok: false, rowsChecked: 3, legacyRows: 0, sequencedRows: 3, brokenAt: 'x' }) as never;
    const hist = await readRecordAuditHistory(h.pg as never, ORG, { tableName: 'vault_document', recordId: DOC_A }, broken);
    expect(hist.meta.chain.ok).toBe(false);
    expect(hist.meta.chain.store).toBe('audit_logs');
  });
});
