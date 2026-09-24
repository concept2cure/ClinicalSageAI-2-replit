/**
 * An export job's audit row is written only for a job this session updated
 * (ledger L203).
 *
 * updateExportJobStatus and completeExportJob updated the job by id, which
 * row security filters to the caller's tenant, and then inserted an audit row
 * for that id whether or not anything was updated. The audit log's foreign key
 * does not consult row security. So `POST /api/grdhe/exports/:jobId/cancel`,
 * and execute's failure path, filed audit entries against another tenant's
 * export job, and cancel then answered `success: true` with no job.
 *
 * The database is mocked at the one handle the service uses. The UPDATE's row
 * count stands in for what row security lets the session see.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({
  statements: [] as string[],
  /** Rows the UPDATE returns: none when the job is not the session's. */
  updated: [] as unknown[],
}));

vi.mock('../../../db', () => {
  const dialect = new PgDialect();
  return {
    db: {
      execute: vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
        const text = dialect.sqlToQuery(query).sql;
        state.statements.push(text);
        return { rows: /UPDATE regulatory_harmonization\.export_jobs/.test(text) ? state.updated : [] };
      }),
    },
  };
});

import { grdheService, ExportJobNotFoundError } from '../grdheService';

const JOB = '11111111-2222-4333-8444-555555555555';
const auditInserts = () =>
  state.statements.filter(s => /INSERT INTO regulatory_harmonization\.export_job_audit_log/.test(s));

beforeEach(() => {
  state.statements = [];
  state.updated = [];
});

describe('an export job audit row is written only for a job this session updated (L203)', () => {
  it('a status change to a job the session cannot see writes no audit row, and says not found', async () => {
    await expect(grdheService.updateExportJobStatus(JOB, 'cancelled', { errorMessage: 'x' })).rejects.toBeInstanceOf(
      ExportJobNotFoundError
    );
    expect(auditInserts(), "no audit row may be filed against a job the session did not update").toEqual([]);
  });

  it('completing a job the session cannot see writes no audit row, and says not found', async () => {
    await expect(
      grdheService.completeExportJob(JOB, '/exports/t/out.xml', '<xml/>')
    ).rejects.toBeInstanceOf(ExportJobNotFoundError);
    expect(auditInserts()).toEqual([]);
  });

  it("the session's own job still gets its status change and its audit row", async () => {
    state.updated = [{ id: JOB }];
    await grdheService.updateExportJobStatus(JOB, 'cancelled', { errorMessage: 'x' });
    expect(auditInserts()).toHaveLength(1);
  });

  it("the session's own job is still completed with its audit row", async () => {
    state.updated = [{ id: JOB }];
    await grdheService.completeExportJob(JOB, '/exports/t/out.xml', '<xml/>');
    expect(auditInserts()).toHaveLength(1);
  });
});
