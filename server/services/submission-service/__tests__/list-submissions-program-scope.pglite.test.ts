/**
 * The submission list scoped to one program (QA j3 finding (b), 2026-10-08).
 *
 * The filing picker offered every submission of the organization that was not
 * anchored to another program: four unanchored submissions (program_id NULL) were
 * offered to a Vorelinib document, against the dialog's own words "a document is
 * placed only into its own project's submissions". The list is now scoped on the
 * server (listSubmissions with a programId); the unscoped list, which the Submission
 * Center and Dispatch Readiness read, is unchanged.
 *
 * Real SQL on in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true })) } }));

import { listSubmissions } from '../submission-service';

let harness: IndPgliteDb;
const CTX = { organizationId: 1, userId: 9 };
const P_OPEN = '0a000000-0000-4000-8000-0000000000ab';
const P_OTHER = '0b000000-0000-4000-8000-0000000000ab';

async function insertSubmission(title: string, programId: string | null): Promise<number> {
  const [row] = (await harness.pglite.query<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'Alpha', 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`,
    [title, CTX.organizationId, CTX.userId, programId],
  )).rows;
  return Number(row.id);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true, programSpine: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) };
  for (const [id, code] of [[P_OPEN, 'OPEN'], [P_OTHER, 'OTHER']]) {
    await harness.pglite.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name)
       VALUES ($1, $2, $3, $4, 'ind', 'Alpha')`,
      [id, CTX.organizationId, `Program ${code}`, code],
    );
  }
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

describe('the submission list, scoped to a program', () => {
  it("returns only the program's own submissions when a programId is given", async () => {
    const own = await insertSubmission('Own IND', P_OPEN);
    const other = await insertSubmission('Other IND', P_OTHER);
    const unanchored = await insertSubmission('Unanchored IND', null);

    const rows = await listSubmissions(CTX, { programId: P_OPEN });

    const ids = rows.map((r) => Number(r.id));
    expect(ids).toContain(own);
    expect(ids).not.toContain(other);
    expect(ids).not.toContain(unanchored);
  });

  it('with no programId, every submission of the organization is listed, as the Submission Center reads it', async () => {
    const rows = await listSubmissions(CTX);
    const titles = rows.map((r) => r.title);
    expect(titles).toEqual(expect.arrayContaining(['Own IND', 'Other IND', 'Unanchored IND']));
  });
});
