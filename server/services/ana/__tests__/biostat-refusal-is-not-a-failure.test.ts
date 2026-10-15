/**
 * An engine refusal reaches AnA as `needs_parameters`, not as a failure
 * (2026-10-11).
 *
 * Since 2026-10-05 the computation engine throws `ComputationRefusal` rather
 * than substituting a silent default — a hazard ratio of 0.5 for an effect
 * ≥ 1, an 0.85 performance goal, a crossover correlation of 0.5, an agreement
 * design it has no published method for. That is the right behaviour, but the
 * biostatistics tool handlers caught every throw the same way and answered
 * `{ error: "Sample size computation failed: …" }`. The assistant then tells
 * the user the computation broke, when what happened is that it needs one
 * more input and already said which. The two are different states and the
 * tool envelope now says which one happened.
 */
import { describe, expect, it } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { computationEngine } from '../../ana-biostats/computation-engine.js';

const BASE = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
};

const call = async (tool: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!(input as never, {} as never));

describe('compute_sample_size', () => {
  it('reports a refused hazard ratio as needs_parameters, naming the field and why', async () => {
    const out = await call('compute_sample_size', {
      ...BASE,
      endpointType: 'time_to_event',
      effectSize: 1.4,
    });

    expect(out.status).toBe('needs_parameters');
    expect(out.engine).toBe('deterministic');
    expect(out.field).toBe('effectSize');
    expect(out.message).toMatch(/hazard ratio/i);
    expect(out).not.toHaveProperty('error');
    expect(JSON.stringify(out)).not.toMatch(/failed/i);
    // The refusal must not carry a computed figure of any kind.
    expect(out).not.toHaveProperty('sampleSize');
  });

  // 2026-10-11: until this change computeStandard's `default:` sized six
  // endpoint types with the continuous two-sample formula on every track but
  // diagnostics_ivd, and said nothing about it. An agreement study for a
  // pharma sponsor came back as 64 per group with its endpoint type silently
  // ignored, because the kappa refusal fired only for the IVD track.
  it('refuses an agreement endpoint on any track, not only the IVD one', async () => {
    const out = await call('compute_sample_size', { ...BASE, endpointType: 'agreement', agreementTarget: 0.8 });

    expect(out.status).toBe('needs_parameters');
    expect(out.code).toBe('not_supported');
    expect(out.message).toMatch(/kappa/i);
    expect(out).not.toHaveProperty('error');
    expect(out).not.toHaveProperty('sampleSize');
  });

  it('sizes an accuracy endpoint by the accuracy method on any track, or names what it needs', async () => {
    const without = await call('compute_sample_size', { ...BASE, endpointType: 'sensitivity_specificity' });
    expect(without.status).toBe('needs_parameters');
    expect(without.field).toBe('sensitivity');

    const complete = await call('compute_sample_size', {
      ...BASE,
      endpointType: 'sensitivity_specificity',
      sensitivity: 0.9,
      specificity: 0.9,
      prevalence: 0.3,
      nonInferiorityMargin: 0.05,
    });
    expect(complete.status).toBe('computed');
    expect(complete.method).toMatch(/diagnostic accuracy/i);
    // 363 diseased subjects at a prevalence of 0.3 is 1210 enrolled.
    expect(complete.sampleSize.perGroup).toBe(1210);
  });

  // The bridge (design-adapter.ts) deliberately sizes these by the continuous
  // approximation rather than refusing, so the capability stays — but the
  // caveat must travel with the number, not live only in the caller's note.
  it.each(['ordinal', 'count', 'composite'] as const)(
    'sizes a %s endpoint by the continuous approximation and says so in the result',
    async (endpointType) => {
      const out = await call('compute_sample_size', { ...BASE, endpointType });

      expect(out.status).toBe('computed');
      expect(out.sampleSize.perGroup).toBe(64);
      // nosemgrep: detect-non-literal-regexp -- a test: endpointType is one of the literal endpoint types in the table above
      expect(out.method).toMatch(new RegExp(`continuous approximation for a ${endpointType} endpoint`, 'i'));
      expect(out.method).toMatch(/indicative/i);

      // The tool envelope's `assumptions` is the echoed input, so the
      // engine's own assumption list is checked where it lives.
      const direct = computationEngine.compute({ ...BASE, endpointType } as never);
      expect(JSON.stringify(direct.assumptions)).toMatch(/no closed form for this endpoint type/i);
    },
  );

  it('still computes, and says so, when the inputs are complete', async () => {
    const out = await call('compute_sample_size', BASE);
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    // 64 per group is the exact noncentral-t answer for d = 0.5 (R power.t.test).
    expect(out.sampleSize.perGroup).toBe(64);
  });
});

describe('the other biostatistics tools', () => {
  it('compare_statistical_scenarios reports a refusal the same way', async () => {
    const out = await call('compare_statistical_scenarios', {
      scenarioA: BASE,
      scenarioB: { ...BASE, endpointType: 'time_to_event', effectSize: 1.4 },
    });
    expect(out.status).toBe('needs_parameters');
    expect(out).not.toHaveProperty('error');
  });

  it('generate_statistical_document refuses rather than drafting around the gap', async () => {
    const out = await call('generate_statistical_document', {
      ...BASE,
      endpointType: 'time_to_event',
      effectSize: 1.4,
      documentType: 'sap_section',
    });
    expect(out.status).toBe('needs_parameters');
    expect(out).not.toHaveProperty('content');
    expect(out).not.toHaveProperty('error');
  });
});
