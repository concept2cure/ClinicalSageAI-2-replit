import { describe, it, expect } from 'vitest';
import {
  batchRowFromApi,
  batchRowsFromApi,
  batchCreateBody,
  batchReleaseBody,
  batchDisposition,
  batchFromReleaseAnswer,
  dispositionWord,
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
    /* The id AS GIVEN, so '9' stays '9' (2026-11-09). This asserted `9`, which
       encoded the `Number()` coercion that made every uuid id NaN and broke the
       Release button (`cmcBatchRowIdentity.test.ts`). For what dbId is for — a
       URL segment and a React key — '9' and 9 address and distinguish the same
       row, and nothing does arithmetic on it. */
    expect(m.dbId).toBe('9');
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

/* 2026-11-12 (CMC walked in the running app): a batch rejected under signature kept reading "Pending" with a
   live "Release". The register writes the decision to `release_status`; a rejection leaves `status` as it was
   (in-progress), and the row was read from `status` alone. The signed answer also arrives as `data.batchRecord`,
   not `data`, so the row adopted nothing and showed "undefined". */
describe('the signed disposition', () => {
  const row = { id: 'b-1', batch_number: 'B3-0042', product_name: 'Drug substance', yield_data: { percent: 61 }, deviations: { open: 1 } };

  it.each([
    ['rejected', 'in-progress', 'rejected'],
    ['released', 'completed', 'released'],
    ['conditional', 'in-progress', 'conditional'],
    ['pending', 'in-progress', 'pending'],
    [null, 'in-progress', 'pending'],
    [undefined, 'released', 'released'],
  ])('release_status %s over status %s reads %s', (releaseStatus, status, shown) => {
    expect(batchRowFromApi({ ...row, status, release_status: releaseStatus }).st).toBe(shown);
  });

  it('the release answer is read where the route puts it, and not at all when it carries no batch', () => {
    const signed = { ...row, status: 'in-progress', release_status: 'rejected' };
    expect(batchFromReleaseAnswer({ success: true, data: { batchRecord: signed, releaseStatus: 'rejected' } })).toMatchObject({ id: 'B3-0042', st: 'rejected' });
    expect(batchFromReleaseAnswer({ success: true, data: signed })).toMatchObject({ id: 'B3-0042', st: 'rejected' });
    expect(batchFromReleaseAnswer({ success: true, data: { releaseStatus: 'rejected' } })).toBeNull();
    expect(batchFromReleaseAnswer(null)).toBeNull();
  });

  it('says the decision in the words a person signed', () => {
    expect(dispositionWord('released')).toBe('released');
    expect(dispositionWord('conditional')).toBe('released conditionally');
    expect(dispositionWord('rejected')).toBe('rejected');
  });
});
