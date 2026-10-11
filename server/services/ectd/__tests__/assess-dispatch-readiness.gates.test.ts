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
  composeStepVerdicts,
  externalNotAssessed,
  originalIndModule3Headings,
  isOriginalApplicationSequence,
} from '../assess-dispatch-readiness';
import { DISPATCH_GATE_RULE_IDS } from '../validation-rule-corpus';
import { computeDispatchReadiness, type OriginalModule3Requirement, type ReadinessLeaf } from '../dispatch-readiness';
import { requiredSectionProfileFor } from '../required-sections';

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

/**
 * composeStepVerdicts — the three verdicts an assessment reports, from one set
 * of parts. What is pinned is MEMBERSHIP: a verdict composed without a gate
 * blocks nothing on it, and every test of that gate alone still passes. So each
 * case puts one real blocker in one gate and asserts which verdicts carry it.
 */
describe('composeStepVerdicts — each step verdict carries every gate it must', () => {
  const clear = { cleared: true, blockers: [] as string[] };
  const baseParts = {
    structural: clear,
    external: clear,
    shadowPresence: clear,
    releaseSignature: { required: true, verdict: 'unsigned' as const, detail: 'none on record' },
  };
  /** The spine precedence the real resolver produces for a never-signed sequence. */
  const neverSigned = { verdict: 'unsigned' as const, decidedBy: 'sequence' as const };

  it('P11-28b: an otherwise-clear sequence awaiting only its own signature is open to dispatch-on-signing, not to dispatch now', () => {
    const v = composeStepVerdicts(baseParts, neverSigned);
    expect(v.gate.cleared, 'dispatch-now must still require the signature').toBe(false);
    expect(v.freezeGate.cleared).toBe(true);
    expect(
      v.dispatchGateOnSigning.cleared,
      'the only control that creates the release signature is gated on its already existing',
    ).toBe(true);
  });

  it('a structural error blocks all three — signing never clears a content defect', () => {
    const v = composeStepVerdicts(
      { ...baseParts, structural: { cleared: false, blockers: ['1 open error-severity validation finding.'] } },
      neverSigned,
    );
    expect(v.gate.cleared).toBe(false);
    expect(v.freezeGate.cleared).toBe(false);
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
    expect(v.dispatchGateOnSigning.blockers.join(' ')).toMatch(/validation finding/);
  });

  it('a missing Shadow Review blocks dispatch-on-signing', () => {
    const v = composeStepVerdicts(
      { ...baseParts, shadowPresence: { cleared: false, blockers: ['No completed Shadow Review.'] } },
      neverSigned,
    );
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
  });

  it('an external-validator failure blocks dispatch-on-signing', () => {
    const v = composeStepVerdicts(
      { ...baseParts, external: { cleared: false, blockers: ['The external validator report carries 2 errors.'] } },
      neverSigned,
    );
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
  });

  it('an orchestrator run awaiting its signer blocks dispatch-on-signing — the sequence signature would never be read', () => {
    const v = composeStepVerdicts(
      { ...baseParts, releaseSignature: { required: true, verdict: 'awaiting', detail: 'run-a' } },
      { verdict: 'awaiting', decidedBy: 'orchestrator' },
    );
    expect(v.gate.cleared).toBe(false);
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
    expect(v.freezeGate.cleared, 'freeze does not require a release signature').toBe(true);
  });

  it('an invalid signature blocks all three, including freeze — tamper evidence is never signed over', () => {
    const v = composeStepVerdicts(
      { ...baseParts, releaseSignature: { required: true, verdict: 'invalid', detail: 'digest drift' } },
      { verdict: 'invalid', decidedBy: 'sequence' },
    );
    expect(v.gate.cleared).toBe(false);
    expect(v.freezeGate.cleared).toBe(false);
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
  });

  it('an undetermined lookup blocks dispatch-now and dispatch-on-signing', () => {
    const v = composeStepVerdicts(
      { ...baseParts, releaseSignature: { required: true, verdict: 'undetermined', detail: 'connection reset' } },
      { verdict: 'undetermined', decidedBy: 'orchestrator' },
    );
    expect(v.gate.cleared).toBe(false);
    expect(v.dispatchGateOnSigning.cleared).toBe(false);
  });

  it('a signature already on record: all three clear, and nothing is "resolved by signing"', () => {
    const v = composeStepVerdicts(
      { ...baseParts, releaseSignature: { required: true, verdict: 'signed' } },
      { verdict: 'signed', decidedBy: 'sequence' },
    );
    expect(v.gate.cleared).toBe(true);
    expect(v.freezeGate.cleared).toBe(true);
    expect(v.dispatchGateOnSigning.cleared).toBe(true);
  });

  it('a type that requires no signature: all three clear on an otherwise-clear sequence', () => {
    const v = composeStepVerdicts(
      { ...baseParts, releaseSignature: { required: false, verdict: 'unsigned' } },
      { verdict: 'unsigned', decidedBy: 'orchestrator' },
    );
    expect(v.gate.cleared).toBe(true);
    expect(v.dispatchGateOnSigning.cleared).toBe(true);
  });
});

