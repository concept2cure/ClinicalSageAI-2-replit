/** The ordinary leaf writer must enforce company legal applicability too.
 * Real SQL exercises the generic upsertLeaf path, so the company picker is
 * never the only place an expired or wrong-target legal version is refused. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { VAULT_DDL } from '../../../routes/__tests__/_authoring-canvas-fixture';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
const logAction = vi.hoisted(() => vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
vi.mock('../../auditService', () => ({ default: { logAction } }));

import { SubmissionError, upsertLeaf } from '../submission-service';

const CTX = { organizationId: 1, userId: 9 };
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '33333333-3333-4333-8333-333333333333';
const LEGAL = '22222222-2222-4222-8222-222222222222';
const ORDINARY = '44444444-4444-4444-8444-444444444444';
const LEGAL_HASH = 'a'.repeat(64);
const ORDINARY_HASH = 'b'.repeat(64);
let harness: IndPgliteDb;
let sequenceId: number;

async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pglite.query<T>(text, params)).rows;
}

const registered = (overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument => ({
  id: 'legal_registered', title: 'Sponsor authorization', kind: 'authorization', programId: PROGRAM,
  vaultDocumentId: LEGAL, contentHash: LEGAL_HASH, version: '1.0',
  agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en',
  effectiveOn: '2000-01-01', expiresOn: null, active: true,
  registeredAt: '2026-01-01T00:00:00.000Z', registeredBy: '9', ...overrides,
});
async function library(documents: CompanyLegalDocument[], organizationId = CTX.organizationId) {
  await q('UPDATE organizations SET settings=$2::jsonb WHERE id=$1', [organizationId, JSON.stringify({ companyDocuments: { version: 1, revision: 1, legalDocuments: documents } })]);
}
const place = (documentUuid: string, leafId?: number) => upsertLeaf({
  sequenceId, sectionCode: 'm1.2', title: 'Sponsor document',
  documentTable: 'vault_documents', documentUuid, reason: 'Explicitly selected for this filing', ...(leafId ? { leafId } : {}),
}, CTX);
async function leafCount() {
  const [row] = await q<{ count: number }>('SELECT count(*)::int AS count FROM submission_leaves WHERE sequence_id=$1', [sequenceId]);
  return row.count;
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params) };
  await harness.pglite.exec(VAULT_DDL);
  await q("INSERT INTO organizations (id,name) VALUES (1,'Sponsor organization'),(2,'Another organization')");
  await q(`INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_name)
    VALUES ($1,1,'IND program','IND-1','ind','Product')`, [PROGRAM]);
  for (const [id, code, hash] of [[LEGAL, 'authorization', LEGAL_HASH], [ORDINARY, 'protocol', ORDINARY_HASH]]) {
    await q(`INSERT INTO vault.documents (id,program_id,organization_id,document_code,document_title,document_type,content_hash,mime_type)
      VALUES ($1,$2,1,$3,$3,'OTHER',$4,'application/pdf')`, [id, PROGRAM, code, hash]);
  }
  const [submission] = await q<{ id: number }>(`INSERT INTO submissions
    (title,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES ('US IND','ind','pharma','fda',1,9,$1) RETURNING id`, [PROGRAM]);
  const [sequence] = await q<{ id: number }>(`INSERT INTO ectd_sequences
    (submission_id,region,sequence_number,status,organization_id,created_by)
    VALUES ($1,'fda','0000','draft',1,9) RETURNING id`, [submission.id]);
  sequenceId = Number(sequence.id);
}, 60_000);

beforeEach(async () => {
  await q('DELETE FROM submission_leaves');
  await library([]);
  await library([], 2);
  logAction.mockClear();
});
afterAll(async () => { await harness?.close(); });

describe('canonical Vault leaf placement checks active company legal applicability', () => {
  it.each<[string, Partial<CompanyLegalDocument>, RegExp]>([
    ['expired', { expiresOn: '2000-01-01' }, /expired/i],
    ['not yet effective', { effectiveOn: '2999-01-01' }, /not effective/i],
    ['wrong agency', { agencies: ['EMA'] }, /agency/i],
    ['wrong country', { countries: ['EU'] }, /country|region/i],
    ['wrong application type', { submissionTypes: ['nda'] }, /submission type/i],
    ['wrong registered program', { programId: OTHER_PROGRAM }, /target program|copy this document/i],
  ])('refuses an %s registered version through generic upsertLeaf and writes no leaf', async (_label, overrides, message) => {
    await library([registered(overrides)]);
    const result = await place(LEGAL).catch(error => error);
    expect(result).toBeInstanceOf(SubmissionError);
    expect(result.code).toBe('VALIDATION');
    expect(result.message).toMatch(message);
    expect(await leafCount()).toBe(0);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('permits a matching registered draft for preparation and pins its original hash without claiming approval', async () => {
    // There is no approved canonical_documents row in this database. Placement
    // prepares a draft filing; canonical Vault transmission still owns approval.
    await library([registered()]);
    const leaf = await place(LEGAL);
    expect(leaf.documentUuid).toBe(LEGAL);
    expect(leaf.documentContentSha256).toBe(LEGAL_HASH);
    expect(leaf.documentPinnedAt).not.toBeNull();
    expect(await leafCount()).toBe(1);
  });

  it('keeps ordinary Vault placement available when a different registered document is expired', async () => {
    await library([registered({ expiresOn: '2000-01-01' })]);
    const leaf = await place(ORDINARY);
    expect(leaf.documentUuid).toBe(ORDINARY);
    expect(leaf.documentContentSha256).toBe(ORDINARY_HASH);
    expect(await leafCount()).toBe(1);
  });

  it('does not apply another organization’s registry metadata to this organization’s Vault version', async () => {
    await library([registered({ expiresOn: '2000-01-01', agencies: ['EMA'] })], 2);
    const leaf = await place(LEGAL);
    expect(leaf.documentUuid).toBe(LEGAL);
    expect(await leafCount()).toBe(1);
  });

  it('refuses re-pointing an existing ordinary leaf at an inapplicable legal version and preserves its old pin', async () => {
    const leaf = await place(ORDINARY);
    logAction.mockClear();
    await library([registered({ countries: ['EU'] })]);
    await expect(place(LEGAL, leaf.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    const [saved] = await q<{ document_uuid: string; document_content_sha256: string }>(
      'SELECT document_uuid,document_content_sha256 FROM submission_leaves WHERE id=$1', [leaf.id]);
    expect(saved).toEqual({ document_uuid: ORDINARY, document_content_sha256: ORDINARY_HASH });
    expect(await leafCount()).toBe(1);
    expect(logAction).not.toHaveBeenCalled();
  });
});
