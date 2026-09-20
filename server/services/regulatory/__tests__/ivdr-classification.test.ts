/**
 * IVDR Annex VIII classification engine tests.
 */

import { describe, it, expect } from 'vitest';
import { classifyIvdrAnnexVIII } from '../ivdr-classification';
import { getEntry } from '../../ivd-knowledge/knowledge.service';

describe('classifyIvdrAnnexVIII', () => {
  it('blood-screening transmissible-agent test is Class D (Rule 1)', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'HIV screening of blood donations',
      bloodScreening: true,
      detectsTransmissibleAgent: true,
    });
    expect(r.classification).toBe('D');
    expect(r.notifiedBodyRequired).toBe(true);
    expect(r.matchedRules.some(m => m.rule.includes('Rule 1'))).toBe(true);
  });

  it('companion diagnostic is Class C (Rule 3a)', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'select patients for therapy X',
      isCompanionDiagnostic: true,
    });
    expect(r.classification).toBe('C');
    expect(r.knowledgeRefs).toContain('eu.ivdr.companion-diagnostics');
  });

  it('cancer detection is Class C (Rule 3b)', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'detect tumor marker', detectsCancer: true });
    expect(r.classification).toBe('C');
  });

  /* Annex VIII Rule 4(a): self-tests are class C, and class B only "where the
     result is not determining a medically critical status, or is preliminary and
     requires follow-up with appropriate laboratory testing". This engine applied
     the EXCEPTION to every self-test, so a self-test whose result IS medically
     critical was given the lighter conformity route. */
  it('a self-test is Class C under Rule 4(a) when criticality is not stated', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'glucose self-monitoring', isSelfTest: true });
    expect(r.classification).toBe('C');
    expect(r.notifiedBodyRequired).toBe(true);
  });

  it('takes the Rule 4(a) Class B exception only on an explicitly low-risk result, and says it did', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'glucose self-monitoring', isSelfTest: true, riskToPatient: 'low',
    });
    expect(r.classification).toBe('B');
    expect(r.ambiguityNotes.join(' ')).toContain('Rule 4(a) exception');
  });

  /* Rule 4(b): near-patient devices are "classified in their own right" — the
     setting sets no class of its own. Class B here is the Rule 6 catch-all, not
     a near-patient rule. */
  it('near-patient testing sets no class of its own (Rule 4(b))', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'bedside test', isNearPatient: true });
    expect(r.classification).toBe('B');
    const rule4b = r.ruleTrace.find(t => t.rule.includes('Rule 4(b)'));
    expect(rule4b?.matched).toBe(true);
    expect(r.matchedRules.some(m => m.rule.includes('Rule 6'))).toBe(true);
  });

  /* THE DEFECT THIS REPLACES. Annex VIII Rule 6 is verbatim: "Devices not
     covered by the above-mentioned classification rules are classified as class
     B." The engine started at Class A and reported the fall-through as
     "Rule 7 (Class A)", a rule Annex VIII does not contain. Class A
     self-declares and Class B does not, so an IVD the engine could not place was
     told it could CE-mark without a notified body. */
  it('a device matching no rule is Class B by the Rule 6 catch-all, and needs a notified body', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'wash buffer for laboratory use' });
    expect(r.classification).toBe('B');
    expect(r.notifiedBodyRequired).toBe(true);
    expect(r.matchedRules.some(m => m.rule.includes('Rule 6'))).toBe(true);
  });

  /* Class A is reachable only through Rule 5 (general laboratory use, IVD
     instruments, specimen receptacles), which none of these inputs establishes.
     The engine must not award it, and must say why it cannot. */
  it('never awards Class A, and explains that Rule 5 is the manufacturer\'s to assert', () => {
    for (const input of [
      { intendedPurpose: 'wash buffer for laboratory use' },
      { intendedPurpose: 'x', riskToPatient: 'low' as const },
      { intendedPurpose: 'specimen tube' },
    ]) {
      const r = classifyIvdrAnnexVIII(input);
      expect(r.classification).not.toBe('A');
      expect(r.ambiguityNotes.join(' ')).toContain('Rule 5');
    }
  });

  it('highest applicable class wins (CDx + cancer + near-patient → C)', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'companion cancer test at point of care',
      isCompanionDiagnostic: true,
      detectsCancer: true,
      isNearPatient: true,
    });
    expect(r.classification).toBe('C');
  });

  it('blood grouping by intended purpose is Class D (Rule 2)', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'ABO blood typing for transfusion' });
    expect(r.classification).toBe('D');
  });

  /* The trace is the whole of Annex VIII, including the two rules this engine
     cannot decide (5 and 7) — enumerated and unmatched rather than omitted, so a
     reader can see that they were considered. */
  it('emits the complete Annex VIII rule set, all seven rules', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'x' });
    expect(r.ruleTrace.length).toBe(11);
    for (const rule of ['Rule 1', 'Rule 2', 'Rule 3a', 'Rule 3b', 'Rule 3c', 'Rule 3d',
                        'Rule 4(a)', 'Rule 4(b)', 'Rule 5', 'Rule 6', 'Rule 7']) {
      expect(r.ruleTrace.some(t => t.rule.includes(rule)), `missing ${rule}`).toBe(true);
    }
  });

  it('every knowledge ref resolves to a real corpus entry', () => {
    const r = classifyIvdrAnnexVIII({
      intendedPurpose: 'genetic predisposition test',
      isGeneticTest: true,
    });
    expect(r.knowledgeRefs.length).toBeGreaterThan(0);
    for (const id of r.knowledgeRefs) {
      expect(getEntry(id), `knowledge ref ${id} must exist`).not.toBeNull();
    }
  });
});
