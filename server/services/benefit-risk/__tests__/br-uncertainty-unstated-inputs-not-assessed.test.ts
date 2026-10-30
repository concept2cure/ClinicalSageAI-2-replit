/**
 * assess_br_uncertainty must not grade what was never stated (Rule 2 audit S3,
 * docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md).
 *
 * Before this change the engine assumed a net margin of 0.15 when none was
 * given (and read a null margin as 0), graded a source with no level
 * 'moderate', graded overall uncertainty 'moderate' with no source, and, with
 * no source stated, said the conclusion "appears insensitive to the stated
 * uncertainties" and that no residual uncertainty needs labeling. Each is now
 * reported as not stated or not assessed.
 *
 * Every case except the two marked "control" fails on the pre-fix engine.
 */
import { describe, it, expect } from 'vitest';
import { assessBRUncertainty } from '../benefit-risk-knowledge';
import { ASSESS_BR_UNCERTAINTY } from '../../ana/benefitRiskTools';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const base = { productName: 'DrugX', indication: 'moderate-to-severe plaque psoriasis' };

describe('assessBRUncertainty — no net margin stated', () => {
  it('does not assess robustness and prints no margin when netBalanceEstimate is omitted', () => {
    const r = assessBRUncertainty({
      ...base,
      sources: [{ type: 'rare_events', affects: 'risk', level: 'low' }],
    });
    expect(r.robustnessOfConclusion).toBe('not_assessed');
    expect(r.narrative).not.toMatch(/net margin of approximately/);
    expect(r.narrative).not.toContain('0.15');
    expect(r.narrative).toMatch(/not assessed, because no net benefit-risk margin was stated/);
    // The level that was stated is still graded.
    expect(r.overallUncertainty).toBe('low');
  });

  it('reads a null margin as not stated, not as 0', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: null,
      sources: [{ type: 'data_quality', affects: 'benefit', level: 'low' }],
    } as any);
    expect(r.robustnessOfConclusion).toBe('not_assessed');
    expect(r.narrative).not.toMatch(/net margin of approximately/);
  });

  it('control: a stated margin still gives a verdict and prints the margin', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: 0.4,
      sources: [{ type: 'rare_events', affects: 'risk', level: 'low' }],
    });
    expect(r.robustnessOfConclusion).toBe('robust');
    expect(r.narrative).toMatch(/judged robust given a net margin of approximately 0\.4\b/);
  });
});

describe('assessBRUncertainty — a source with no level', () => {
  it('reports the level as not stated instead of grading it moderate', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: 0.5,
      sources: [{ type: 'surrogate_endpoint', affects: 'benefit' }],
    });
    expect(r.sources[0].level).toBe('not_stated');
    expect(r.sources[0].impactOnBalance).not.toMatch(/moderately/);
    expect(r.sources[0].impactOnBalance).toMatch(/level was not stated/);
    expect(r.overallUncertainty).toBe('not_assessed');
    expect(r.robustnessOfConclusion).toBe('not_assessed');
    expect(r.narrative).toMatch(/1 with no stated level/);
    expect(r.narrative).toMatch(/the level of 1 source\(s\) was not stated/);
    expect(r.residualUncertaintyForLabel.join(' ')).not.toMatch(/No high-grade residual uncertainty/);
  });

  it('keeps a fragile verdict that the stated levels already reach', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: 0.3,
      sources: [
        { type: 'data_quality', level: 'high' },
        { type: 'rare_events', level: 'high' },
        { type: 'long_term' },
      ],
    });
    expect(r.sources[2].level).toBe('not_stated');
    expect(r.overallUncertainty).toBe('high');
    expect(r.robustnessOfConclusion).toBe('fragile');
  });
});

describe('assessBRUncertainty — no source stated', () => {
  it('grades nothing and claims no insensitivity or labeling conclusion', () => {
    const r = assessBRUncertainty({ ...base, netBalanceEstimate: 0.5, sources: [] });
    expect(r.overallUncertainty).toBe('not_assessed');
    expect(r.robustnessOfConclusion).toBe('not_assessed');
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/insensitive to the stated uncertainties/);
    expect(text).not.toMatch(/No high-grade residual uncertainty/);
    expect(r.whatWouldChangeTheConclusion[0]).toMatch(/No uncertainty source was stated/);
    expect(r.residualUncertaintyForLabel[0]).toMatch(/No uncertainty source was stated/);
    expect(r.narrative).toMatch(/not assessed, because no uncertainty source was stated/);
  });

  it('control: fully stated inputs keep the existing verdict and wording', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: 0.12,
      sources: [{ type: 'missing_data', affects: 'both', level: 'moderate' }],
    });
    expect(r.overallUncertainty).toBe('moderate');
    expect(r.robustnessOfConclusion).toBe('sensitive');
    expect(r.residualUncertaintyForLabel).toEqual([
      'No high-grade residual uncertainty requires explicit labeling beyond routine pharmacovigilance.',
    ]);
  });
});

describe('S3 review: an unstated affected side', () => {
  it('does not invent both benefit and risk or side-specific conclusions', () => {
    const r = assessBRUncertainty({
      ...base,
      netBalanceEstimate: 0.4,
      sources: [{ type: 'data_quality', level: 'low' }],
    });
    expect(r.sources[0].affects).toBe('not_stated');
    expect(r.sources[0].impactOnBalance).toMatch(/side.*not stated/i);
    expect(r.sources[0].impactOnBalance).not.toContain('both benefit and risk');
    expect(r.whatWouldChangeTheConclusion).toEqual([
      'No stated source names a recognised side of the balance (benefit, risk or both), so what would change the conclusion was not assessed.',
    ]);
  });

  it('keeps explicitly stated directions', () => {
    for (const affects of ['benefit', 'risk', 'both'] as const) {
      const r = assessBRUncertainty({ ...base, sources: [{ type: 'data_quality', level: 'low', affects }] });
      expect(r.sources[0].affects).toBe(affects);
      expect(r.whatWouldChangeTheConclusion.join(' ')).not.toContain('not assessed');
    }
  });

  it('does not advertise a default affected side', () => {
    const props = (ASSESS_BR_UNCERTAINTY.input_schema as any).properties;
    expect(props.sources.items.properties.affects.description).not.toMatch(/default/i);
    expect(props.sources.items.properties.affects.description).toContain('not stated');
  });
});

describe('assess_br_uncertainty handler', () => {
  it('returns not_assessed through the tool envelope when no margin is stated', async () => {
    const out = JSON.parse(
      await getToolHandler('assess_br_uncertainty')!({
        ...base,
        sources: [{ type: 'missing_data', level: 'moderate' }],
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.result.robustnessOfConclusion).toBe('not_assessed');
    expect(JSON.stringify(out)).not.toMatch(/net margin of approximately/);
  });
});

describe('assess_br_uncertainty definition', () => {
  const props = (ASSESS_BR_UNCERTAINTY.input_schema as any).properties;

  it('says an omitted net margin leaves robustness not assessed', () => {
    expect(props.netBalanceEstimate.description).toMatch(
      /Without it, robustness is not assessed; no margin is assumed\./,
    );
  });

  it('no longer tells the model an omitted level defaults to moderate', () => {
    expect(props.sources.items.properties.level.description).not.toMatch(/default/i);
    expect(props.sources.items.properties.level.description).toMatch(/no level is assumed/);
  });
});