describe('an advisory gate that did not run is not assessed, not passed (populated-org sweep, 2026-09-28)', () => {
  const clear = { cleared: true, blockers: [] as string[] };
  const block = { cleared: false, blockers: ['x'] };

  it('says why the external gate cleared without a report', () => {
    expect(externalNotAssessed({ ran: false, configured: false })).toMatch(/No agency-grade validator is configured/);
    expect(externalNotAssessed({ ran: false, configured: true })).toMatch(/configured but did not run/);
    expect(externalNotAssessed({ ran: true, configured: true })).toBeUndefined();
  });

  it('carries the sentence on the external gate view only when it cleared', () => {
    const note = externalNotAssessed({ ran: false, configured: false })!;
    const views = dispatchGateViews(
      { structural: clear, external: clear, shadowPresence: block, releaseSignature: block },
      { external: note },
    );
    const ext = views.find((v) => v.key === 'external')!;
    expect(ext.cleared).toBe(true);
    expect(ext.notAssessed).toBe(note);
    for (const v of views.filter((x) => x.key !== 'external')) expect(v.notAssessed).toBeUndefined();
  });

  it('a gate that blocks keeps its blockers and no not-assessed note', () => {
    const views = dispatchGateViews(
      { structural: clear, external: block, shadowPresence: clear, releaseSignature: clear },
      { external: 'ignored' },
    );
    expect(views.find((v) => v.key === 'external')!.notAssessed).toBeUndefined();
  });
});

/**
 * CMC-M3-GA item 21 (2026-10-05). The dispatch path asked an IND for Module 1
 * alone, as warnings, and never read the IND profile that names 3.2.S and
 * 3.2.P — an original IND with no CMC section read dispatch-clear. The DB-bound
 * half (which sequence is original, the cross-reference register) is pinned in
 * assess-dispatch-readiness.original-ind-module3.pglite.test.ts.
 */
describe('an original IND is asked for the Module 3 its profile names', () => {
  it('reads the headings from the IND profile, with their ICH M4 titles — not a second list', () => {
    const headings = originalIndModule3Headings('ind', 'fda');
    const profileM3 = [...requiredSectionProfileFor('IND', 'fda')!.sections].filter((c) => c.startsWith('3.'));
    expect(headings?.map((h) => h.code)).toEqual(profileM3);
    expect(headings).toEqual([
      { code: '3.2.S', title: 'Drug Substance' },
      { code: '3.2.P', title: 'Drug Product' },
    ]);
  });

  it('asks a US IND only: not an NDA, not an IND outside FDA, not an unknown type', () => {
    expect(originalIndModule3Headings('nda', 'fda')).toBeNull();
    expect(originalIndModule3Headings('ind', 'eu')).toBeNull();
    expect(originalIndModule3Headings(null, 'fda')).toBeNull();
  });

  it('sequence 0000 is the original; another number only when typed original and first', () => {
    expect(isOriginalApplicationSequence({ type: 'amendment', sequenceNumber: '0000' }, false)).toBe(true);
    expect(isOriginalApplicationSequence({ type: 'original', sequenceNumber: '0001' }, false)).toBe(true);
    // The column default: a later sequence created without a type reads 'original'.
    expect(isOriginalApplicationSequence({ type: 'original', sequenceNumber: '0003' }, true)).toBe(false);
    expect(isOriginalApplicationSequence({ type: 'amendment', sequenceNumber: '0001' }, false)).toBe(false);
  });
});

