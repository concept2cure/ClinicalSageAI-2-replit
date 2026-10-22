/**
 * The eCTD compile route answers a busy converter 503 with Retry-After, and
 * records no compilation (MR-03 Stage 2 step 5).
 *
 * POST /api/ectd-compile/:projectIdent/compile assembles the sequence through
 * the canonical assembler, which converts every PDF leaf to PDF/A through
 * Ghostscript inside a conversion slot. The route turns an assembly error into
 * a recorded `failed` compilation ("eCTD assembly refused: …"), which is right
 * for a refusal and wrong for a queue: a busy converter refused nothing, and
 * the next attempt may well succeed. That one error now passes to the route's
 * `serverError`, which answers 503 with Retry-After; no compilation row is
 * written. Any other assembly error is still a recorded `failed` compilation
 * (tests/routes/ectd-compile-spine.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse } from '../../../tests/setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../routes/ectd-compile';
import { ConversionCapacityError } from '../conversion-slots';
import { handlerOf, makeReq, mockSpineOn } from '../../../tests/routes/ectd-compile-spine.harness';

const mockSpine = mockSpineOn(poolQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /:projectIdent/compile with every conversion slot busy', () => {
  it('answers 503 with Retry-After and writes no compilation row', async () => {
    mockSpine();
    assembleSequenceMock.mockRejectedValue(new ConversionCapacityError('ghostscript', 120_000, 2));

    const res = createMockResponse() as any;
    await handlerOf(ectdCompileRoutes, '/:projectIdent/compile', 'post')(makeReq({ submissionType: 'initial' }), res);

    expect(assembleSequenceMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('CONVERTER_BUSY');
    expect(body.message).toMatch(/converter is busy/i);
    // Not a "failed" compilation: nothing was refused, and nothing is recorded.
    expect(body).not.toHaveProperty('status');
    const insert = poolQuery.mock.calls.find((c) => /INSERT INTO ectd_compilations/i.test(String(c[0])));
    expect(insert).toBeUndefined();
  });
});
