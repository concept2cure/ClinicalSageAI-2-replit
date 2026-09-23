/**
 * The two dispatch-gate decisions that must fail closed, extracted as pure
 * helpers from the DB-bound assessor:
 *   - resolveDispatchEnvironment: an unset/misspelled NODE_ENV must NOT relax
 *     the production eValidator rule.
 *   - evaluateShadowPresenceGate: a never-Shadow-Reviewed sequence (0 completed
 *     runs) is UNASSESSED, not clean, and must block dispatch.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDispatchEnvironment,
  evaluateShadowPresenceGate,
  dispatchGateViews,
  withRules,
  composeDispatchGates,
} from '../assess-dispatch-readiness';
import { DISPATCH_GATE_RULE_IDS } from '../validation-rule-corpus';

describe('resolveDispatchEnvironment — fails toward production', () => {
  it('treats unset / misspelled NODE_ENV as production (strict)', () => {
    expect(resolveDispatchEnvironment(undefined)).toBe('production');
    expect(resolveDispatchEnvironment('')).toBe('production');
    expect(resolveDispatchEnvironment('prod')).toBe('production'); // misspelled → strict
    expect(resolveDispatchEnvironment('production')).toBe('production');
  });

  it('only relaxes for a recognized non-production value', () => {
    expect(resolveDispatchEnvironment('development')).toBe('staging');
    expect(resolveDispatchEnvironment('test')).toBe('staging');
    expect(resolveDispatchEnvironment('staging')).toBe('staging');
  });
});

describe('evaluateShadowPresenceGate — never-reviewed is not clean', () => {
  it('blocks when zero Shadow Review runs have completed', () => {
    const gate = evaluateShadowPresenceGate(0);
    expect(gate.cleared).toBe(false);
    expect(gate.blockers.join(' ')).toMatch(/never-reviewed|Shadow Review/i);
  });

  it('clears once at least one completed run exists', () => {
    const gate = evaluateShadowPresenceGate(1);
    expect(gate.cleared).toBe(true);
    expect(gate.blockers).toHaveLength(0);
  });
});

describe('the dispatch verdict, gate by gate, as named rules', () => {
  const parts = {
    structural: { cleared: true, blockers: [] },
    shadowPresence: { cleared: false, blockers: ['No completed Shadow Review has run for this sequence.'] },
    external: { cleared: false, blockers: ['The external validator report carries 2 errors.'] },
    releaseSignature: { cleared: false, blockers: ['The release signature is unsigned.'] },
  };

  it('names every composed gate by its corpus rule and carries its own blockers', () => {
    const views = dispatchGateViews(parts);
    // The order composeDispatchGates merges them in, so the list reads as the verdict does.
    expect(views.map((v) => v.key)).toEqual(['structural', 'external', 'shadowPresence', 'releaseSignature']);
    for (const v of views) {
      expect(v.rule?.id).toBe(DISPATCH_GATE_RULE_IDS[v.key]);
      expect(v.rule?.enforcementStatement).toBeTruthy();
    }
    expect(views[2]).toMatchObject({ cleared: false, blockers: parts.shadowPresence.blockers });
    expect(views[0]).toMatchObject({ cleared: true, blockers: [] });
  });

  it('the gates, taken together, are exactly the composed verdict — nothing shown that does not block, nothing blocking unshown', () => {
    const views = dispatchGateViews(parts);
    const composed = composeDispatchGates(parts);
    expect(views.flatMap((v) => v.blockers)).toEqual(composed.blockers);
    expect(views.every((v) => v.cleared)).toBe(composed.cleared);
  });

  it('attaches each finding\'s rule, and says so when a code has none', () => {
    const out = withRules([
      { severity: 'error', code: 'EMPTY_SEQUENCE', sectionCode: null, message: 'x' },
      { severity: 'warning', code: 'NO_SUCH_RULE', sectionCode: null, message: 'y' },
    ]);
    expect(out[0].rule?.id).toBe('EMPTY_SEQUENCE');
    expect(out[1].rule).toBeNull();
  });
});
