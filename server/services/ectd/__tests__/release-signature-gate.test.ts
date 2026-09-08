/**
 * Release-signature dispatch gate (21 CFR Part 11 §11.70).
 *
 * The gate exists to STOP things, so the tests that carry weight are the ones
 * asserting it blocks. Two rules under test:
 *
 *   1. When required, only 'signed' clears — unsigned/awaiting/revoked/
 *      undetermined all block. Unsigned is not signature-clean, it is unsigned.
 *   2. 'invalid' blocks UNCONDITIONALLY, including when not required. A
 *      signature that does not match its package is tamper evidence, and
 *      "this type didn't need one anyway" does not excuse it.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateReleaseSignatureGate,
  mergeDispatchGates,
  evaluateDispatchGate,
  type ReleaseSignatureVerdict,
} from '../dispatch-gate';
import {
  isReleaseSignatureRequired,
  transmitSignatureRequiredTypes,
} from '../release-signature-status';
import { composeDispatchGates, composeDispatchGatesForStep } from '../assess-dispatch-readiness';

const BLOCKING_WHEN_REQUIRED: ReleaseSignatureVerdict[] = [
  'unsigned',
  'awaiting',
  'revoked',
  'undetermined',
];

describe('evaluateReleaseSignatureGate — rule 1: when required, only signed clears', () => {
  it('clears a verified signature', () => {
    const gate = evaluateReleaseSignatureGate({ required: true, verdict: 'signed' });
    expect(gate.cleared).toBe(true);
    expect(gate.blockers).toHaveLength(0);
  });

  it.each(BLOCKING_WHEN_REQUIRED)('blocks on %s', verdict => {
    const gate = evaluateReleaseSignatureGate({ required: true, verdict });
    expect(gate.cleared).toBe(false);
    expect(gate.blockers).toHaveLength(1);
  });

  it('does not let an undetermined lookup read as an absent requirement', () => {
    const gate = evaluateReleaseSignatureGate({
      required: true,
      verdict: 'undetermined',
      detail: 'the orchestrator run lookup failed',
    });
    expect(gate.cleared).toBe(false);
    expect(gate.blockers[0]).toContain('could not be determined');
    expect(gate.blockers[0]).toContain('not an absent requirement');
  });

  it('distinguishes unsigned from undetermined in its message', () => {
    const unsigned = evaluateReleaseSignatureGate({ required: true, verdict: 'unsigned' });
    const undetermined = evaluateReleaseSignatureGate({ required: true, verdict: 'undetermined' });
    expect(unsigned.blockers[0]).not.toEqual(undetermined.blockers[0]);
  });

  it('surfaces resolver detail in the blocker message', () => {
    const gate = evaluateReleaseSignatureGate({
      required: true,
      verdict: 'revoked',
      detail: 'superseded by signature 91',
    });
    expect(gate.blockers[0]).toContain('superseded by signature 91');
  });
});

describe('evaluateReleaseSignatureGate — rule 2: invalid blocks unconditionally', () => {
  it('blocks a tampered signature even when a signature is NOT required', () => {
    const gate = evaluateReleaseSignatureGate({
      required: false,
      verdict: 'invalid',
      detail: 'digest drift',
    });
    expect(gate.cleared).toBe(false);
    expect(gate.blockers[0]).toContain('does not verify');
    expect(gate.blockers[0]).toContain('whether or not this submission type requires one');
  });

  it('blocks a tampered signature when a signature IS required', () => {
    const gate = evaluateReleaseSignatureGate({ required: true, verdict: 'invalid' });
    expect(gate.cleared).toBe(false);
  });
});

describe('evaluateReleaseSignatureGate — not-required path', () => {
  it.each(BLOCKING_WHEN_REQUIRED)('clears %s when no signature is required', verdict => {
    const gate = evaluateReleaseSignatureGate({ required: false, verdict });
    expect(gate.cleared).toBe(true);
  });
});

describe('release-signature gate composes with the existing dispatch gates', () => {
  it('blocks the merged verdict even when every other gate is clean', () => {
    const structural = evaluateDispatchGate({
      validationErrors: 0,
      unacknowledgedShadowCriticals: 0,
    });
    expect(structural.cleared).toBe(true);

    const merged = mergeDispatchGates(
      structural,
      evaluateReleaseSignatureGate({ required: true, verdict: 'unsigned' }),
    );
    expect(merged.cleared).toBe(false);
    expect(merged.blockers).toHaveLength(1);
  });

  it('preserves blocker order across composed gates', () => {
    const merged = mergeDispatchGates(
      evaluateDispatchGate({ validationErrors: 2, unacknowledgedShadowCriticals: 0 }),
      evaluateReleaseSignatureGate({ required: true, verdict: 'unsigned' }),
    );
    expect(merged.blockers).toHaveLength(2);
    expect(merged.blockers[0]).toContain('validation finding');
    expect(merged.blockers[1]).toContain('release');
  });
});

describe('composeDispatchGates — the release-signature gate is actually in the composition', () => {
  const CLEAR = { cleared: true, blockers: [] };

  it('blocks when ONLY the release-signature gate blocks', () => {
    // This is the test that detects an unwired gate. Every other gate is
    // clean; if the composition dropped the release-signature gate the merged
    // verdict would come back cleared and a never-signed sequence would
    // transmit to the agency.
    const merged = composeDispatchGates({
      structural: CLEAR,
      external: CLEAR,
      shadowPresence: CLEAR,
      releaseSignature: evaluateReleaseSignatureGate({ required: true, verdict: 'unsigned' }),
    });
    expect(merged.cleared).toBe(false);
    expect(merged.blockers.some(b => b.includes('release'))).toBe(true);
  });

  it('blocks on a tampered signature even when nothing else objects', () => {
    const merged = composeDispatchGates({
      structural: CLEAR,
      external: CLEAR,
      shadowPresence: CLEAR,
      releaseSignature: evaluateReleaseSignatureGate({ required: false, verdict: 'invalid' }),
    });
    expect(merged.cleared).toBe(false);
  });

  it('clears only when every gate clears', () => {
    const merged = composeDispatchGates({
      structural: CLEAR,
      external: CLEAR,
      shadowPresence: CLEAR,
      releaseSignature: evaluateReleaseSignatureGate({ required: true, verdict: 'signed' }),
    });
    expect(merged.cleared).toBe(true);
    expect(merged.blockers).toHaveLength(0);
  });

  it('unions blockers from every contributing gate', () => {
    const merged = composeDispatchGates({
      structural: evaluateDispatchGate({ validationErrors: 1, unacknowledgedShadowCriticals: 1 }),
      external: { cleared: false, blockers: ['external validation did not run'] },
      shadowPresence: { cleared: false, blockers: ['no completed Shadow Review'] },
      releaseSignature: evaluateReleaseSignatureGate({ required: true, verdict: 'unsigned' }),
    });
    expect(merged.cleared).toBe(false);
    // 2 structural + 1 external + 1 shadow + 1 signature
    expect(merged.blockers).toHaveLength(5);
  });
});

/* ── Which gates govern which governed step ─────────────────────────────────
   `transitionSequenceGoverned` applies the composed gate to BOTH governed
   transitions. Composing the release-signature gate into it therefore made a
   TRANSMIT control block the FREEZE — and a release signature comes from a
   package orchestrator run, so freezing any IND/NDA/BLA/MAA sequence required
   signing a release first. That inverts the order the product works in, for a
   control whose own module calls itself "the transmit-time re-check" and "the
   provable pre-transmit rule".

   Freeze is not transmit and nothing leaves the building at freeze; it carries
   its own Part 11 signature already (transitionSequenceGoverned Gate 1: bound
   to this sequence, this step, this actor, this leaf manifest). So the
   release-signature gate governs `dispatch` only. Every OTHER gate governs
   both — which is what these tests pin, so a gate added later cannot be
   dropped from the freeze verdict by omission. */
