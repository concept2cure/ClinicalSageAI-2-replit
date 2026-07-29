/**
 * Design controls / DHF traceability + completeness tests.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTraceabilityMatrix,
  assessDhfCompleteness,
  type DhfInput,
} from '../design-controls';

function fullDhf(): DhfInput {
  return {
    hasDesignPlan: true,
    inputs: [
      { id: 'in1', requirement: 'Sensitivity ≥ 95%', category: 'performance' },
      { id: 'in2', requirement: 'Usable by lab tech', category: 'usability' },
    ],
    outputs: [
      { id: 'out1', description: 'Assay protocol', satisfiesInputIds: ['in1'], hasAcceptanceCriteria: true },
      { id: 'out2', description: 'IFU', satisfiesInputIds: ['in2'], hasAcceptanceCriteria: true },
    ],
    verifications: [
      { id: 'v1', description: 'Sensitivity bench test', verifiesOutputIds: ['out1'], result: 'pass' },
      { id: 'v2', description: 'IFU review', verifiesOutputIds: ['out2'], result: 'pass' },
    ],
    validations: [
      { id: 'val1', description: 'Clinical performance', validatesInputIds: ['in1'], productionEquivalent: true, result: 'pass' },
      { id: 'val2', description: 'Usability summative', validatesInputIds: ['in2'], productionEquivalent: true, result: 'pass' },
    ],
    reviews: [{ id: 'dr1', phase: 'final', independentReviewerPresent: true, actionItemsOpen: 0 }],
    changes: [],
    designTransferDocumented: true,
  };
}

describe('buildTraceabilityMatrix', () => {
  it('marks fully traced inputs', () => {
    const m = buildTraceabilityMatrix(fullDhf());
    expect(m.tracedShare).toBe(1);
    expect(m.fullyTracedCount).toBe(2);
    expect(m.orphanOutputIds).toHaveLength(0);
  });

  it('detects an input with no output and a dangling verification', () => {
    const dhf = fullDhf();
    dhf.inputs.push({ id: 'in3', requirement: 'orphan need', category: 'functional' });
    dhf.verifications.push({ id: 'v3', description: 'bad ref', verifiesOutputIds: ['nope'], result: 'pass' });
    const m = buildTraceabilityMatrix(dhf);
    expect(m.tracedShare).toBeLessThan(1);
    expect(m.danglingVerificationIds).toContain('v3');
    const orphanRow = m.rows.find(r => r.inputId === 'in3');
    expect(orphanRow?.fullyTraced).toBe(false);
  });
});

describe('assessDhfCompleteness', () => {
  it('a complete DHF is audit-ready', () => {
    const c = assessDhfCompleteness(fullDhf());
    expect(c.completenessScore).toBe(1);
    expect(c.blockers).toHaveLength(0);
    expect(c.auditReady).toBe(true);
  });

  it('blocks when no design review has an independent reviewer', () => {
    const dhf = fullDhf();
    dhf.reviews = [{ id: 'dr1', phase: 'final', independentReviewerPresent: false, actionItemsOpen: 0 }];
    const c = assessDhfCompleteness(dhf);
    expect(c.auditReady).toBe(false);
    expect(c.blockers.some(b => b.includes('independent reviewer'))).toBe(true);
  });

  it('blocks when validation is not on production-equivalent units', () => {
    const dhf = fullDhf();
    dhf.validations = dhf.validations.map(v => ({ ...v, productionEquivalent: false }));
    const c = assessDhfCompleteness(dhf);
    expect(c.blockers.some(b => b.includes('production-equivalent'))).toBe(true);
  });
});
