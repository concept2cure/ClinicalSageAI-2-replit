/**
 * A protocol write names a protocol of the caller's own organisation, and the
 * content a finalization signs does not change after it (periodic review
 * 2026-09-28, editor family, SEC-C-2, SEC-C-3, SEC-C-8), against the REAL
 * migrations in PGlite.
 *
 * - SEC-C-2: the schedule of assessments is in the §11.70 binding
 *   (signature-persistence.ts, the protocol-document content digest), yet its
 *   three writers never read the protocol's status, so a finalized or
 *   superseded protocol still took new assessments and cell changes.
 * - SEC-C-3: the budget-parameter upsert is keyed on the document id alone and
 *   never proved the document was the caller's, so one tenant could claim, and
 *   so block or overwrite, another tenant's row.
 * - SEC-C-8: the same shape on five more create paths (assessment, risk,
 *   milestone, budget line, review assignment and review comment): each wrote a
 *   row, and a governed-action ledger entry, against a document id it never
 *   looked up.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const holder = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
}));
vi.mock('../../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => holder.query(s, p) }, db: {} }));
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => holder.query(s, p) }, db: {} }));

import { addAssessmentTx, setCellTx, clearCellTx } from '../../protocol-soa/protocol-soa-service';
import { addBudgetItemTx, setBudgetParamsTx } from '../../protocol-budget/protocol-budget-service';
import { addRiskTx } from '../../protocol-risks/protocol-risks-service';
import { addMilestoneTx } from '../../protocol-milestones/protocol-milestones-service';
import { assignReviewerTx, addCommentTx } from '../../protocol-reviews/protocol-reviews-service';

const ORG = 42;
const OTHER_ORG = 99;
const AUTHOR = 7;
const STRANGER = 10;

let pglite: PGlite;
const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length };
};
const client = { query: q };

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

async function count(table: string, where = 'TRUE', params: unknown[] = []): Promise<number> {
  return Number((await q(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n);
}

/** A protocol with one visit, one assessment and one marked cell. */
async function protocolWithSchedule(orgId = ORG, createdBy = AUTHOR) {
  const d = await q(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, created_by)
     VALUES ($1,'clinical','A Phase 2 Study',$2) RETURNING id`,
    [orgId, createdBy],
  );
  const docId = Number(d.rows[0].id);
  const v = await q(
    `INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, order_index, created_by)
     VALUES ($1,$2,'Screening',0,$3) RETURNING id`,
    [orgId, docId, createdBy],
  );
  const visitId = Number(v.rows[0].id);
  const a = await q(
    `INSERT INTO protocol_soa_assessments (organization_id, protocol_document_id, name, category, order_index, created_by)
     VALUES ($1,$2,'Vital signs','vital_signs',0,$3) RETURNING id`,
    [orgId, docId, createdBy],
  );
  const assessmentId = Number(a.rows[0].id);
  await q(
    `INSERT INTO protocol_soa_cells (organization_id, protocol_document_id, assessment_id, visit_id, required, created_by)
     VALUES ($1,$2,$3,$4,true,$5)`,
    [orgId, docId, assessmentId, visitId, createdBy],
  );
  return { docId, visitId, assessmentId };
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, 'the write was expected to be refused').not.toBeNull();
  return String((err as { code?: string }).code);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, name TEXT);
    CREATE TABLE research_personnel (id SERIAL PRIMARY KEY);
    CREATE TABLE organization_users (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', UNIQUE (user_id, organization_id));
    INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');
    INSERT INTO users (id, email, name) VALUES (${AUTHOR},'a@e.test','Author'), (${STRANGER},'s@e.test','Stranger');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG},${AUTHOR},'member'), (${OTHER_ORG},${STRANGER},'member');
  `);
  for (const m of [
    'migrations/20260621_protocol_development.sql',
    'migrations/20260622_protocol_risks.sql',
    'migrations/20260629_protocol_reviews.sql',
    'migrations/20260630_protocol_milestones.sql',
    'migrations/20260701_protocol_soa.sql',
    'migrations/20260702_protocol_budget.sql',
    'migrations/20260921_protocol_documents_sponsor_pi.sql',
  ]) await pglite.exec(migration(m));
  holder.query = q;
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

