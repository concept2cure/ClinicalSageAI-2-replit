import { describe, it, expect } from 'vitest';
import {
  batchRowFromApi,
  batchRowsFromApi,
  batchCreateBody,
  batchReleaseBody,
  batchDisposition,
  type BatchApiRow,
} from '../surfaces/cmcBatch';

describe('cmcBatch mapping', () => {
  it('maps a persisted batch row onto the display contract, carrying the db id', () => {
    const row: BatchApiRow = {
      id: 55,
      batch_number: 'BX204-DP-2407',
      product_name: 'Drug product',
      status: 'in-progress',
      yield_data: { percent: 94 },
      deviations: { open: 0 },
    };
    expect(batchRowFromApi(row)).toEqual({
      dbId: 55,
      id: 'BX204-DP-2407',
      stage: 'Drug product',
      yield: 94,
      dev: 0,
      st: 'pending',
    });
  });

  it('reads deviation count from an array and yield from a string leaf', () => {
    const row: BatchApiRow = {
      id: '9',
      batch_number: 'B-9',
      product_name: 'Drug substance',
      status: 'released',
      yield_data: '{"percent":"88.5"}',
      deviations: [{ ref: 'D1' }, { ref: 'D2' }],
    };
    const m = batchRowFromApi(row);
    expect(m.dbId).toBe(9);
    expect(m.yield).toBe(88.5);
    expect(m.dev).toBe(2);
    expect(m.st).toBe('released');
  });

  it('never yields NaN from malformed jsonb', () => {
    const row: BatchApiRow = { id: 1, batch_number: 'x', yield_data: 'not json', deviations: null };
    const m = batchRowFromApi(row);
    expect(m.yield).toBe(0);
    expect(m.dev).toBe(0);
  });

  it('batchDisposition normalizes persisted statuses', () => {
    expect(batchDisposition('released')).toBe('released');
    expect(batchDisposition('approved')).toBe('released');
    expect(batchDisposition('rejected')).toBe('rejected');
    expect(batchDisposition('conditional-release')).toBe('conditional');
    expect(batchDisposition('pending-review')).toBe('pending');
    expect(batchDisposition('in-progress')).toBe('pending');
    expect(batchDisposition(null)).toBe('pending');
  });

  it('round-trips create-form values → create body → persisted row → display row', () => {
    const pid = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
    const body = batchCreateBody({ id: 'B-100', stage: 'Drug substance', yield: '91', dev: '1' }, pid);
    expect(body).toMatchObject({
      projectId: pid,
      batchNumber: 'B-100',
      productName: 'Drug substance',
      status: 'in-progress',
      yieldData: { percent: 91 },
      deviations: { open: 1 },
    });
    const persisted: BatchApiRow = {
      id: 100,
      project_id: pid,
      batch_number: body.batchNumber,
      product_name: body.productName,
      status: body.status,
      yield_data: body.yieldData,
      deviations: body.deviations,
    };
    expect(batchRowFromApi(persisted)).toMatchObject({
      id: 'B-100',
      stage: 'Drug substance',
      yield: 91,
      dev: 1,
      st: 'pending',
    });
  });

  it('builds a governed release body with a defaulted decision and carried reauth', () => {
    const body = batchReleaseBody(
      { reason: 'Release per approved COA and disposition review.', password: 'pw', totp: '123456' },
      'J. Chen',
    );
    expect(body).toEqual({
      releaseTesting: {},
      releasedBy: 'J. Chen',
      decision: 'approved',
      reason: 'Release per approved COA and disposition review.',
      reauth: { password: 'pw', totp: '123456' },
    });
    expect(batchReleaseBody({ reason: 'x', decision: 'rejected' }, 'A').decision).toBe('rejected');
    expect(batchReleaseBody({ reason: 'x', decision: 'nonsense' }, 'A').decision).toBe('approved');
  });

  it('batchRowsFromApi tolerates a non-array payload', () => {
    expect(batchRowsFromApi(null)).toEqual([]);
    expect(batchRowsFromApi([{ id: 1, batch_number: 'x' }])).toHaveLength(1);
  });
});
