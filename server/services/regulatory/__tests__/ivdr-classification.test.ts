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

  it('self-test (non-critical) is Class B (Rule 4)', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'glucose self-monitoring', isSelfTest: true });
    expect(r.classification).toBe('B');
    expect(r.notifiedBodyRequired).toBe(true);
  });

  it('near-patient (not self-test) is Class B (Rule 5)', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'bedside test', isNearPatient: true });
    expect(r.classification).toBe('B');
  });

  it('general low-risk device defaults to Class A (Rule 7) — no notified body', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'wash buffer for laboratory use' });
    expect(r.classification).toBe('A');
    expect(r.notifiedBodyRequired).toBe(false);
    expect(r.matchedRules.some(m => m.rule.includes('Rule 7'))).toBe(true);
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

  it('always emits a complete 10-row rule trace', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'x' });
    expect(r.ruleTrace.length).toBe(10);
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
