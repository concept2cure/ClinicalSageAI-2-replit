/** Real canonical audit writer, sequence trigger and receipt verifier over
 * PGlite. Corruption updates are an explicit owner-level fixture seam; this
 * does not qualify native concurrency or the storage/renderer pipelines. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { writeChainedAuditRow } from '../../auditService';
import { readAuthoringVaultFilingReceipt } from '../authoring-vault-filing-receipt';

const ORG = 17;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT = '22222222-2222-4222-8222-222222222222';
const SOURCE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const EXPORT = '55555555-5555-4555-8555-555555555555';
const SHA = 'a'.repeat(64);
const ACTION = 'authoring.document.file_to_vault';
const input = { organizationId: ORG, programId: PROGRAM, vaultDocumentId: VAULT, artifactSha256: SHA };
let db: JourneyDb;
const statements: string[] = [];
const q = { query: async (sql: string, params?: unknown[]) => {
  statements.push(sql);
  const result = await db.pool.query(sql, params);
  const rows = result.rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Expected a PostgreSQL record');
    return row as Record<string, unknown>;
  });
  return { ...result, rows };
} };

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: AUDIT_LOGS_PGLITE_DDL,
    migrations: ['migrations/20260921_audit_logs_chain_seq.sql'] });
}, 120_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', 'receipt-fixture-key-for-canonical-audit-20261021');
  await q.query('TRUNCATE audit_logs');
  statements.length = 0;
});
afterEach(() => { vi.unstubAllEnvs(); });

async function record(payload: Record<string, unknown> = {}, headers: {
  tenantId?: number; resourceType?: string; resourceId?: string; action?: string;
} = {}) {
  await q.query('BEGIN');
  await writeChainedAuditRow(q, {
    tenantId: ORG, userId: 7, action: ACTION, resourceType: 'authoring_document', resourceId: SOURCE,
    ...headers,
    details: { vaultDocumentId: VAULT, programId: PROGRAM, artifactSha256: SHA, exportId: EXPORT, ...payload },
  });
  await q.query('COMMIT');
}

describe('recorded derivation uses the retained canonical receipt', () => {
  it('verifies payload, source target, tenant, project, artifact and an actual HMAC seal', async () => {
    await record({ sourceVersion: 'v1.0.frozen', sourceSectionsSha256: 'b'.repeat(64) });
    const result = await readAuthoringVaultFilingReceipt(q, input);
    expect(result).toMatchObject({ status: 'recorded', programId: PROGRAM, artifactSha256: SHA,
      source: { store: 'authoring_documents', nativeId: SOURCE, version: 'v1.0.frozen', sectionsSha256: 'b'.repeat(64) },
      receipt: { id: expect.any(String), exportCorrelationId: EXPORT, chain: 'linked', seal: 'valid' } });
    expect(statements.join(' ')).not.toMatch(/(?:FROM|JOIN)\s+(?:authoring_documents|authoring_sections|authoring_export_history)\b/i);
  });

  it('leaves old missing version and sections digest explicitly unknown', async () => {
    await record();
    expect(await readAuthoringVaultFilingReceipt(q, input)).toMatchObject({ status: 'recorded',
      source: { nativeId: SOURCE, version: null, sectionsSha256: null } });
  });

  it('states no-key separately from HMAC authenticity', async () => {
    vi.stubEnv('AUDIT_HMAC_KEY', undefined);
    await record();
    expect(await readAuthoringVaultFilingReceipt(q, input)).toMatchObject({ status: 'recorded', receipt: { chain: 'linked', seal: 'no-key' } });
  });

  it('states no recorded derivation for a native upload without a filing receipt', async () => {
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'not-recorded' });
  });

  it.each([
    ['another tenant', {}, { tenantId: ORG + 1 }],
    ['another Vault version', { vaultDocumentId: OTHER }, {}],
    ['another action', {}, { action: 'vault.document.ingest' }],
  ])('does not adopt a receipt for %s', async (_name, payload, headers) => {
    await record(payload, headers);
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'not-recorded' });
  });
});

describe('unverified facts never become positive source claims', () => {
  it.each([
    ['another project', { programId: OTHER }, {}],
    ['another artifact hash', { artifactSha256: 'c'.repeat(64) }, {}],
    ['malformed source identity', {}, { resourceId: 'not-a-uuid' }],
    ['another resource type', {}, { resourceType: 'vault_document' }],
    ['malformed source version', { sourceVersion: ['1.0'] }, {}],
    ['malformed source digest', { sourceSectionsSha256: 'not-a-digest' }, {}],
  ])('refuses a sealed receipt with %s', async (_name, payload, headers) => {
    await record(payload, headers);
    const result = await readAuthoringVaultFilingReceipt(q, input);
    expect(result.status).toBe('unverified');
    expect(result).not.toHaveProperty('source');
  });

  it('refuses a changed payload even when the stored chain and seal remain', async () => {
    await record();
    await q.query(`UPDATE audit_logs SET new_values = jsonb_set(new_values::jsonb, '{sourceVersion}', '"tampered"')::json`);
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unverified', reason: 'payload_mismatch' });
  });

  it('requires record ID and the chained resource target to agree', async () => {
    await record();
    await q.query('UPDATE audit_logs SET record_id = $1', [OTHER]);
    expect((await readAuthoringVaultFilingReceipt(q, input)).status).toBe('unverified');
  });

  it.each([null, '0'.repeat(64)])('refuses a missing or invalid HMAC seal when a key is configured (%s)', async seal => {
    await record();
    await q.query('UPDATE audit_logs SET hmac_seal = $1', [seal]);
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unverified', reason: 'seal_unverified' });
  });

  it('refuses a broken predecessor link', async () => {
    await record({ vaultDocumentId: OTHER });
    await record();
    await q.query('UPDATE audit_logs SET sha256_chain = $1 WHERE new_values->>\'vaultDocumentId\' = $2', ['f'.repeat(64), OTHER]);
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unverified', reason: 'chain_unverified' });
  });

  it('does not trust an unsequenced legacy row', async () => {
    await record();
    await q.query('UPDATE audit_logs SET chain_seq = NULL');
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unverified', reason: 'chain_unverified' });
  });

  it('does not choose among multiple filing candidates by date', async () => {
    await record();
    await record({}, { resourceId: OTHER });
    expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unverified', reason: 'candidate_ambiguous' });
  });
});

describe('a missing or failed source store is not an empty source history', () => {
  it('reports the actual absent relation separately from no receipt', async () => {
    await q.query('ALTER TABLE audit_logs RENAME TO withheld_audit_logs');
    try {
      expect(await readAuthoringVaultFilingReceipt(q, input)).toEqual({ status: 'unavailable', reason: 'relation_absent' });
    } finally { await q.query('ALTER TABLE withheld_audit_logs RENAME TO audit_logs'); }
  });

  it('reports a query failure as unavailable', async () => {
    const unavailable = { query: async () => { throw new Error('fixture connection failed'); } };
    expect(await readAuthoringVaultFilingReceipt(unavailable, input)).toEqual({ status: 'unavailable', reason: 'read_failed' });
  });

  it('refuses malformed materialization context before any source read', async () => {
    expect(await readAuthoringVaultFilingReceipt(q, { ...input, programId: 'not-a-uuid' })).toEqual({ status: 'unverified', reason: 'context_invalid' });
    expect(statements).toEqual([]);
  });
});
