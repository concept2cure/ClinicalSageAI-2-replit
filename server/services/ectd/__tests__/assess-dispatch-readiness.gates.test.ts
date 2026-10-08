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
  readinessOptionsForSequence,
  validatedStageOf,
} from '../assess-dispatch-readiness';
import { computeDispatchReadiness } from '../dispatch-readiness';
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

/* QA 2026-10-08 (j7, finding 4): "Dispatch blocked, 2 blockers" with the
   structural gate SATISFIED for a one-leaf original IND missing Form 1571, the
   IB and the general investigational plan — every missing section was a
   warning. Requiredness is now decided per sequence from the regional Module 1
   record, and a section the regulation requires is an error the gate counts. */
describe('readinessOptionsForSequence — required sections decided per sequence', () => {
  const AS_OF = '2026-10-08';
  const original = { region: 'fda', type: 'original', sequenceNumber: '0000' };
  const amendment = { region: 'fda', type: 'amendment', sequenceNumber: '0001' };

  it('an original FDA IND is held to the record\'s IND requirements, as errors', () => {
    const opts = readinessOptionsForSequence(original, 'ind', AS_OF);
    expect(opts.requiredByRegulation?.codes).toEqual(
      expect.arrayContaining(['1.1', '1.2', '1.12.14', '1.14.4.1', '1.14.4.2', '1.20']),
    );
    expect(opts.requiredByRegulation?.codes).not.toContain('1.3.3'); // debarment: marketing applications only
    expect(opts.requiredSections ?? []).toEqual([]);

    // The cover letter alone (BX-256 sequence 0000 in QA): the IND's own gaps block.
    const r = computeDispatchReadiness(
      [{ sectionCode: '1.2', title: 'Cover Letter', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 5 }],
      opts,
    );
    const missing = r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((f) => f.severity === 'error')).toBe(true);
    expect(missing.map((f) => f.sectionCode)).toEqual(expect.arrayContaining(['1.1', '1.14.4.1', '1.20']));
    expect(r.errors).toBe(missing.length);
  });

  it('an original NDA is held to the marketing requirements, not the IND\'s', () => {
    const codes = readinessOptionsForSequence(original, 'nda', AS_OF).requiredByRegulation?.codes ?? [];
    expect(codes).toEqual(expect.arrayContaining(['1.3.3', '1.3.4', '1.14.1']));
    expect(codes).not.toContain('1.20');
  });

  it('a continuing IND sequence is not held to the application\'s Module 1 list (no "1.20 missing" on an amendment)', () => {
    const opts = readinessOptionsForSequence(amendment, 'ind', AS_OF);
    expect(opts.requiredSections ?? []).toEqual([]);
    const r = computeDispatchReadiness(
      [{ sectionCode: '1.1', title: 'Form FDA 1571', lifecycleOp: 'new', documentTable: 'rendered_leaf_files', documentId: 1 }],
      opts,
    );
    expect(r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION')).toEqual([]);
  });

  /* P-20 follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md): every IND submission
     carries a Form FDA 1571 (21 CFR 312), so a continuing IND sequence is held
     to its 1.1 form even though it is not held to the original's Module 1
     list. d155ef099 exempted continuing sequences from every requirement. */
  it('a continuing IND sequence is held to its 1.1 form (Form FDA 1571), as an error, and to nothing else', () => {
    const opts = readinessOptionsForSequence(amendment, 'ind', AS_OF);
    expect(opts.requiredByRegulation?.codes).toEqual(['1.1']);
    expect(opts.requiredByRegulation?.basis).toMatch(/Form FDA 1571/);
    expect(opts.requiredByRegulation?.basis).toMatch(/21 CFR 312/);
    // A protocol amendment with its cover letter and no 1571.
    const r = computeDispatchReadiness(
      [
        { sectionCode: '1.2', title: 'Cover Letter', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 5 },
        { sectionCode: '5.3.5.1', title: 'Protocol amendment', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 6 },
      ],
      opts,
    );
    const missing = r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing.map((f) => [f.sectionCode, f.severity])).toEqual([['1.1', 'error']]);
    expect(missing[0].message).toMatch(/Form FDA 1571/);
    expect(r.errors).toBeGreaterThanOrEqual(1);
    // A sequence numbered past 0000 with no type recorded is continuing too.
    expect(readinessOptionsForSequence({ region: 'fda', type: null, sequenceNumber: '0003' }, 'ind', AS_OF).requiredByRegulation?.codes).toEqual(['1.1']);
  });

  it('a continuing marketing-application sequence is still not held to a Module 1 list', () => {
    for (const kind of ['nda', 'bla', 'anda']) {
      expect(readinessOptionsForSequence(amendment, kind, AS_OF).requiredByRegulation, kind).toBeUndefined();
    }
  });

  it('a region or kind the record does not model keeps the profile list as warnings, never errors', () => {
    const device = readinessOptionsForSequence(original, '510k', AS_OF);
    expect(device.requiredByRegulation).toBeUndefined();
    expect(device.requiredSections?.length).toBeGreaterThan(0);
    const china = readinessOptionsForSequence({ region: 'cn', type: 'original', sequenceNumber: '0000' }, 'nda', AS_OF);
    expect(china.requiredByRegulation).toBeUndefined();
    const r = computeDispatchReadiness(
      [{ sectionCode: '3.2.P.1', title: 'Device', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 9 }],
      device,
    );
    expect(r.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION').every((f) => f.severity === 'warning')).toBe(true);
    expect(r.errors).toBe(0);
  });
});

/* QA 2026-10-08 (j7, finding 20): "0000 original — VALIDATED" beside a
   dispatch-blocked gate. Validated means the validation found no error
   (0e50993c5); a stored stage that no longer meets that says so. */
describe('validatedStageOf — does a recorded Validated stage still hold?', () => {
  const seq = (status: string, validationStatus: string | null) => ({ status, validationStatus, sequenceNumber: '0000' });

  it('is null for any stage but Validated', () => {
    for (const status of ['draft', 'assembling', 'frozen', 'dispatched']) expect(validatedStageOf(seq(status, null), 3)).toBeNull();
  });

  it('holds when the validation finds no error, and says whether a verdict was recorded', () => {
    expect(validatedStageOf(seq('validated', 'passed'), 0)).toEqual({ holds: true, verdictRecorded: true });
    expect(validatedStageOf(seq('validated', null), 0)).toEqual({ holds: true, verdictRecorded: false });
  });

  it('does not hold when the validation now finds errors, and says what to do', () => {
    const v = validatedStageOf(seq('validated', null), 8);
    expect(v).toMatchObject({ holds: false, verdictRecorded: false, errors: 8 });
    expect(v && !v.holds && v.reason).toBe(
      'Sequence 0000 is recorded as Validated, but its validation now finds 8 errors, and no validation verdict was recorded when it was marked. ' +
        'Validated means the validation found no error: return it to Assembling, resolve the errors and validate again. Freeze refuses it until then.',
    );
    const one = validatedStageOf(seq('validated', 'passed'), 1);
    expect(one && !one.holds && one.reason).toMatch(/now finds 1 error\. Validated means/);
  });

  it('an undetermined count does not hold — unknown is not zero', () => {
    expect(validatedStageOf(seq('validated', 'passed'), Number.NaN)).toMatchObject({ holds: false });
  });
});
