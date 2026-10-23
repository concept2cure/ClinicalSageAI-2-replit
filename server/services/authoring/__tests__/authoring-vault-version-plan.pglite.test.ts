/** Existing Vault SQL and canonical filing receipts; no source body, renderer,
 * storage or native concurrent-lock qualification is claimed. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { writeChainedAuditRow } from '../../auditService';
import { assertAuthoringVaultVersionPlan, planAuthoringVaultVersion } from '../authoring-vault-version-plan';

const ORG = 17;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SOURCE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const SHA = 'a'.repeat(64);
const BASE = `authoring-${SOURCE}`;
const input = { organizationId: ORG, programId: PROGRAM, sourceDocumentId: SOURCE, format: 'pdf' as const };
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
  db = await createJourneyDb({ prereqSql: `${AUDIT_LOGS_PGLITE_DDL}
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id integer, program_id uuid,
      document_code text, version text, supersedes_id uuid, deleted_at timestamptz,
      content_hash text, mime_type text, folder_id text);`,
    migrations: ['migrations/20260921_audit_logs_chain_seq.sql'] });
}, 120_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await q.query('TRUNCATE vault.documents, audit_logs'); statements.length = 0; });

async function version(p: { code?: string; label?: string; org?: number; program?: string;
  mime?: string; deleted?: boolean; supersedes?: string } = {}) {
  const id = randomUUID();
  await q.query(`INSERT INTO vault.documents
    (id,organization_id,program_id,document_code,version,content_hash,mime_type,folder_id,deleted_at,supersedes_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'module-2',CASE WHEN $8 THEN now() ELSE NULL END,$9)`,
  [id, p.org ?? ORG, p.program ?? PROGRAM, p.code ?? `${BASE}-pdf`, p.label ?? '1.0', SHA,
    p.mime ?? 'application/pdf', p.deleted ?? false, p.supersedes ?? null]);
  return id;
}
async function receipt(id: string, sourceId = SOURCE) {
  await q.query('BEGIN');
  await writeChainedAuditRow(q, { tenantId: ORG, userId: 7, action: 'authoring.document.file_to_vault',
    resourceType: 'authoring_document', resourceId: sourceId,
    details: { vaultDocumentId: id, programId: PROGRAM, artifactSha256: SHA, format: 'pdf' } });
  await q.query('COMMIT');
}

describe('Authoring chooses a verified per-format Vault family', () => {
  it('starts independent PDF and Word families only without retained rows', async () => {
    expect(await planAuthoringVaultVersion(q, input)).toEqual({ ok: true, documentCode: `${BASE}-pdf`, supersedesDocumentId: null });
    await version();
    expect(await planAuthoringVaultVersion(q, { ...input, format: 'docx' })).toEqual({ ok: true, documentCode: `${BASE}-docx`, supersedesDocumentId: null });
  });
  it('uses the exact unique numeric head only after verifying its retained source receipt', async () => {
    const id = await version(); await receipt(id);
    expect(await planAuthoringVaultVersion(q, input)).toEqual({ ok: true, documentCode: `${BASE}-pdf`, supersedesDocumentId: id });
    expect(await planAuthoringVaultVersion(q, { ...input, folderId: 'module-2' })).toMatchObject({ ok: true });
    expect(await planAuthoringVaultVersion(q, { ...input, folderId: 'module-3' })).toMatchObject({ ok: false, code: 'FILING_IS_KEPT' });
    expect(statements.join(' ')).not.toMatch(/(?:FROM|JOIN)\s+(?:authoring_documents|authoring_sections)\b/i);
  });
  it.each([false, true])('requires review for a legacy base-code row, deleted=%s', async deleted => {
    await version({ code: BASE, label: 'draft-abcd1234', deleted });
    expect(await planAuthoringVaultVersion(q, input)).toMatchObject({ ok: false, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
  });
  it.each(['retired', 'ambiguous', 'unknown', 'wrong mime', 'missing receipt', 'different source'])('refuses a %s family', async kind => {
    const id = await version({ deleted: kind === 'retired', label: kind === 'unknown' ? 'draft-12345678' : '1.0',
      mime: kind === 'wrong mime' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' });
    if (kind === 'ambiguous') await version({ label: '3.0' });
    if (kind !== 'missing receipt') await receipt(id, kind === 'different source' ? OTHER : SOURCE);
    expect(await planAuthoringVaultVersion(q, input)).toMatchObject({ ok: false, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
  });
  it('does not let foreign project, organization or rendition rows block a fresh filing', async () => {
    await version({ code: BASE, org: 99 });
    await version({ code: BASE, program: OTHER });
    await version({ code: `${BASE}-docx` });
    expect(await planAuthoringVaultVersion(q, input)).toMatchObject({ ok: true, supersedesDocumentId: null });
  });
  it('requires review for retained unknown numbering even when the live head is numeric', async () => {
    await version({ label: 'draft-12345678', deleted: true });
    const head = await version(); await receipt(head);
    expect(await planAuthoringVaultVersion(q, input)).toMatchObject({ ok: false, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
  });
  it('refuses malformed or unavailable receipt storage without inventing an empty family', async () => {
    const id = await version(); await receipt(id);
    await q.query(`UPDATE audit_logs SET new_values=jsonb_set(new_values::jsonb,'{artifactSha256}','"tampered"')::json`);
    expect(await planAuthoringVaultVersion(q, input)).toMatchObject({ ok: false, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
    const unavailable = { query: async (sql: string, params?: unknown[]) => {
      if (/FROM audit_logs/.test(sql)) throw new Error('receipt storage unavailable');
      return q.query(sql, params);
    } };
    expect(await planAuthoringVaultVersion(unavailable, input)).toMatchObject({ ok: false, code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
  });
  it('rechecks retained legacy rows and head identity on the admission executor', async () => {
    const fresh = await planAuthoringVaultVersion(q, input);
    if (!fresh.ok) throw new Error('Expected a fresh family');
    await version({ code: BASE, label: 'draft-12345678' });
    await expect(assertAuthoringVaultVersionPlan(q, input, fresh)).rejects.toMatchObject({ code: 'AUTHORING_VAULT_VERSION_REVIEW_REQUIRED' });
    await q.query('TRUNCATE vault.documents');
    const first = await version(); await receipt(first);
    const plan = await planAuthoringVaultVersion(q, input);
    if (!plan.ok) throw new Error('Expected a verified family');
    const next = await version({ label: '2.0', supersedes: first }); await receipt(next);
    await expect(assertAuthoringVaultVersionPlan(q, input, plan)).rejects.toMatchObject({ code: 'VERSION_NOT_CURRENT' });
  });
});
