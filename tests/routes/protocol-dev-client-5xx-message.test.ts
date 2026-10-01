// @vitest-environment jsdom
/**
 * The protocol register and protocol-development write helpers never show the
 * INTERNAL_ERROR token as the reason a write failed (security audit 2026-09-24,
 * IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The routes these helpers call (/api/protocol-risks, -milestones,
 * -amendments, /api/protocol-development) used to answer an uncoded failure
 * with `{ error: { code: 'INTERNAL', message: err.message } }`. They now answer
 * through serverError(): `{ error: 'INTERNAL_ERROR', message: <a sentence>,
 * correlationId }`. Both helpers read `error` before `message` on a refusal
 * (`error?.message ?? error?.code ?? error`, and a `detailOf()` that returned a
 * string `error` as-is), so a 500 that reached them would have been rendered as
 * "Couldn't record the risk — INTERNAL_ERROR." In a browser `apiRequest`
 * throws for a 5xx before these branches run; a resolving double (and any
 * future change to that contract) reaches them, which is what this pins. They
 * now go through serverMessage() first, the repo's one reader of server copy.
 *
 * The envelope is produced by the real serverError(), not written by hand, so
 * this test moves with the server's shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serverError } from '../../server/lib/api-response';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/src/lib/queryClient')>()),
  apiRequest,
}));

import { submitProtocolRegister } from '../../client/src/concept2cure/v2/surfaces/ProtocolRegisterForms';
import { addScheduleVisit } from '../../client/src/concept2cure/v2/surfaces/ProtocolDevWrites';

/** The body the route now sends for an uncoded failure, from the real helper. */
function serverErrorBody(where: string): unknown {
  let body: unknown;
  const res = {
    getHeader: (name: string) => (name === 'X-Request-Id' ? 'req-p117-set-b' : undefined),
    status() {
      return res;
    },
    json(b: unknown) {
      body = b;
      return res;
    },
  };
  serverError(res as never, { error: () => undefined }, where, new Error('SENTINEL-DB-DETAIL'));
  return body;
}

function failed(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as Response;
}

beforeEach(() => apiRequest.mockReset());

describe('a 500 from the protocol routes is shown as a failure in a sentence, never the code', () => {
  it('submitProtocolRegister (POST /api/protocol-risks/…) says the server sentence and that nothing was persisted', async () => {
    apiRequest.mockResolvedValue(failed(500, serverErrorBody('handling the protocol risk request')));
    const err = await submitProtocolRegister('risk', 7, {
      description: 'Site turnover', likelihood: 'likely', impact: 'major', reason: 'Recording per risk review',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message, 'the INTERNAL_ERROR code was shown as prose').not.toContain('INTERNAL_ERROR');
    expect(message).toContain('Something went wrong while handling the protocol risk request');
    expect(message).toMatch(/Nothing was persisted/);
    expect(message).not.toContain('SENTINEL-DB-DETAIL');
  });

  it('addScheduleVisit (POST /api/protocol-development/…) says the server sentence and that nothing was written', async () => {
    apiRequest.mockResolvedValue(failed(500, serverErrorBody('handling the protocol development request')));
    const err = await addScheduleVisit(7, { visitName: 'Screening', reason: 'Baseline visit added' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message, 'the INTERNAL_ERROR code was shown as prose').not.toContain('INTERNAL_ERROR');
    expect(message).toContain('Something went wrong while handling the protocol development request');
    expect(message).toMatch(/Nothing was written/);
  });

  it('a coded 4xx refusal still reads as it did (code-only body shows the code; a sentence shows the sentence)', async () => {
    apiRequest.mockResolvedValue(failed(400, { error: { code: 'VALIDATION' } }));
    await expect(
      submitProtocolRegister('risk', 7, { description: 'd', reason: 'long enough reason' }),
    ).rejects.toThrow(/Couldn.t record the risk — VALIDATION\. Nothing was persisted\./);

    apiRequest.mockResolvedValue(
      failed(409, { error: { code: 'INVALID_STATE', message: 'This protocol is finalized and cannot be edited.' } }),
    );
    await expect(addScheduleVisit(7, { visitName: 'Screening', reason: 'Baseline visit added' })).rejects.toThrow(
      /Couldn.t add the visit — This protocol is finalized and cannot be edited\. Nothing was written\./,
    );
  });
});