describe('composeDispatchGatesForStep — the release-signature gate is a transmit control', () => {
  const CLEAR = { cleared: true, blockers: [] };
  const parts = (releaseSignature: { required: boolean; verdict: ReleaseSignatureVerdict }, over = {}) => ({
    structural: CLEAR, external: CLEAR, shadowPresence: CLEAR, releaseSignature, ...over,
  });

  it('does not block a FREEZE for a missing release signature', () => {
    const merged = composeDispatchGatesForStep(parts({ required: true, verdict: 'unsigned' }), 'freeze');
    expect(merged.cleared).toBe(true);
    expect(merged.blockers).toHaveLength(0);
  });

  it('still blocks a DISPATCH for the same missing signature', () => {
    const merged = composeDispatchGatesForStep(parts({ required: true, verdict: 'unsigned' }), 'dispatch');
    expect(merged.cleared).toBe(false);
    expect(merged.blockers.some(b => b.includes('release'))).toBe(true);
  });

  it('an undetermined lookup does not block a freeze either — it is the transmit re-check that needs certainty', () => {
    expect(composeDispatchGatesForStep(parts({ required: true, verdict: 'undetermined' }), 'freeze').cleared).toBe(true);
    expect(composeDispatchGatesForStep(parts({ required: true, verdict: 'undetermined' }), 'dispatch').cleared).toBe(false);
  });

  it('a TAMPERED signature blocks both steps — integrity is not a transmit-only concern', () => {
    for (const step of ['freeze', 'dispatch'] as const) {
      // Requiredness governs whether a signature must be PRESENT, never whether
      // a broken one may be ignored (dispatch-gate rule 2). Scoping the
      // requirement to dispatch must not weaken that.
      const merged = composeDispatchGatesForStep(parts({ required: false, verdict: 'invalid' }), step);
      expect(merged.cleared, step).toBe(false);
      expect(merged.blockers.join(' '), step).toMatch(/does not verify/);
    }
  });

  it.each(['structural', 'external', 'shadowPresence'] as const)(
    'the %s gate governs a freeze exactly as it governs a dispatch',
    key => {
      const blocking = { cleared: false, blockers: [`${key} objected`] };
      for (const step of ['freeze', 'dispatch'] as const) {
        const merged = composeDispatchGatesForStep(
          parts({ required: true, verdict: 'signed' }, { [key]: blocking }),
          step,
        );
        expect(merged.cleared, step).toBe(false);
        expect(merged.blockers, step).toContain(`${key} objected`);
      }
    },
  );

  it('the dispatch composition is exactly what composeDispatchGates already produced', () => {
    const structural = evaluateDispatchGate({ validationErrors: 1, unacknowledgedShadowCriticals: 1 });
    const external = { cleared: false, blockers: ['external validation did not run'] };
    const shadowPresence = { cleared: false, blockers: ['no completed Shadow Review'] };
    const signature = { required: true, verdict: 'unsigned' as ReleaseSignatureVerdict };
    expect(
      composeDispatchGatesForStep({ structural, external, shadowPresence, releaseSignature: signature }, 'dispatch'),
    ).toEqual(
      composeDispatchGates({
        structural, external, shadowPresence,
        releaseSignature: evaluateReleaseSignatureGate(signature),
      }),
    );
  });
});

describe('isReleaseSignatureRequired', () => {
  it.each(['IND', 'NDA', 'BLA', 'MAA'])('requires a signature for %s', t => {
    expect(isReleaseSignatureRequired(t)).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isReleaseSignatureRequired('  ind ')).toBe(true);
    expect(isReleaseSignatureRequired('Nda')).toBe(true);
  });

  it.each(['510k', 'PMA', 'JNDA', 'DeNovo'])('does not require one for %s', t => {
    expect(isReleaseSignatureRequired(t)).toBe(false);
  });

  it('treats a missing type as not-required rather than throwing', () => {
    expect(isReleaseSignatureRequired(null)).toBe(false);
    expect(isReleaseSignatureRequired(undefined)).toBe(false);
    expect(isReleaseSignatureRequired('')).toBe(false);
  });

  it('pins the required list so a silent widening fails here', () => {
    // Deliberately duplicated from the orchestrator's build-time allowlist.
    // If the two diverge, that is a decision someone must make explicitly —
    // this assertion is where it surfaces.
    expect(transmitSignatureRequiredTypes()).toEqual(['BLA', 'IND', 'MAA', 'NDA']);
  });
});
