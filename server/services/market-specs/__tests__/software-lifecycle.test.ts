/**
 * Tests for the IEC 62304 software lifecycle model.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySoftware,
  SOFTWARE_DELIVERABLES,
  deliverablesForClass,
  assessSoftwareDeliverables,
  SOFTWARE_REVIEWER_QUESTIONS,
} from '../software-lifecycle';

describe('software classification (IEC 62304 §4.3)', () => {
  it('death/serious injury → Class C', () => {
    expect(classifySoftware({ canContributeToDeathOrSeriousInjury: true }).class).toBe('C');
  });
  it('non-serious injury → Class B', () => {
    expect(classifySoftware({ canContributeToNonSeriousInjury: true }).class).toBe('B');
  });
  it('no possible injury → Class A', () => {
    expect(classifySoftware({}).class).toBe('A');
  });
});

describe('software deliverables by class', () => {
  it('Class A excludes architecture and detailed design', () => {
    const ids = deliverablesForClass('A').map((d) => d.id);
    expect(ids).not.toContain('architecture');
    expect(ids).not.toContain('detailed_design');
    expect(ids).toContain('requirements');
    expect(ids).toContain('system_testing');
  });
  it('Class B adds architecture + integration testing but not detailed design', () => {
    const ids = deliverablesForClass('B').map((d) => d.id);
    expect(ids).toContain('architecture');
    expect(ids).toContain('integration_testing');
    expect(ids).not.toContain('detailed_design');
  });
  it('Class C adds detailed design', () => {
    expect(deliverablesForClass('C').map((d) => d.id)).toContain('detailed_design');
  });
  it('deliverable count escalates A < B < C', () => {
    expect(deliverablesForClass('A').length).toBeLessThan(deliverablesForClass('B').length);
    expect(deliverablesForClass('B').length).toBeLessThan(deliverablesForClass('C').length);
  });
});

describe('software deliverable assessment', () => {
  it('reports the missing deliverables for a class', () => {
    const a = assessSoftwareDeliverables('C', ['development_plan', 'requirements']);
    expect(a.ready).toBe(false);
    expect(a.missing).toContain('detailed_design');
    expect(a.totalRequired).toBe(deliverablesForClass('C').length);
  });
  it('is ready when all class deliverables are present', () => {
    const all = deliverablesForClass('B').map((d) => d.id);
    expect(assessSoftwareDeliverables('B', all).ready).toBe(true);
  });
  it('exposes reviewer questions incl. SOUP and cybersecurity', () => {
    expect(SOFTWARE_REVIEWER_QUESTIONS.some((q) => /SOUP/.test(q))).toBe(true);
    expect(SOFTWARE_REVIEWER_QUESTIONS.some((q) => /cybersecurity|SBOM/i.test(q))).toBe(true);
  });
});
