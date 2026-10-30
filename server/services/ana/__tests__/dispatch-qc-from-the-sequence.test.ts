/**
 * AnA's dispatch QC reads its verdict from the stored sequence, never from
 * counts typed into the call (Rule 2; D5, 2026-10-30, the CSR path sweep).
 *
 * dispatch_qc_check "decides whether dispatch may proceed". It took the
 * validation-error and Shadow Review counts as arguments the model passed and
 * returned clearedToDispatch from them. The deterministic assessment it should
 * have used (assessSequenceDispatchReadiness, the gate freeze, dispatch and
 * transmit enforce) was consulted only by the route, when the route was given a
 * sequence. So AnA could tell a sponsor the LMN-201 amendment was cleared while
 * the platform's own gate held it. The tool now takes the sequence, and the
 * assessment is the verdict.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor';

const h = vi.hoisted(() => ({ assess: vi.fn() }));
vi.mock('../../ectd/assess-dispatch-readiness.js', () => ({ assessSequenceDispatchReadiness: h.assess }));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({ assessSequenceDispatchReadiness: h.assess }));

import { getToolHandler } from '../AnaToolExecutor';
import { DISPATCH_QC_CHECK } from '../submission-center-tool-defs';

const ctx = { organizationId: 7, userId: 41, humanConfirmed: true } as ToolContext;
/** The stored sequence: no Shadow Review has run and the release signature is missing. */
const held = {
  sequenceId: 12, region: 'fda', sequenceStatus: 'validated', validatedStage: null,
  validationErrors: 0, unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 0, shadowReviewMissing: true,
  shadowReviewWaiver: 'none',
  externalValidation: { configured: false, ran: false, cleared: false },
  releaseSignature: { cleared: false },
  readiness: { findings: [{ severity: 'warning', code: 'DOCUMENT_NOT_APPROVED', message: 'Leaf "CSR" is not yet approved.' }] },
  gate: { cleared: false, blockers: ['No completed Shadow Review has run for this sequence.', 'The release signature is missing.'] },
};
const call = async (input: Record<string, unknown>) => JSON.parse(await getToolHandler('dispatch_qc_check')!(input, ctx)) as Record<string, unknown>;

beforeEach(() => { h.assess.mockReset(); h.assess.mockResolvedValue(held); });

describe('dispatch_qc_check', () => {
  it('gives no verdict from typed counts: without a sequence it refuses', async () => {
    const out = await call({ region: 'fda', validation_errors: 0, unresolved_shadow_criticals: 0, leaves: [] });
    expect(out.clearedToDispatch).toBeUndefined();
    expect(out.error).toMatch(/sequence_id/);
    expect(h.assess).not.toHaveBeenCalled();
  });

  it('reads the stored sequence, and typed counts that say "clear" change nothing', async () => {
    const out = await call({ sequence_id: 12, region: 'fda', validation_errors: 0, unresolved_shadow_criticals: 0, leaves: [] });
    expect(h.assess).toHaveBeenCalledWith({ sequenceId: 12, organizationId: 7 });
    expect(out.clearedToDispatch).toBe(false);
    expect(out.verdictSource).toBe('assess-dispatch-readiness');
    expect(out.blockers).toEqual(held.gate.blockers);
  });

  it('asks for the sequence, not the counts, before AnA calls it', () => {
    const schema = DISPATCH_QC_CHECK.input_schema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(['sequence_id']);
    expect(Object.keys(schema.properties)).not.toEqual(expect.arrayContaining(['validation_errors']));
    expect(Object.keys(schema.properties)).not.toContain('unresolved_shadow_criticals');
  });
});
