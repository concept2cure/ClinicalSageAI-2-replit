/**
 * upsertLeaf: a replace, append or delete may name its parent leaf in an
 * EARLIER sequence of the same submission — the leaf on file it acts on
 * (2026-10-30, D2 CSR lifecycle). Before, only a parent in the same sequence
 * was admitted, so a revised document could only be placed `new` beside the
 * one it supersedes. Every other scope stays refused: a later sequence,
 * another submission, another organization, a removed leaf, a withdrawal, and
 * any parent outside the sequence for a `new` leaf. SYNTHETIC rows on PGlite.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { upsertLeaf } from '../submission-service';

let h: IndPgliteDb;
const CTX = { organizationId: 1, userId: 9 };

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = h.db;
  holder.pool = { query: (text: string, params?: unknown[]) => h.pglite.query(text, params as unknown[]) };
  await h.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
      VALUES (1, 'SYNTHETIC IND', 'ind', 'pharma', 'fda', 1, 9), (2, 'SYNTHETIC other IND', 'ind', 'pharma', 'fda', 1, 9),
             (3, 'SYNTHETIC other org', 'ind', 'pharma', 'fda', 2, 9);
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, status, organization_id, created_by)
      VALUES (10, 1, 'fda', '0000', 'frozen', 1, 9), (11, 1, 'fda', '0001', 'draft', 1, 9), (12, 1, 'fda', '0002', 'draft', 1, 9),
             (20, 2, 'fda', '0000', 'frozen', 1, 9), (30, 3, 'fda', '0000', 'frozen', 2, 9);
    INSERT INTO submission_leaves (id, sequence_id, section_code, title, lifecycle_op, organization_id, created_by, deleted_at)
      VALUES (100, 10, 'm5.3.5.1', 'Filed report', 'new', 1, 9, NULL),
             (101, 10, 'm5.3.5.1', 'Withdrawal', 'delete', 1, 9, NULL),
             (102, 10, 'm5.3.5.1', 'Removed placement', 'new', 1, 9, now()),
             (120, 12, 'm5.3.5.1', 'Later report', 'new', 1, 9, NULL),
             (200, 20, 'm5.3.5.1', 'Other submission', 'new', 1, 9, NULL),
             (300, 30, 'm5.3.5.1', 'Other organization', 'new', 2, 9, NULL);`);
}, 120_000);
afterAll(async () => { await h?.close(); });

const place = (parentLeafId: number, lifecycleOp = 'replace', title = `Revised report ${parentLeafId} ${lifecycleOp}`) =>
  upsertLeaf({ sequenceId: 11, sectionCode: 'm5.3.5.1', title, lifecycleOp, parentLeafId, reason: 'Revised report for the Part B data cut' }, CTX);

it('admits a replace naming the current leaf of an earlier sequence of the same submission', async () => {
  const leaf = await place(100);
  expect(leaf).toMatchObject({ lifecycleOp: 'replace', parentLeafId: 100, sequenceId: 11 });
});

it('refuses a parent in a later sequence, another submission, another organization, a removed leaf or a withdrawal', async () => {
  for (const parent of [120, 200, 300, 102, 101]) {
    await expect(place(parent), `parent ${parent}`).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
});

it('still refuses a parent outside the sequence for a leaf that is not a lifecycle act', async () => {
  await expect(place(100, 'new')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
