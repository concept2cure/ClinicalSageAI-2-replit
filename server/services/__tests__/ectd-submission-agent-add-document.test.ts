/**
 * Adding a document to an eCTD submission must invalidate any prior validation:
 * the persisted ectd_submission_validations rows covered the OLD document set.
 * If a submission that was already 'validated' keeps that status and its stale
 * validation rows after a document is added, submitToGateway's gate reads "0
 * errors" and lets a never-validated document set through. addDocument must
 * regress the status out of 'validated' AND clear the validation rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      const s = sql.toUpperCase();
      // First SELECT is getSubmission — return an ALREADY-VALIDATED submission.
      if (s.startsWith('SELECT') || s.includes('FROM ECTD_SUBMISSIONS WHERE')) {
        return { rows: [{ id: 42, org_id: 7, status: 'validated' }] };
      }
      if (s.includes('INSERT INTO ECTD_SUBMISSION_DOCUMENTS')) {
        return { rows: [{ id: 1001 }] };
      }
      return { rows: [] };
    },
  }),
}));

import { EctdSubmissionAgent } from '../ectd-submission-agent';

const agent = new EctdSubmissionAgent();

beforeEach(() => {
  queries.length = 0;
});

describe('addDocument invalidates prior validation', () => {
  it('regresses status out of validated and deletes stale validation rows', async () => {
    await agent.addDocument(7, 42, {
      module: 'm1',
      sectionCode: 'm1.2',
      documentPath: 'm1-2/cover.pdf',
      fileName: 'cover.pdf',
      content: 'cover letter body',
    } as never);

    const statusUpdate = queries.find(
      (q) => /UPDATE\s+ectd_submissions/i.test(q.sql) && /status/i.test(q.sql),
    );
    expect(statusUpdate).toBeDefined();
    // The regress must cover 'validated', not only 'draft'.
    expect(statusUpdate!.sql).toMatch(/'validated'/);

    const deleteValidations = queries.find((q) =>
      /DELETE\s+FROM\s+ectd_submission_validations/i.test(q.sql),
    );
    expect(deleteValidations).toBeDefined();
    expect(deleteValidations!.params).toEqual([42, 7]);
  });
});
