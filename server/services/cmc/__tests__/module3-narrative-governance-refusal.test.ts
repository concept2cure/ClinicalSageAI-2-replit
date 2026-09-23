/**
 * A governance refusal is not a gateway error.
 *
 * `ModelNotApprovedError` means the approved-models registry has no PQ-passed
 * model for high-risk regulatory drafting right now, and the gateway declined
 * to substitute one that is not approved — the control working exactly as
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` says it must. The builder recorded it as
 * `fallbackReason: 'gateway_error'`, the same value it uses for a residency
 * rejection, a missing key or every provider failing.
 *
 * Folded together, neither the author nor the audit reader could tell a
 * compliance control from a network blip, and the count the caller surfaces to
 * the UI said "AI refinement failed" for a platform that was working. Both are
 * reported now, separately, because they call for different answers: an
 * operational failure may clear on a retry; this one will not until an approved
 * model is configured.
 */
import { describe, expect, it, vi } from 'vitest';

const route = vi.fn();
vi.mock('../../ai-gateway/gateway.js', () => ({
  getGateway: () => ({ route: (...args: unknown[]) => route(...args) }),
}));

import { refineSectionWithAI } from '../module3-narrative-builder';

/** The gateway's refusal, matched by its stable code exactly as the code does. */
function modelNotApproved(): Error {
  const err = new Error(
    'MODEL_NOT_APPROVED_FOR_HIGH_RISK: document_drafting is high-risk regulatory work and no model ' +
      'approved for it is available.',
  );
  (err as unknown as { code: string }).code = 'MODEL_NOT_APPROVED_FOR_HIGH_RISK';
  return err;
}

/** A fresh input per call: the builder is given a section, not a shared object. */
const input = () =>
  ({
    organizationId: 7,
    projectId: 3,
    sectionKey: '3.2.S.2',
    deterministicNarrative: 'The drug substance is manufactured by a four-step synthetic route.',
    sourceObjects: [
      { id: 'src-1', type: 'drug_substance', organizationId: 7, projectId: 3, payload: { name: 'BX-701' } },
    ],
  }) as never;

describe('refineSectionWithAI — a refusal and a failure are different facts', () => {
  it('records a withheld unapproved model as model_not_approved, not gateway_error', async () => {
    route.mockImplementation(async () => { throw modelNotApproved(); });

    const out = await refineSectionWithAI(input());

    expect(out.fallback).toBe(true);
    expect(out.fallbackReason).toBe('model_not_approved');
  });

  it('still falls back to the deterministic narrative, unchanged', async () => {
    // The refusal must cost the AI polish and nothing else: the section the
    // engines composed is what gets filed, exactly as it was composed.
    route.mockImplementation(async () => { throw modelNotApproved(); });

    const out = await refineSectionWithAI(input());

    expect(out.refinedNarrative).toBe(
      'The drug substance is manufactured by a four-step synthetic route.',
    );
    expect(out.model).toBe('');
    expect(out.tokenCost).toBe(0);
  });

  it('keeps calling an operational failure gateway_error', async () => {
    // The distinction has to cut both ways, or it is just a rename.
    route.mockImplementation(async () => { throw new Error('upstream socket hang up'); });

    const out = await refineSectionWithAI(input());

    expect(out.fallback).toBe(true);
    expect(out.fallbackReason).toBe('gateway_error');
  });

  it('reads the code rather than the class, so a mocked gateway cannot break it', async () => {
    // gateway-error-map.ts records the same decision for the same reason: an
    // `instanceof` against a class a test mock omits throws, turning the
    // refusal this recognises into an unhandled error.
    const bare = { code: 'MODEL_NOT_APPROVED_FOR_HIGH_RISK', message: 'withheld' };
    route.mockImplementation(async () => { throw bare; });

    const out = await refineSectionWithAI(input());

    expect(out.fallbackReason).toBe('model_not_approved');
  });

  it('does not mistake a different gateway policy refusal for this one', async () => {
    const other = new Error('blocked');
    (other as unknown as { code: string }).code = 'MEDIA_NOT_CARRIED';
    route.mockImplementation(async () => { throw other; });

    const out = await refineSectionWithAI(input());

    expect(out.fallbackReason).toBe('gateway_error');
  });
});
