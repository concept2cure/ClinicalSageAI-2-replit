/**
 * P-57: the deviation record, against PostgreSQL in process with the set's own
 * migration (20261029g_qc_deviations.sql). A deviation is recorded open, moves
 * only along DEVIATION_TRANSITIONS, goes for approval only with its root cause
 * and resolution, and closes only from pending approval. The signing ceremony
 * around the close is the route test's (qms-signed-decisions.test.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../audit/audit-write-outcome', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { DeviationRefused, cancelDeviation, closeDeviation, recordNewDeviation, updateDeviation } from '../deviations';

let jdb: JourneyDb;
const client = () => ({ query: (sql: string, params?: unknown[]) => jdb.pglite.query<Record<string, any>>(sql, params) });
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof DeviationRefused ? e.code : String(e)));

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations']),
    migrations: ['migrations/20261029g_qc_deviations.sql'],
  });
  await jdb.pglite.exec(`INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');`);
}, 60_000);
beforeEach(async () => { await jdb.pglite.exec('TRUNCATE qc_deviations RESTART IDENTITY'); });
afterAll(async () => { await jdb?.close(); });

const EM = {
  deviationNumber: 'DEV-2026-001', title: 'EM excursion, Grade B room 2', classification: 'major', deviationType: 'unplanned',
  description: 'Viable air count above the action limit during filling.', detectedDate: '2026-10-20', category: 'environmental',
};

describe('the deviation record', () => {
  it('is recorded open, once per number in an organization', async () => {
    const { row } = await recordNewDeviation(client(), 1, 7, EM);
    expect(row).toMatchObject({ deviation_number: 'DEV-2026-001', status: 'open', classification: 'major', detected_by: '7' });
    expect(await refusal(recordNewDeviation(client(), 1, 7, EM))).toBe('DEVIATION_NUMBER_TAKEN');
    expect((await recordNewDeviation(client(), 2, 8, EM)).row.organization_id).toBe(2);
  });

  it('moves only along its lifecycle, and goes for approval only with root cause and resolution', async () => {
    const { row } = await recordNewDeviation(client(), 1, 7, EM);
    expect(await refusal(updateDeviation(client(), 1, row.id, { status: 'pending_approval' }, 7))).toBe('DEVIATION_MOVE_REFUSED');
    expect(await refusal(updateDeviation(client(), 1, row.id, { status: 'closed' }, 7))).toBe('DEVIATION_MOVE_REFUSED');
    expect(await updateDeviation(client(), 1, row.id, { status: 'under_investigation', immediateActions: 'Filling stopped; line cleaned.' }, 7))
      .toMatchObject({ status: 'under_investigation', investigation_status: 'in_progress' });
    expect(await refusal(updateDeviation(client(), 1, row.id, { status: 'pending_approval', rootCause: 'HEPA seal gap.' }, 7))).toBe('DEVIATION_MOVE_REFUSED');
    expect(await updateDeviation(client(), 1, row.id, {
      status: 'pending_approval', rootCause: 'HEPA seal gap.', resolutionDescription: 'Seal replaced; room requalified.',
    }, 7)).toMatchObject({ status: 'pending_approval', root_cause_identified: true, investigation_status: 'completed' });
    expect(await refusal(updateDeviation(client(), 2, row.id, { status: 'under_investigation' }, 7))).toBe('DEVIATION_NOT_FOUND');
  });

  it('closes only from pending approval, dated and named, and never twice', async () => {
    const { row } = await recordNewDeviation(client(), 1, 7, EM);
    expect(await refusal(closeDeviation(client(), 1, row.id, 9))).toBe('DEVIATION_NOT_READY');
    await updateDeviation(client(), 1, row.id, { status: 'under_investigation' }, 7);
    await updateDeviation(client(), 1, row.id, { status: 'pending_approval', rootCause: 'HEPA seal gap.', resolutionDescription: 'Seal replaced.' }, 7);
    const closed = await closeDeviation(client(), 1, row.id, 9);
    expect(closed).toMatchObject({ status: 'closed', qa_approved_by: '9' });
    expect(closed.actual_closure_date).toBeTruthy();
    expect(await refusal(closeDeviation(client(), 1, row.id, 9))).toBe('DEVIATION_NOT_READY');
    expect(await refusal(updateDeviation(client(), 1, row.id, { rootCause: 'Edited after close.' }, 7))).toBe('DEVIATION_MOVE_REFUSED');
  });

  it('is not closed by the person who sent it for approval (21 CFR 211.192)', async () => {
    const { row } = await recordNewDeviation(client(), 1, 7, EM);
    await updateDeviation(client(), 1, row.id, { status: 'under_investigation' }, 7);
    expect(await updateDeviation(client(), 1, row.id,
      { status: 'pending_approval', rootCause: 'HEPA seal gap.', resolutionDescription: 'Seal replaced.' }, 9))
      .toMatchObject({ investigation_details: { completedBy: '9' } });
    expect(await refusal(closeDeviation(client(), 1, row.id, 9))).toBe('DEVIATION_SELF_CLOSE');
    expect(await closeDeviation(client(), 1, row.id, 8)).toMatchObject({ status: 'closed', qa_approved_by: '8' });
  });

  it('is cancelled with its reason by someone other than its recorder, stays listed, and is not changed again', async () => {
    const { row } = await recordNewDeviation(client(), 1, 7, EM);
    expect(await refusal(cancelDeviation(client(), 1, row.id, 7, 'Duplicate of DEV-2026-000.'))).toBe('DEVIATION_SELF_CANCEL');
    expect(await refusal(cancelDeviation(client(), 2, row.id, 8, 'Duplicate of DEV-2026-000.'))).toBe('DEVIATION_NOT_FOUND');
    const cancelled = await cancelDeviation(client(), 1, row.id, 8, 'Duplicate of DEV-2026-000.');
    expect(cancelled).toMatchObject({ status: 'cancelled', metadata: { cancelled: { reason: 'Duplicate of DEV-2026-000.', by: '8' } } });
    expect(await refusal(cancelDeviation(client(), 1, row.id, 8, 'Again.'))).toBe('DEVIATION_NOT_READY');
    expect(await refusal(closeDeviation(client(), 1, row.id, 8))).toBe('DEVIATION_NOT_READY');
    expect(await refusal(updateDeviation(client(), 1, row.id, { rootCause: 'After cancel.' }, 8))).toBe('DEVIATION_MOVE_REFUSED');
    expect(await refusal(updateDeviation(client(), 1, (await recordNewDeviation(client(), 1, 7, { ...EM, deviationNumber: 'DEV-2026-002' })).row.id,
      { status: 'cancelled' }, 7))).toBe('DEVIATION_MOVE_REFUSED');
  });
});
