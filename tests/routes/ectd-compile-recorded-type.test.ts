/**
 * A sequence's compile is recorded as the type recorded on the sequence.
 *
 * WO-9 §20 (W5/D7) recorded, and left unchanged: the compile surface's
 * "Submission" selector read "initial" on amendment 0001. Re-walked on
 * 2026-10-22 it still did, and the route wrote the selector's word into
 * ectd_compilations.compilation_type, so the compilation history called the
 * amendment an initial compile while the package's us-regional.xml declared
 * the amendment. The region selector was retired for the same reason (a
 * sequence's recorded region decides; a contradicting one is 409); the type now
 * follows it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { handlerOf, makeBundleZip, assembledResult, makeReq, mockSpineOn, REAL_BACKBONE } from './ectd-compile-spine.harness';

const compile = handlerOf(ectdCompileRoutes, '/:projectIdent/compile', 'post');
const status = handlerOf(ectdCompileRoutes, '/:projectIdent/status', 'get');
const mockSpine = mockSpineOn(poolQuery);

/** The program's spine at sequence 0001, recorded on ectd_sequences as `type`. */
async function sequenceRecordedAs(type: string | null) {
  mockSpine({ sequenceNumber: '0001' });
  const spine = poolQuery.getMockImplementation()!;
  poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/SELECT type FROM ectd_sequences/i.test(sql)) return { rows: type === null ? [] : [{ type }] };
    return spine(sql, params);
  });
  const { zipPath } = await makeBundleZip(REAL_BACKBONE);
  assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
}

const recordedCompilationType = () => {
  const insert = poolQuery.mock.calls.find(([sql]) => /INSERT INTO ectd_compilations/i.test(String(sql)));
  return insert ? (insert[1] as unknown[])[2] : undefined;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a compile is recorded as its sequence’s recorded type', () => {
  it('an amendment compiled with no type stated is recorded as an amendment', async () => {
    await sequenceRecordedAs('amendment');
    const res = createMockResponse() as any;
    await compile(makeReq({}), res);
    expect(assembleSequenceMock).toHaveBeenCalled();
    expect(recordedCompilationType()).toBe('amendment');
  });

  it('an original is recorded in the history’s word for it, initial', async () => {
    await sequenceRecordedAs('original');
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial' }), res);
    expect(recordedCompilationType()).toBe('initial');
  });

  it('a stated type that contradicts the recorded one is refused, and nothing is assembled', async () => {
    await sequenceRecordedAs('amendment');
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'initial' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('SUBMISSION_TYPE_MISMATCH');
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('a sequence that records no type keeps the stated one', async () => {
    await sequenceRecordedAs(null);
    const res = createMockResponse() as any;
    await compile(makeReq({ submissionType: 'amendment' }), res);
    expect(recordedCompilationType()).toBe('amendment');
  });

  it('the status read names the type the compile will be recorded as', async () => {
    await sequenceRecordedAs('amendment');
    const res = createMockResponse() as any;
    await status(makeReq(), res);
    expect(res.json.mock.calls[0][0].sequence).toMatchObject({ sequenceNumber: '0001', type: 'amendment' });
  });
});
