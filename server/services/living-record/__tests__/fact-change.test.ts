/**
 * Pure fact-change impact logic — no database.
 * Covers proposal merging, no-op detection, per-binding classification
 * (mirror/derived/override/not-evaluable, tolerance, unit mismatch, missing
 * targets), and the impact summary that drives the governed change flow.
 */

import { describe, it, expect } from 'vitest';

import {
  classifyBindingImpact,
  hasProposedValue,
  isNoopChange,
  propagationEligibility,
  proposedFactView,
  summarizeImpacts,
  type BindingImpactInput,
} from '../fact-change';
import type { FactValueView } from '../value-reconciliation';

const countFact = (n: number, unit: string | null = 'subjects'): FactValueView => ({
  valueNum: n,
  valueText: null,
  unit,
  valueType: 'count',
});

const binding = (over: Partial<BindingImpactInput> = {}): BindingImpactInput => ({
  id: 'b-1',
  target: 'claim:42',
  targetKind: 'claim',
  bindingKind: 'mirror',
  observedValue: '186',
  transform: null,
  ...over,
});

describe('hasProposedValue / proposedFactView', () => {
  it('recognizes numeric and non-empty text proposals only', () => {
    expect(hasProposedValue({ valueNum: 120 })).toBe(true);
    expect(hasProposedValue({ valueText: 'once daily' })).toBe(true);
    expect(hasProposedValue({ valueText: '   ' })).toBe(false);
    expect(hasProposedValue({ unit: 'mg' })).toBe(false);
    expect(hasProposedValue({})).toBe(false);
  });

  it('a numeric proposal clears the text axis and vice versa', () => {
    const current: FactValueView = { valueNum: null, valueText: 'twice daily', unit: null, valueType: 'text' };
    const numeric = proposedFactView(current, { valueNum: 2 });
    expect(numeric.valueNum).toBe(2);
    expect(numeric.valueText).toBeNull();

    const text = proposedFactView(countFact(186), { valueText: 'per protocol' });
    expect(text.valueNum).toBeNull();
    expect(text.valueText).toBe('per protocol');
  });

  it('omitted fields keep the current value; provided fields override', () => {
    const next = proposedFactView(countFact(186, 'subjects'), { valueNum: 120 });
    expect(next.unit).toBe('subjects');
    expect(next.valueType).toBe('count');

    const withUnit = proposedFactView(countFact(186, 'subjects'), { valueNum: 120, unit: 'patients' });
    expect(withUnit.unit).toBe('patients');
  });
});

describe('isNoopChange', () => {
  it('same canonical value and unit is a no-op; value or unit change is not', () => {
    expect(isNoopChange(countFact(186), countFact(186))).toBe(true);
    expect(isNoopChange(countFact(186, 'Subjects'), countFact(186, 'subjects'))).toBe(true);
    expect(isNoopChange(countFact(186), countFact(120))).toBe(false);
    expect(isNoopChange(countFact(500, 'mg'), countFact(500, 'g'))).toBe(false);
  });
});

describe('classifyBindingImpact', () => {
  it('flags a mirror binding that diverges from the proposed value', () => {
    const impact = classifyBindingImpact(binding(), countFact(120));
    expect(impact.outcome).toBe('will_drift');
    expect(impact.driftType).toBe('value_mismatch');
    expect(impact.expected).toBe('120');
    expect(impact.observed).toBe('186');
    expect(impact.claimId).toBe(42);
  });

  it('a binding that already matches the proposal is consistent', () => {
    const impact = classifyBindingImpact(binding({ observedValue: '120 randomized' }), countFact(120));
    expect(impact.outcome).toBe('consistent');
    expect(impact.driftType).toBeNull();
  });

  it('manual overrides are surfaced but never drift', () => {
    const impact = classifyBindingImpact(
      binding({ bindingKind: 'manual_override', observedValue: '150' }),
      countFact(120)
    );
    expect(impact.outcome).toBe('override');
    expect(impact.severity).toBe('low');
  });

  it('derived bindings apply their transform; unknown transforms are not evaluable', () => {
    const scaled = classifyBindingImpact(
      binding({ bindingKind: 'derived', transform: { fn: 'scale', factor: 1000 }, observedValue: '186000' }),
      countFact(120)
    );
    expect(scaled.outcome).toBe('will_drift');
    expect(scaled.expected).toBe('120000');

    const unknown = classifyBindingImpact(
      binding({ bindingKind: 'derived', transform: { fn: 'mystery' } }),
      countFact(120)
    );
    expect(unknown.outcome).toBe('not_evaluable');
  });

  it('measures honor the relative tolerance', () => {
    const measure: FactValueView = { valueNum: 18.5, valueText: null, unit: 'months', valueType: 'measure' };
    const close = classifyBindingImpact(binding({ observedValue: '18.6 months' }), measure, { tolerance: 0.05 });
    expect(close.outcome).toBe('consistent');
    const far = classifyBindingImpact(binding({ observedValue: '25 months' }), measure, { tolerance: 0.05 });
    expect(far.outcome).toBe('will_drift');
  });

  it('an empty citation is a missing target with high severity', () => {
    const impact = classifyBindingImpact(binding({ observedValue: '' }), countFact(120));
    expect(impact.outcome).toBe('will_drift');
    expect(impact.driftType).toBe('missing_target');
    expect(impact.severity).toBe('high');
  });

  it('non-claim targets carry no claim id', () => {
    const impact = classifyBindingImpact(
      binding({ target: 'section:doc_9:m2.5', targetKind: 'section' }),
      countFact(120)
    );
    expect(impact.claimId).toBeNull();
  });
});

