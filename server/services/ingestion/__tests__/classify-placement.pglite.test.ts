/**
 * classifyDocument places its leaf through the canonical leaf writer.
 *
 * 2026-09-23 (W5/D7, residual repair). classifyDocument drafted a leaf
 * placement with its own `db.insert(submissionLeaves)` — no sequence-status
 * check and no sequence row lock — so a classify request (POST
 * /api/ectd/documents/:id/classify, or the AnA classify_submission_document
 * tool) wrote leaves into FROZEN and DISPATCHED sequences. A frozen sequence's
 * leaves stopped being immutable; a draft leaf in a dispatched one made transmit
 * refuse with no way back (removeLeaf refuses on a dispatched sequence); and a
 * leaf added after dispatch never met the dispatch-time filing-order rule.
 *
 * The placement now goes through upsertLeaf (status re-checked under the row
 * lock the freeze takes, section vocabulary, tenancy and source pin, Part 11
 * audit). A SubmissionError refusal is reported on the result and in the
 * classify audit record as `leafPlacement: { placed, refusal }`; any other
 * error propagates. Runs over PGlite with the REAL upsertLeaf; only the model
 * gateway and the audit writer are stubbed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  /** What the stubbed model answers. */
  modelAnswer: {} as Record<string, unknown>,
  /** When set, replaces upsertLeaf for one call. */
  upsertOverride: null as null | ((...args: unknown[]) => Promise<unknown>),
  logAction: null as any,
}));

vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() { return holder.db; },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };
});
vi.mock('../../auditService', () => {
  holder.logAction = vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true }));
  return {
    default: { logAction: (...a: unknown[]) => holder.logAction(...a) },
    writeChainedAuditRow: vi.fn(async () => {}),
  };
});
vi.mock('../../ai-gateway', () => ({
  getGateway: () => ({ route: async () => ({ content: JSON.stringify(holder.modelAnswer) }) }),
}));
vi.mock('../../submission-service/submission-service', async (orig) => {
  const real = await orig<any>();
  return {
    ...real,
    upsertLeaf: (...args: unknown[]) => {
      const override = holder.upsertOverride;
      holder.upsertOverride = null;
      return override ? override(...args) : real.upsertLeaf(...args);
    },
  };
});

import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { classifyDocument } from '../ingestion-service';

let h: IndPgliteDb;
const ORG = 7, USER = 3, OTHER_ORG = 8;

const leavesIn = async (seqId: number) =>
  (await h.pglite.query(
    `SELECT section_code, title, granularity, lifecycle_op, document_table, document_id, document_type, organization_id, created_by
       FROM submission_leaves WHERE sequence_id = $1 AND deleted_at IS NULL ORDER BY id`,
    [seqId],
  )).rows;
const classifyAuditDetails = () => {
  const calls = holder.logAction.mock.calls.filter((c: any[]) => c[0]?.details?.task === 'document-classify');
  return calls[calls.length - 1]?.[0]?.details;
};

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(`
    -- The columns of the coauthor_documents model the harness's leaf-source table leaves out.
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS sections JSONB;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS template_id INTEGER;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS created_by INTEGER;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS client_workspace TEXT;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS completion_percentage INTEGER;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS regulatory_compliance_score INTEGER;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS metadata JSONB;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS module_name TEXT;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS embedding TEXT;
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'classify', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'other tenant', 'ind', 'biotech', 'fda', ${OTHER_ORG}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (201, ${ORG}, 'Nonclinical Overview', '<p>nonclinical overview body</p>', NULL, 'draft');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES
      (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'frozen', NULL),
      (2, 1, 'fda', '0001', ${ORG}, ${USER}, 'dispatched', 'pending'),
      (3, 1, 'fda', '0002', ${ORG}, ${USER}, 'draft', NULL),
      (4, 2, 'fda', '0000', ${OTHER_ORG}, ${USER}, 'draft', NULL);
  `);
}, 120_000);
afterAll(async () => { await h.close(); });
beforeEach(() => {
  holder.modelAnswer = { sectionCode: 'm2.4', ctdModule: 2, granularity: 'document', documentType: 'overview', confidence: 0.9, rationale: 'overview' };
  holder.upsertOverride = null;
});

describe('classifyDocument places its leaf through upsertLeaf', () => {
  it.each([
    [1, 'frozen'],
    [2, 'dispatched'],
  ])('into a %s sequence (%s) places nothing and reports the refusal', async (seqId, status) => {
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: seqId });
    expect(await leavesIn(seqId), `classify wrote a leaf into a ${status} sequence`).toEqual([]);
    expect(result.sectionCode).toBe('m2.4');
    expect(result.leafPlacement, 'a refused placement was reported as nothing at all').toEqual({
      placed: false,
      refusal: `INVALID_STATE: Sequence is ${status}; its leaves are immutable.`,
    });
    expect(classifyAuditDetails()).toMatchObject({ sequenceId: seqId, leafPlacement: result.leafPlacement });
  }, 60_000);

  it('into an open sequence places the leaf as before, and says so', async () => {
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });
    expect(result.leafPlacement).toEqual({ placed: true, refusal: null });
    expect(await leavesIn(3)).toEqual([
      {
        section_code: 'm2.4', title: 'Nonclinical Overview', granularity: 'document', lifecycle_op: 'new',
        document_table: 'coauthor_documents', document_id: 201, document_type: 'overview',
        organization_id: ORG, created_by: USER,
      },
    ]);
    expect(classifyAuditDetails()).toMatchObject({ sequenceId: 3, leafPlacement: { placed: true, refusal: null } });
  }, 60_000);

  it("reports another organization's sequence as a refusal, not as a silent skip", async () => {
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 4 });
    expect(result.leafPlacement).toMatchObject({ placed: false, refusal: expect.stringMatching(/^NOT_FOUND: /) });
    expect(await leavesIn(4)).toEqual([]);
  }, 60_000);

  it('reports a section code the submission vocabulary refuses', async () => {
    holder.modelAnswer = { ...holder.modelAnswer, sectionCode: 'm1/us/1.2' };
    const before = (await leavesIn(3)).length;
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });
    expect(result.leafPlacement).toMatchObject({ placed: false, refusal: expect.stringMatching(/^VALIDATION: /) });
    expect((await leavesIn(3)).length).toBe(before);
  }, 60_000);

  it('never takes the placement outcome from the model', async () => {
    holder.modelAnswer = { ...holder.modelAnswer, leafPlacement: { placed: true, refusal: null } };
    const refused = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 1 });
    expect(refused.leafPlacement).toMatchObject({ placed: false });
    const unasked = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });
    expect(unasked.leafPlacement, 'a placement nobody asked for was reported from the model answer').toBeUndefined();
  }, 60_000);

  it('does not swallow an error that is not a placement refusal', async () => {
    holder.upsertOverride = async () => { throw new Error('connection terminated unexpectedly'); };
    await expect(classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 }))
      .rejects.toThrow('connection terminated unexpectedly');
  }, 60_000);
});
