/**
 * One live placement per document per section, in one sequence (QA j3 finding (a), 2026-10-08).
 *
 * Before: placing the same Vault document into the same section of the same sequence
 * twice filed two live leaves for one file, and the packager then named two leaves
 * the same output file. The fix is a no-op on the second placement (the existing
 * leaf comes back, nothing is written, nothing is audited) and a named refusal when
 * the same document is asked to take a different lifecycle operation there.
 *
 * What is NOT refused: a DIFFERENT document in an occupied section. The product
 * already decided that a section may hold several New leaves (dispatch-readiness
 * reports DUPLICATE_NEW_SECTION as info, "without erroring"; the eCTD packager
 * notes that a section commonly holds several leaves). Test 3 pins that.
 *
 * Real SQL on in-process PGlite, the same harness as leaf-cross-project.pglite.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { VAULT_DDL } from '../../../routes/__tests__/_authoring-canvas-fixture';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../auditService', () => ({ default: { logAction } }));

import { upsertLeaf, removeLeaf, SubmissionError } from '../submission-service';

let harness: IndPgliteDb;
const CTX = { organizationId: 1, userId: 9 };
const P = '0a000000-0000-4000-8000-0000000000aa';
const DOC_1 = 'a1000000-0000-4000-8000-0000000000a1';
const DOC_2 = 'a2000000-0000-4000-8000-0000000000a2';
let SEQ = 0;

async function q<T = any>(text: string, params: unknown[] = []) {
  return (await harness.pglite.query<T>(text, params)).rows;
}

async function liveLeaves(sectionCode: string): Promise<Array<{ id: number; lifecycle_op: string; document_uuid: string }>> {
  return q(
    `SELECT id, lifecycle_op, document_uuid FROM submission_leaves
      WHERE sequence_id = $1 AND section_code = $2 AND deleted_at IS NULL ORDER BY id`,
    [SEQ, sectionCode],
  );
}

function placeVault(sectionCode: string, documentUuid: string, lifecycleOp: 'new' | 'replace' | 'append' | 'delete' = 'new') {
  return upsertLeaf(
    {
      sequenceId: SEQ,
      sectionCode,
      title: 'Vorelinib DS specification',
      lifecycleOp,
      documentTable: 'vault_documents',
      documentUuid,
      reason: 'Final specification for this sequence',
    },
    CTX,
  );
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true, programSpine: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) };
  await harness.pglite.exec(VAULT_DDL);

  await q(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name)
     VALUES ($1, $2, 'Program P', 'P-1', 'ind', 'Alpha')`,
    [P, CTX.organizationId],
  );
  for (const [id, hash] of [[DOC_1, 'a'.repeat(64)], [DOC_2, 'b'.repeat(64)]]) {
    await q(
      `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, content_hash)
       VALUES ($1, $2, $3, $4, $4, 'PROTOCOL', $5)`,
      [id, P, CTX.organizationId, `doc-${id.slice(0, 2)}`, hash],
    );
  }
  const [s] = await q<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ('IND', 'Alpha', 'ind', 'pharma', 'fda', $1, $2, $3) RETURNING id`,
    [CTX.organizationId, CTX.userId, P],
  );
  const [seq] = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'draft', $2, $3) RETURNING id`,
    [Number(s.id), CTX.organizationId, CTX.userId],
  );
  SEQ = Number(seq.id);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(() => {
  logAction.mockClear();
});

describe('one live placement per document per section', () => {
  it('placing the same document into the same section again returns the existing leaf and writes nothing', async () => {
    const first = await placeVault('3.2.S.4.1', DOC_1);
    logAction.mockClear();

    const again = await placeVault('3.2.S.4.1', DOC_1);

    expect(again.id).toBe(first.id);
    expect(again.unchanged).toBe(true);
    expect(again.auditTrail).toBeNull();
    expect(await liveLeaves('3.2.S.4.1')).toHaveLength(1);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('the same document under a different lifecycle operation is refused by name, and nothing is written', async () => {
    const first = await placeVault('3.2.S.4.2', DOC_1, 'new');

    const err = await placeVault('3.2.S.4.2', DOC_1, 'delete').catch((e) => e);

    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('ALREADY_PLACED');
    expect(err.message).toContain(String(first.id));
    expect(await liveLeaves('3.2.S.4.2')).toEqual([{ id: first.id, lifecycle_op: 'new', document_uuid: DOC_1 }]);
  });

  it('a DIFFERENT document may still be placed into an occupied section: the section may hold several New leaves', async () => {
    const first = await placeVault('3.2.S.4.3', DOC_1);
    const second = await placeVault('3.2.S.4.3', DOC_2);

    expect(second.id).not.toBe(first.id);
    expect(second.unchanged).toBeUndefined();
    expect((await liveLeaves('3.2.S.4.3')).map((l) => l.document_uuid)).toEqual([DOC_1, DOC_2]);
  });

  it('a document whose earlier leaf was removed is placed again as a new leaf (the check reads only live leaves)', async () => {
    const first = await placeVault('3.2.S.4.4', DOC_1);
    await removeLeaf(first.id, SEQ, CTX);

    const again = await placeVault('3.2.S.4.4', DOC_1);

    expect(again.id).not.toBe(first.id);
    expect(again.unchanged).toBeUndefined();
    expect((await liveLeaves('3.2.S.4.4')).map((l) => l.id)).toEqual([again.id]);
  });
});
