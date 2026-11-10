/**
 * P-108 3(b) (founder, 2026-11-08): an upload is no longer placed in a sequence.
 *
 * "Retire ctd_onboarding_documents as a source of placeable leaves; it has no
 * upload caller in any history and no deploy applier. Its replacement is
 * VaultPlaceIntoSubmission.tsx." The coordinating session confirmed the scope on
 * 2026-11-09: one refusal at upsertLeaf for any new content (any lifecycle
 * operation except delete) that names the upload store. The vocabulary is
 * unchanged, so an upload already filed still resolves, is still judged by
 * readiness (P-94 C1), and can still be withdrawn.
 *
 * Against real SQL (in-process PGlite), so "nothing was placed" is read from
 * the table, not from a stub that was never called.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({
  default: {
    logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })),
  },
}));

import { upsertLeaf } from '../submission-service';

/** The refusal a person or a tool reads, word for word. */
const RETIRED =
  'Uploads are no longer placed in a sequence. Upload the file to the project’s Vault, approve it there, and place ' +
  'that Vault version. An upload already filed can still be withdrawn (lifecycle operation delete). Nothing was placed.';

const OWNER = { organizationId: 1, userId: 9 };
const UPLOAD_ID = 900;

let harness: IndPgliteDb;
let DRAFT_SEQUENCE_ID = 0;
let FILED_UPLOAD_LEAF_ID = 0;
let DRAFT_UPLOAD_LEAF_ID = 0;

async function q<T = any>(text: string, params: unknown[] = []) {
  const r = await harness.pglite.query<T>(text, params);
  return r.rows;
}

async function leavesOfDraft() {
  return q<{ id: number; title: string; lifecycle_op: string; document_table: string | null; document_id: number | null }>(
    `SELECT id, title, lifecycle_op, document_table, document_id FROM submission_leaves
      WHERE sequence_id = $1 AND deleted_at IS NULL ORDER BY id`,
    [DRAFT_SEQUENCE_ID],
  );
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  const [submission] = await q<{ id: number | string }>(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ('IND 123456', 'ind', 'biotech', 'us', $1, $2, '00000000-0000-0000-0000-000000000001') RETURNING id`,
    [OWNER.organizationId, OWNER.userId],
  );
  const submissionId = Number(submission.id);
  const [filed] = await q<{ id: number | string }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'us', '0000', 'dispatched', $2, $3) RETURNING id`,
    [submissionId, OWNER.organizationId, OWNER.userId],
  );
  const [draft] = await q<{ id: number | string }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, organization_id, created_by)
     VALUES ($1, 'us', '0001', 'draft', $2, $3) RETURNING id`,
    [submissionId, OWNER.organizationId, OWNER.userId],
  );
  DRAFT_SEQUENCE_ID = Number(draft.id);

  await q(
    `INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
     VALUES ($1, $2, 'form-1571.pdf', 'application/pdf', 'uploads/form-1571-not-on-disk.pdf')`,
    [UPLOAD_ID, OWNER.organizationId],
  );

  // History: the upload as it was filed in 0000, and an upload placed in the
  // draft 0001 before this change. Written directly, as they were written then.
  const [filedLeaf] = await q<{ id: number | string }>(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
     VALUES ($1, 'm1.1.1', 'Form FDA 1571', 'new', 'ctd_onboarding_documents', $2, $3, $4) RETURNING id`,
    [Number(filed.id), UPLOAD_ID, OWNER.organizationId, OWNER.userId],
  );
  FILED_UPLOAD_LEAF_ID = Number(filedLeaf.id);
  const [draftLeaf] = await q<{ id: number | string }>(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
     VALUES ($1, 'm1.3', 'Signed Form 3674', 'new', 'ctd_onboarding_documents', $2, $3, $4) RETURNING id`,
    [DRAFT_SEQUENCE_ID, UPLOAD_ID, OWNER.organizationId, OWNER.userId],
  );
  DRAFT_UPLOAD_LEAF_ID = Number(draftLeaf.id);
});

afterAll(async () => {
  await harness.close();
});

/* The withdrawal runs first: it is the act that must keep working, and it must
   not depend on what the refusal cases leave behind. */
describe('P-108 3(b): an upload already filed can still be withdrawn', () => {
  it('places the withdrawal of the filed upload (lifecycle operation delete)', async () => {
    const leaf = await upsertLeaf(
      {
        sequenceId: DRAFT_SEQUENCE_ID,
        sectionCode: 'm1.1.1',
        title: 'Form FDA 1571',
        lifecycleOp: 'delete',
        parentLeafId: FILED_UPLOAD_LEAF_ID,
        documentTable: 'ctd_onboarding_documents',
        documentId: UPLOAD_ID,
      },
      OWNER,
    );
    expect(leaf).toMatchObject({
      sequenceId: DRAFT_SEQUENCE_ID,
      lifecycleOp: 'delete',
      parentLeafId: FILED_UPLOAD_LEAF_ID,
      documentTable: 'ctd_onboarding_documents',
      documentId: UPLOAD_ID,
    });
    const rows = await leavesOfDraft();
    expect(rows.filter((r) => r.lifecycle_op === 'delete' && r.document_table === 'ctd_onboarding_documents')).toHaveLength(1);
  });
});

describe('P-108 3(b): new content from the upload store is refused at upsertLeaf', () => {
  /* Each case in its own section, so that before this change each one is a
     placement that happens, not a collision with the case before it. */
  const CASES = [
    { lifecycleOp: undefined, sectionCode: 'm1.2' },
    { lifecycleOp: 'new', sectionCode: 'm1.4.1' },
    { lifecycleOp: 'replace', sectionCode: 'm1.6.1' },
    { lifecycleOp: 'append', sectionCode: 'm1.12.1' },
  ] as const;
  for (const { lifecycleOp, sectionCode } of CASES) {
    it(`refuses an upload placed with lifecycle operation ${lifecycleOp ?? '(none given)'}, and writes nothing`, async () => {
      const before = await leavesOfDraft();
      await expect(
        upsertLeaf(
          {
            sequenceId: DRAFT_SEQUENCE_ID,
            sectionCode,
            title: 'Form FDA 1571',
            ...(lifecycleOp ? { lifecycleOp } : {}),
            ...(lifecycleOp === 'replace' || lifecycleOp === 'append' ? { parentLeafId: FILED_UPLOAD_LEAF_ID } : {}),
            documentTable: 'ctd_onboarding_documents',
            documentId: UPLOAD_ID,
          },
          OWNER,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION', message: RETIRED });
      expect(await leavesOfDraft()).toEqual(before);
    });
  }

  it('refuses re-writing an upload leaf placed before this change, and leaves it as it was', async () => {
    const before = await leavesOfDraft();
    await expect(
      upsertLeaf(
        {
          sequenceId: DRAFT_SEQUENCE_ID,
          leafId: DRAFT_UPLOAD_LEAF_ID,
          sectionCode: 'm1.3',
          title: 'Signed Form 3674 (corrected title)',
          documentTable: 'ctd_onboarding_documents',
          documentId: UPLOAD_ID,
        },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: RETIRED });
    expect(await leavesOfDraft()).toEqual(before);
  });
});
