/**
 * The GRDHE service refuses a write that names no actor (audit 2026-10-15,
 * finding 6; ledger L204).
 *
 * Every writer used to take its actor from getCurrentUserId(), which returned
 * process.env.CURRENT_USER_ID (set nowhere) or 'system'. So any caller of the
 * singleton could write regulated rows, and their audit rows, attributed to no
 * one. The route now passes the authenticated actor; this pins that the service
 * itself will not fall back to a placeholder when a caller passes none.
 *
 * The database is mocked at the one handle the service uses; the refusal must
 * come before any statement.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({ statements: [] as string[] }));

vi.mock('../../../db', () => {
  const dialect = new PgDialect();
  const execute = vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
    const text = dialect.sqlToQuery(query).sql;
    state.statements.push(text);
    if (/validate_data_region/.test(text)) return { rows: [{ is_valid: true }] };
    if (/FROM regulatory_harmonization\.mapping_rules/.test(text)) return { rows: [{ id: 'r', required_terminologies: [] }] };
    if (/create_export_job/.test(text)) return { rows: [{ job_id: 'j' }] };
    return { rows: [{ id: 'row-1' }] };
  });
  return { db: { execute, transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute })) } };
});

import { grdheService } from '../grdheService';
import type { CreateAdverseEventRequest, TerminologyMapping } from '../types';

const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const JOB = '11111111-2222-4333-8444-555555555555';

const WRITERS: Array<[string, (actor: string) => Promise<unknown>]> = [
  ['setDataResidencyConfig', actor => grdheService.setDataResidencyConfig({ tenantId: TENANT }, actor)],
  ['addTerminologyMapping', actor =>
    grdheService.addTerminologyMapping({ sourceSystem: 'MEDDRA', targetSystem: 'MEDDRA' } as Omit<TerminologyMapping, 'id' | 'createdAt'>, actor)],
  ['createExportJob', actor =>
    grdheService.createExportJob(
      { tenantId: TENANT, sourceEntityType: 'adverse_event', sourceEntityIds: [JOB], targetFormat: 'FDA_3500A', targetJurisdiction: 'FDA' },
      actor
    )],
  ['updateExportJobStatus', actor => grdheService.updateExportJobStatus(TENANT, JOB, 'cancelled', {}, actor)],
  ['completeExportJob', actor => grdheService.completeExportJob(TENANT, JOB, { fileName: 'out.xml', content: '<x/>' }, actor)],
  ['createCanonicalAdverseEvent', actor =>
    grdheService.createCanonicalAdverseEvent({ tenantId: TENANT, caseNumber: 'C-1', isSerious: false } as CreateAdverseEventRequest, actor)],
  ['logAudit', actor =>
    grdheService.logAudit({ tableName: 'export_jobs', recordId: JOB, action: 'UPDATE', oldData: null, newData: null, reason: 'x' }, actor)],
];

beforeEach(() => {
  state.statements = [];
});

describe('a GRDHE service write names its actor or is refused before any statement', () => {
  it.each(WRITERS)('%s refuses an empty actor', async (_name, write) => {
    await expect(write('')).rejects.toMatchObject({ name: 'GrdheActorRequiredError', status: 401 });
    expect(state.statements, 'nothing may be written for no one').toEqual([]);
  });
});
