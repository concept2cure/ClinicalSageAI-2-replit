/**
 * A GMP deviation's product impact, class and disposition are not settled by
 * facts nobody stated (audit finding 12 of the f/g/h fabrication sweep,
 * 2026-10-15).
 *
 * What the code used to do: classifyGMPDeviation read every escalating fact
 * with `=== true`, so a deviation given only its description and area came
 * back with the area's baseline class as final ('minor' for documentation),
 * "No direct CQA / safety impact identified" and "Batch may proceed subject to
 * routine release controls", requiresCapa false. An area outside the enum was
 * silently classified as 'other'.
 *
 * Now product impact is null ("not assessed") and the disposition is held for
 * the quality unit until it is, the class is 'undetermined' while an unstated
 * fact could escalate it (notAssessed lists them), and an unknown area is
 * refused.
 */
import { describe, expect, it } from 'vitest';
import { classifyGMPDeviation, type ClassifyDeviationParams } from '../gmp-quality-systems-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

function thrown(fn: () => unknown): { name?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; field?: string };
  }
  return undefined;
}

describe('classifyGMPDeviation: unstated facts are not assessed', () => {
  it('does not say "no product impact" or "batch may proceed" when nobody assessed impact', () => {
    const r = classifyGMPDeviation({ description: 'Second-person verification signature missing', area: 'documentation' });

    expect(r.productImpact.potentiallyImpacted).toBeNull();
    expect(r.productImpact.rationale).not.toMatch(/No direct CQA/);
    expect(r.productImpact.rationale).toMatch(/not assessed/);
    expect(r.productImpact.dispositionGuidance).not.toMatch(/Batch may proceed/);
    expect(r.classification).toBe('undetermined');
    expect(r.requiresCapa).toBe('undetermined');
    expect(r.notAssessed).toEqual(expect.arrayContaining(['patientSafetyImpact', 'outOfSpecConfirmed', 'recurring']));
  });

  it('lets the batch proceed only on explicit no-impact facts', () => {
    const stated: ClassifyDeviationParams = {
      description: 'Second-person verification signature missing',
      area: 'documentation',
      patientSafetyImpact: false,
      outOfSpecConfirmed: false,
      recurring: false,
      batchDistributed: false,
    };
    const r = classifyGMPDeviation(stated);

    expect(r.classification).toBe('minor');
    expect(r.productImpact.potentiallyImpacted).toBe(false);
    expect(r.productImpact.dispositionGuidance).toMatch(/Batch may proceed/);
    expect(r.requiresCapa).toBe(false);
    expect(r.notAssessed).toEqual([]);
  });

  it('classifies a deviation the unstated facts cannot change', () => {
    const r = classifyGMPDeviation({ description: 'Grade A glove breach', area: 'sterility_assurance' });

    expect(r.classification).toBe('critical');
    expect(r.productImpact.potentiallyImpacted).toBe(true);
    expect(r.requiresCapa).toBe(true);
  });

  it('refuses an area it does not know instead of filing it under "other"', () => {
    const err = thrown(() =>
      classifyGMPDeviation({ description: 'x', area: 'warehouse' as unknown as ClassifyDeviationParams['area'] }),
    );

    expect(err?.name).toBe('ComputationRefusal');
    expect(err?.field).toBe('area');
  });
});

describe('classify_gmp_deviation through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('classify_gmp_deviation')!(input as never, {} as never));

  it('serves an unassessed deviation as undetermined, with no release decision', async () => {
    const out = await call({ description: 'Second-person verification signature missing', area: 'documentation' });

    expect(out.status).toBe('computed');
    expect(out.result.classification).toBe('undetermined');
    expect(out.result.productImpact.potentiallyImpacted).toBeNull();
  });

  it('relays an unknown area as needs_parameters naming the field', async () => {
    const out = await call({ description: 'x', area: 'warehouse' });

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('area');
    expect(out).not.toHaveProperty('result');
  });
});