describe('propagationEligibility', () => {
  it('only divergent claim citations are mechanically propagatable', () => {
    const fact = countFact(120);
    const driftingClaim = classifyBindingImpact(binding(), fact);
    expect(propagationEligibility(driftingClaim)).toEqual({ eligible: true });
  });

  it('prose targets are excluded — they go through the rewrite workflow', () => {
    const impact = classifyBindingImpact(
      binding({ target: 'section:doc_9:m2.5', targetKind: 'section' }),
      countFact(120)
    );
    expect(propagationEligibility(impact)).toEqual({ eligible: false, reason: 'prose_target' });
  });

  it('overrides, consistent citations, and non-evaluable transforms are skipped', () => {
    const fact = countFact(120);
    expect(
      propagationEligibility(classifyBindingImpact(binding({ bindingKind: 'manual_override' }), fact))
    ).toEqual({ eligible: false, reason: 'override' });
    expect(
      propagationEligibility(classifyBindingImpact(binding({ observedValue: '120' }), fact))
    ).toEqual({ eligible: false, reason: 'consistent' });
    expect(
      propagationEligibility(
        classifyBindingImpact(binding({ bindingKind: 'derived', transform: { fn: 'mystery' } }), fact)
      )
    ).toEqual({ eligible: false, reason: 'not_evaluable' });
  });
});

describe('summarizeImpacts', () => {
  it('partitions outcomes, dedupes affected claims, and tracks the highest severity', () => {
    const fact = countFact(120);
    const impacts = [
      classifyBindingImpact(binding({ id: 'b-1', target: 'claim:1' }), fact), // drift, >10% → high
      classifyBindingImpact(binding({ id: 'b-2', target: 'claim:1', observedValue: '' }), fact), // missing → high
      classifyBindingImpact(binding({ id: 'b-3', target: 'claim:2', observedValue: '120' }), fact), // consistent
      classifyBindingImpact(binding({ id: 'b-4', bindingKind: 'manual_override' }), fact), // override
      classifyBindingImpact(
        binding({ id: 'b-5', bindingKind: 'derived', transform: { fn: 'mystery' } }),
        fact
      ), // not evaluable
    ];
    const summary = summarizeImpacts(impacts);
    expect(summary.totalBindings).toBe(5);
    expect(summary.willDrift).toBe(2);
    expect(summary.consistent).toBe(1);
    expect(summary.overridden).toBe(1);
    expect(summary.notEvaluable).toBe(1);
    expect(summary.affectedClaimIds).toEqual([1]);
    expect(summary.highestSeverity).toBe('high');
    expect(summary.requiresReapproval).toBe(true);
  });

  it('no divergence means no re-approval and no affected claims', () => {
    const fact = countFact(186);
    const summary = summarizeImpacts([classifyBindingImpact(binding(), fact)]);
    expect(summary.willDrift).toBe(0);
    expect(summary.highestSeverity).toBeNull();
    expect(summary.requiresReapproval).toBe(false);
    expect(summary.affectedClaimIds).toEqual([]);
  });
});