describe('IND_MODULE3_REQUIRED — what clears a required heading, and what does not', () => {
  const leaf = (sectionCode: string, over: Partial<ReadinessLeaf> = {}): ReadinessLeaf => ({
    sectionCode, title: sectionCode, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 1, ...over,
  });
  const requirement = (crossReferences: OriginalModule3Requirement['crossReferences'] = []): OriginalModule3Requirement => ({
    label: 'the original IND (sequence 0000)',
    headings: [{ code: '3.2.S', title: 'Drug Substance' }, { code: '3.2.P', title: 'Drug Product' }],
    crossReferences,
  });
  const missing = (leaves: ReadinessLeaf[], req = requirement()) =>
    computeDispatchReadiness(leaves, { originalModule3: req }).findings
      .filter((f) => f.code === 'IND_MODULE3_REQUIRED')
      .map((f) => f.sectionCode);

  it('Module 1 alone: both headings are blocking errors', () => {
    const r = computeDispatchReadiness([leaf('m1.1'), leaf('m1.2')], { originalModule3: requirement() });
    expect(r.errors).toBe(2);
    expect(r.findings.filter((f) => f.severity === 'error').map((f) => f.sectionCode)).toEqual(['3.2.S', '3.2.P']);
  });

  it('a leaf at or under the heading clears it, in any spelling; a numerically adjacent code does not', () => {
    expect(missing([leaf('m3.2.S.4.1'), leaf('3.2.p')])).toEqual([]);
    expect(missing([leaf('m3-2-s-1'), leaf('3.2.P1')])).toEqual(['3.2.P']);
  });

  it('a delete leaf places nothing', () => {
    expect(missing([leaf('m3.2.S.1', { lifecycleOp: 'delete' }), leaf('m3.2.P.1')])).toEqual(['3.2.S']);
  });

  it('a cross-reference clears only with its LOA on file and the heading named (or a heading that contains it)', () => {
    const p = [leaf('m3.2.P.1')];
    const ref = (authorizedSections: string[], loaOnFile: boolean) => [{ fileLabel: 'DMF 1', authorizedSections, loaOnFile }];
    expect(missing(p, requirement(ref(['3.2.S'], true)))).toEqual([]);
    expect(missing(p, requirement(ref(['m3.2.S.2'], true)))).toEqual([]);
    expect(missing(p, requirement(ref(['3.2'], true)))).toEqual([]);
    expect(missing(p, requirement(ref(['3.2.S'], false)))).toEqual(['3.2.S']);
    // "The file in its entirety" does not say which part of Module 3 it holds.
    expect(missing(p, requirement(ref([], true)))).toEqual(['3.2.S']);
    expect(missing(p, requirement(ref(['3.2.P'], true)))).toEqual(['3.2.S']);
  });

  it('a register that could not be read is not an empty register: still blocking, with the reason', () => {
    const r = computeDispatchReadiness([leaf('m3.2.P.1')], {
      originalModule3: { ...requirement(null), crossReferenceError: 'relation "ind_cross_references" does not exist' },
    });
    const f = r.findings.find((x) => x.code === 'IND_MODULE3_REQUIRED');
    expect(f?.severity).toBe('error');
    expect(f?.message).toMatch(/register could not be read \(relation "ind_cross_references" does not exist\)/);
  });

  it('asks nothing when no requirement is given (an amendment, another application)', () => {
    expect(computeDispatchReadiness([leaf('m1.1')], { originalModule3: null }).errors).toBe(0);
  });
});