describe('a finalized protocol’s schedule of assessments does not change (SEC-C-2)', () => {
  it.each(['finalized', 'superseded'])('a %s protocol takes no new assessment, and no cell is set or cleared', async (status) => {
    const { docId, visitId, assessmentId } = await protocolWithSchedule();
    await q(`UPDATE protocol_documents SET status = $2 WHERE id = $1`, [docId, status]);

    expect(await refusal(addAssessmentTx(client, ORG, AUTHOR, docId, { name: 'ECG', category: 'exam' }))).toBe('INVALID_STATE');
    expect(await refusal(setCellTx(client, ORG, AUTHOR, { assessmentId, visitId, required: false, notes: 'optional now' }))).toBe('INVALID_STATE');
    expect(await refusal(clearCellTx(client, ORG, assessmentId, visitId))).toBe('INVALID_STATE');

    // What was signed is what is there.
    expect(await count('protocol_soa_assessments', 'protocol_document_id = $1', [docId])).toBe(1);
    const cell = await q(`SELECT required, notes FROM protocol_soa_cells WHERE assessment_id = $1 AND visit_id = $2`, [assessmentId, visitId]);
    expect(cell.rows).toEqual([{ required: true, notes: null }]);
  });

  it('a protocol still in development takes all three', async () => {
    const { docId, visitId, assessmentId } = await protocolWithSchedule();
    const added = await addAssessmentTx(client, ORG, AUTHOR, docId, { name: 'ECG', category: 'exam' });
    expect(added.id).toBeGreaterThan(0);
    await setCellTx(client, ORG, AUTHOR, { assessmentId, visitId, required: false });
    await clearCellTx(client, ORG, assessmentId, visitId);
    expect(await count('protocol_soa_cells', 'assessment_id = $1', [assessmentId])).toBe(0);
  });
});

describe('a write names a protocol of the caller’s own organisation (SEC-C-3, SEC-C-8)', () => {
  it('another tenant cannot claim, block or overwrite a protocol’s budget parameters', async () => {
    const { docId } = await protocolWithSchedule(OTHER_ORG, STRANGER);
    // Before the owner has set any, a foreign write would have claimed the row.
    expect(await refusal(setBudgetParamsTx(client, ORG, AUTHOR, docId, { targetEnrollment: 1, sponsorPaymentPerSubject: 1 }))).toBe('NOT_FOUND');
    expect(await count('protocol_budget_params', 'protocol_document_id = $1', [docId])).toBe(0);

    // The owner sets them; a foreign write still changes nothing.
    await setBudgetParamsTx(client, OTHER_ORG, STRANGER, docId, { targetEnrollment: 120, sponsorPaymentPerSubject: 9000 });
    expect(await refusal(setBudgetParamsTx(client, ORG, AUTHOR, docId, { targetEnrollment: 1, sponsorPaymentPerSubject: 1 }))).toBe('NOT_FOUND');
    const row = await q(`SELECT organization_id, target_enrollment, sponsor_payment_per_subject::float AS pay FROM protocol_budget_params WHERE protocol_document_id = $1`, [docId]);
    expect(row.rows).toEqual([{ organization_id: OTHER_ORG, target_enrollment: 120, pay: 9000 }]);

    // And the owner can still change its own.
    await setBudgetParamsTx(client, OTHER_ORG, STRANGER, docId, { targetEnrollment: 150, sponsorPaymentPerSubject: 9000 });
    expect((await q(`SELECT target_enrollment FROM protocol_budget_params WHERE protocol_document_id = $1`, [docId])).rows[0].target_enrollment).toBe(150);
  });

  const FOREIGN_WRITES: Array<[string, string, (docId: number) => Promise<unknown>]> = [
    ['a schedule assessment', 'protocol_soa_assessments', (docId) => addAssessmentTx(client, ORG, AUTHOR, docId, { name: 'ECG' })],
    ['a budget line', 'protocol_budget_items', (docId) => addBudgetItemTx(client, ORG, AUTHOR, docId, { description: 'Site fee', unitCost: 100 })],
    ['a risk', 'protocol_risks', (docId) => addRiskTx(client, ORG, AUTHOR, { protocolDocumentId: docId, description: 'Hepatotoxicity at 40 mg' })],
    ['a milestone', 'protocol_milestones', (docId) => addMilestoneTx(client, ORG, AUTHOR, docId, { name: 'First subject in' })],
    ['a review assignment', 'protocol_review_assignments', (docId) => assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: 'Dr. Reviewer' })],
    ['a review comment', 'protocol_review_comments', (docId) => addCommentTx(client, ORG, AUTHOR, docId, { comment: 'Clarify the washout.' })],
  ];

  it.each(FOREIGN_WRITES)('%s against another tenant’s protocol is refused, and nothing is written', async (_label, table, write) => {
    const { docId } = await protocolWithSchedule(OTHER_ORG, STRANGER);
    const before = await count(table, 'protocol_document_id = $1', [docId]);
    expect(await refusal(write(docId))).toBe('NOT_FOUND');
    expect(await count(table, 'protocol_document_id = $1', [docId])).toBe(before);
  });

  it.each(FOREIGN_WRITES)('%s against a protocol that does not exist is refused', async (_label, table, write) => {
    const before = await count(table);
    expect(await refusal(write(987654))).toBe('NOT_FOUND');
    expect(await count(table)).toBe(before);
  });

  it.each(FOREIGN_WRITES)('%s against the caller’s own protocol is written', async (_label, table, write) => {
    const { docId } = await protocolWithSchedule();
    const before = await count(table, 'protocol_document_id = $1', [docId]);
    await write(docId);
    expect(await count(table, 'protocol_document_id = $1', [docId])).toBe(before + 1);
  });
});
