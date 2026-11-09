/**
 * P-99 C1 (F1): a compile of a sequence already sent is not recorded as what it sent.
 *
 * The founder's P-99 (2026-11-03): "Nothing restores a sequence silently." A
 * sequence sent before the platform kept what each send carried reads its
 * filed record from its compiles, or has none ('none'), and the next
 * sequence's lifecycle read refuses until it is put back on record. A compile
 * made AFTER the send was recorded like any other, so the fold read it as
 * what was sent ('compiles'), slice 1's refusal lifted, and nobody said so.
 * That is the silent restore P-99 forbids
 * (docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md §1.6).
 *
 * Now the compile route refuses a non-rehearsal compile of a sequence whose
 * dispatch status is filed ('sent', 'acknowledged': filed-dispatch.ts) or in
 * flight ('transmitting'), before anything is assembled or recorded. A
 * pending or rejected sequence, and a rehearsal, compile as before.
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
import { REAL_BACKBONE, handlerOf, mockSpineOn, makeBundleZip, assembledResult, makeReq } from './ectd-compile-spine.harness';

const compile = handlerOf(ectdCompileRoutes, '/:projectIdent/compile', 'post');
const mockSpine = mockSpineOn(poolQuery);

const ON_FILE = (n: string) =>
  `Sequence ${n} is on file at the agency, so a compile of it now is not recorded: it would not be what it sent. ` +
  'Its sent package is on Gateway transmittals when the platform kept it. Start the next sequence to compile again.';
const IN_FLIGHT = (n: string) =>
  `A send of sequence ${n} is unresolved, so a compile of it now is not recorded. Nothing was assembled.`;

const compilationInserts = () => poolQuery.mock.calls.filter((c) => /INSERT INTO ectd_compilations/i.test(String(c[0])));

beforeEach(async () => {
  vi.clearAllMocks();
  const { zipPath } = await makeBundleZip(REAL_BACKBONE);
  assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
});

async function run(body: Record<string, unknown>) {
  const res = createMockResponse() as any;
  await compile(makeReq(body), res);
  return res;
}

describe('P-99 C1: a sequence on file is not compiled and recorded again', () => {
  for (const status of ['sent', 'acknowledged'] as const) {
    it(`refuses a compile of the program's latest sequence when it is ${status}, and records nothing`, async () => {
      mockSpine({ dispatchStatus: status });
      const res = await run({ submissionType: 'initial' });
      expect(compilationInserts()).toHaveLength(0);
      expect(assembleSequenceMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0]).toEqual({ error: { code: 'ECTD_SEQUENCE_ON_FILE', message: ON_FILE('0000') } });
    });
  }

  it('refuses a compile of a named sequence that is sent, the same way', async () => {
    mockSpine({ dispatchStatus: 'sent', sequenceNumber: '0001' });
    const res = await run({ sequenceId: 9 });
    expect(compilationInserts()).toHaveLength(0);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toEqual({ error: { code: 'ECTD_SEQUENCE_ON_FILE', message: ON_FILE('0001') } });
  });

  it('refuses a compile while a send of the sequence is unresolved (transmitting)', async () => {
    mockSpine({ dispatchStatus: 'transmitting' });
    const res = await run({});
    expect(compilationInserts()).toHaveLength(0);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toEqual({ error: { code: 'ECTD_SEQUENCE_ON_FILE', message: IN_FLIGHT('0000') } });
  });
});

describe('P-99 C1: what is not on file compiles as before', () => {
  for (const status of [null, 'pending', 'rejected'] as const) {
    it(`compiles and records a sequence whose dispatch status is ${status ?? 'not recorded'}`, async () => {
      mockSpine({ dispatchStatus: status });
      const res = await run({ submissionType: 'initial' });
      expect(assembleSequenceMock).toHaveBeenCalledTimes(1);
      expect(compilationInserts()).toHaveLength(1);
      expect(res.json.mock.calls[0][0].status).toBe('completed');
    });
  }

  it('a rehearsal of a sent sequence is not refused as on file: it is recorded as a rehearsal, never as what was sent', async () => {
    mockSpine({ dispatchStatus: 'sent', sequenceNumber: '0001' });
    const res = await run({ rehearsal: true });
    const body = res.json.mock.calls[0]?.[0];
    expect(body?.error?.code).not.toBe('ECTD_SEQUENCE_ON_FILE');
    expect(assembleSequenceMock).toHaveBeenCalledTimes(1);
  });
});
