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
 *
 * 2026-10-01 (D5, NEW-P11-B-1a): classify PROPOSES. It wrote the model's
 * section code into module_number at confidence 0.5 or more on any row, an
 * approved filing copy included, with no lock, no reason and no audit event,
 * and placed a leaf under that code with no reason; the placement route
 * requires one (PX-1), and the person confirming AnA's call never saw the
 * section it would use. It now writes nothing to the document and places
 * nothing: when a sequence is named it returns the leaf a person would place,
 * and placing it is its own step with the section in view (AnA
 * place_into_sequence, or the Submission Center's PUT …/leaves with a reason).
 * extractStructure no longer writes its result into the document's metadata.
 * The cases below are restated from "places through upsertLeaf" to "places
 * nothing"; a frozen or dispatched sequence is therefore untouched too.
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
import { classifyDocument, extractStructure, CLASSIFY_PLACES_NOTHING } from '../ingestion-service';

let h: IndPgliteDb;
const ORG = 7, USER = 3, OTHER_ORG = 8;
const STAMP = '2026-09-01T00:00:00.000Z';
const docRow = async (id: number) =>
  (await h.pglite.query<{ module_number: string | null; metadata: unknown; updated_at: Date }>(
    'SELECT module_number, metadata, updated_at FROM coauthor_documents WHERE id = $1',
    [id],
  )).rows[0];

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
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status, metadata, updated_at) VALUES
      (201, ${ORG}, 'Nonclinical Overview', '<p>nonclinical overview body</p>', NULL, 'draft', '{"version":"0001"}', '${STAMP}'),
      (202, ${ORG}, 'Clinical Overview', '<p>clinical overview body</p>', 'm2.5', 'approved', '{"version":"0001"}', '${STAMP}');
    CREATE TABLE IF NOT EXISTS submission_evidence_links (
      id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, target_section_code TEXT NOT NULL,
      source_document_table TEXT NOT NULL, source_document_id INTEGER NOT NULL, source_locator TEXT,
      direction TEXT NOT NULL DEFAULT 'derives_from', confidence REAL, organization_id INTEGER NOT NULL,
      created_by INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ);
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

describe('classifyDocument proposes; it places nothing and changes no document', () => {
  it.each([
    [1, 'frozen'],
    [2, 'dispatched'],
    [3, 'draft'],
    [4, 'another organisation\'s'],
  ])('sequence %s (%s): no leaf, and the placement is reported as not made', async (seqId) => {
    const upsert = vi.fn();
    holder.upsertOverride = upsert;
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: seqId });

    expect(await leavesIn(seqId), 'classify placed a leaf').toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(result.sectionCode).toBe('m2.4');
    expect(result.leafPlacement).toEqual({ placed: false, refusal: CLASSIFY_PLACES_NOTHING });
    expect(classifyAuditDetails()).toMatchObject({ sequenceId: seqId, leafPlacement: result.leafPlacement });
  }, 60_000);

  it('returns the leaf a person would place, for them to place as its own step', async () => {
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });
    expect(result.proposedLeaf).toEqual({
      sequenceId: 3, sectionCode: 'm2.4', title: 'Nonclinical Overview', granularity: 'document',
      documentTable: 'coauthor_documents', documentId: 201, documentType: 'overview',
    });
    expect(classifyAuditDetails()).toMatchObject({ proposedLeaf: result.proposedLeaf });
  }, 60_000);

  it.each([
    [201, 'a draft', null],
    [202, 'an approved filing copy', 'm2.5'],
  ])('document %s (%s): its section, metadata and stamp are unchanged', async (docId, _label, module) => {
    await classifyDocument({ documentId: docId, userId: USER, organizationId: ORG });
    const after = await docRow(docId);
    expect(after.module_number, "the model's section code was written into the document").toBe(module);
    expect(after.metadata).toEqual({ version: '0001' });
    expect(new Date(after.updated_at).toISOString()).toBe(STAMP);
  }, 60_000);

  it('never takes the placement outcome from the model', async () => {
    holder.modelAnswer = { ...holder.modelAnswer, leafPlacement: { placed: true, refusal: null } };
    const asked = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });
    expect(asked.leafPlacement).toMatchObject({ placed: false });
    const unasked = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });
    expect(unasked.leafPlacement, 'a placement nobody asked for was reported from the model answer').toBeUndefined();
    expect(unasked.proposedLeaf).toBeUndefined();
  }, 60_000);

  it('proposes no leaf when the model proposed no section', async () => {
    holder.modelAnswer = { ...holder.modelAnswer, sectionCode: null };
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });
    expect(result.proposedLeaf).toBeUndefined();
    expect(result.leafPlacement).toMatchObject({ placed: false });
  }, 60_000);
});

describe('extractStructure records its link, and changes no document', () => {
  it("leaves the document's metadata and stamp as they were", async () => {
    holder.modelAnswer = { extractedClaims: [{ text: 'c', locator: 'p1' }], referencedSources: [] };
    await extractStructure({ documentId: 202, sectionCode: '2.5', submissionId: 1, userId: USER, organizationId: ORG });

    const after = await docRow(202);
    expect(after.metadata, 'the extraction was written into an approved filing copy').toEqual({ version: '0001' });
    expect(new Date(after.updated_at).toISOString()).toBe(STAMP);
    const links = await h.pglite.query('SELECT target_section_code, source_document_id FROM submission_evidence_links');
    expect(links.rows).toEqual([{ target_section_code: '2.5', source_document_id: 202 }]);
  }, 60_000);
});
