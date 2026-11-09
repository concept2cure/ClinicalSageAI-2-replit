/**
 * P-108 3(b), through each door that reaches upsertLeaf with a document pointer.
 *
 * Uploads reach a sequence only through upsertLeaf's API doors: REST
 * `PUT /api/submissions/sequences/:seqId/leaves`, AnA's `place_into_sequence`
 * and the MCP connector's `c2c_file_draft_for_review`. No client screen places
 * one. Each door must hand the one refusal back word for word and write
 * nothing, and AnA, whose enum keeps the store for withdrawals, must still
 * place a withdrawal.
 *
 * The real upsertLeaf runs against a stubbed db (the refusal comes before any
 * document read); the withdrawal and the table-level proof are in
 * upload-placement-retired.pglite.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'upload-placement-retired-secret-32-chars';
});

const selectChain = vi.fn();
const executeChain = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const poolQuery = vi.fn();
vi.mock('../../../db', () => {
  const db: any = {
    select: () => {
      const tail = { limit: () => selectChain() };
      const afterWhere = { ...tail, orderBy: () => tail, for: () => selectChain() };
      return { from: () => ({ where: () => afterWhere }) };
    },
    execute: (...a: unknown[]) => executeChain(...a),
    insert: () => ({ values: (v: unknown) => ({ returning: () => insertValues(v) }) }),
    update: () => ({
      set: (v: unknown) => ({ where: () => ({ returning: () => updateSet(v) }) }),
    }),
  };
  db.transaction = async (fn: (tx: any) => unknown) => fn({ ...db, execute: async () => ({ rows: [{ status: 'draft' }] }) });
  return { pool: { query: (...a: unknown[]) => poolQuery(...a) }, db };
});
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) },
}));
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../../middleware/auth';
import submissionsRouter from '../../../routes/submissions';
import { getToolHandler, type ToolContext } from '../../ana/AnaToolExecutor.js';
import { fileDraftForReview } from '../../../mcp/tools/governed';

const RETIRED =
  'Uploads are no longer placed in a sequence. Upload the file to the project’s Vault, approve it there, and place ' +
  'that Vault version. An upload already filed can still be withdrawn (lifecycle operation delete). Nothing was placed.';

const ORG = 7;
const USER = 3;
const SEQUENCE_ID = 11;
const UPLOAD_ID = 900;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: USER, userId: USER, organizationId: ORG, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeEach(() => {
  for (const f of [selectChain, executeChain, insertValues, updateSet, poolQuery]) f.mockReset();
  // getSequence, then the submission read that picks the section-code vocabulary.
  selectChain.mockResolvedValueOnce([{ id: SEQUENCE_ID, status: 'draft', submissionId: 21, organizationId: ORG }]);
  selectChain.mockResolvedValueOnce([{ applicationType: 'ind' }]);
  // The tenancy read finds the caller's own upload; its bytes are not on disk, so no pin.
  selectChain.mockResolvedValueOnce([{ storagePath: '/nonexistent/form-1571.pdf' }]);
  selectChain.mockResolvedValue([]);
  poolQuery.mockResolvedValue({ rows: [] });
  insertValues.mockResolvedValue([{ id: 99, sequenceId: SEQUENCE_ID, sectionCode: 'm1.1.1', title: 'Form FDA 1571', lifecycleOp: 'delete', documentTable: 'ctd_onboarding_documents', documentId: UPLOAD_ID }]);
  updateSet.mockResolvedValue([{ id: 99 }]);
});

function nothingWritten() {
  expect(insertValues).not.toHaveBeenCalled();
  expect(updateSet).not.toHaveBeenCalled();
}

describe('P-108 3(b): each door hands back the one refusal and places nothing', () => {
  it('REST PUT /api/submissions/sequences/:seqId/leaves answers 400 with the refusal', async () => {
    const res = await request(app)
      .put(`/api/submissions/sequences/${SEQUENCE_ID}/leaves`)
      .send({
        sectionCode: 'm1.1.1',
        title: 'Form FDA 1571',
        lifecycleOp: 'new',
        documentTable: 'ctd_onboarding_documents',
        documentId: UPLOAD_ID,
        reason: 'Signed 1571 for the initial IND',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION', message: RETIRED });
    nothingWritten();
  });

  it('AnA place_into_sequence returns the refusal verbatim', async () => {
    const handler = getToolHandler('place_into_sequence')!;
    const out = JSON.parse(
      await handler(
        { sequence_id: SEQUENCE_ID, section_code: 'm1.1.1', title: 'Form FDA 1571', document_table: 'ctd_onboarding_documents', document_id: UPLOAD_ID },
        { organizationId: ORG, userId: USER, humanConfirmed: true } as ToolContext,
      ),
    );
    expect(out).toEqual({ error: `place_into_sequence failed: ${RETIRED}`, code: 'VALIDATION' });
    nothingWritten();
  });

  it('MCP c2c_file_draft_for_review is refused with the same sentence', async () => {
    const outcome = await fileDraftForReview.run(
      {
        sequence_id: SEQUENCE_ID,
        section_code: 'm1.1.1',
        title: 'Form FDA 1571',
        document_table: 'ctd_onboarding_documents',
        document_id: UPLOAD_ID,
        lifecycle_op: 'new',
        reason: 'Signed 1571 for the initial IND',
      } as any,
      { principal: { organizationId: ORG, userId: USER }, config: { appBaseUrl: 'https://app.example.invalid' } } as any,
    );
    nothingWritten();
    expect(outcome).toEqual({ kind: 'refused', reason: `${RETIRED} (code VALIDATION)` });
  });
});

describe('P-108 3(b): AnA keeps the upload store for a withdrawal', () => {
  it('places a withdrawal (lifecycle operation delete) of an upload through place_into_sequence', async () => {
    const handler = getToolHandler('place_into_sequence')!;
    const out = JSON.parse(
      await handler(
        { sequence_id: SEQUENCE_ID, section_code: 'm1.1.1', title: 'Form FDA 1571', lifecycle_op: 'delete', document_table: 'ctd_onboarding_documents', document_id: UPLOAD_ID },
        { organizationId: ORG, userId: USER, humanConfirmed: true } as ToolContext,
      ),
    );
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({ ok: true, leaf: { lifecycleOp: 'delete', documentTable: 'ctd_onboarding_documents', documentId: UPLOAD_ID } });
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toMatchObject({ lifecycleOp: 'delete', documentTable: 'ctd_onboarding_documents', documentId: UPLOAD_ID });
  });
});
