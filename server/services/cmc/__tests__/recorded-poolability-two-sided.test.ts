/**
 * Review: assessRecordedPoolability evaluated only the lower bound of a
 * two-sided criterion — the defect fixed in its sibling estimateRecordedShelfLife
 * remained here, so a pH drifting upward against "4.5 - 6.5" pooled to the
 * full Q1E allowance against 4.5, and batches recorded against different
 * upper bounds pooled as if they agreed.
 */
import { describe, expect, it } from 'vitest';

import { assessRecordedPoolability } from '../recorded-stability';

const rising = (offset: number, spec: string) =>
  [0, 6, 12, 24].map((t, i) => ({ timePoint: String(t), parameter: 'pH', result: String([5.0, 5.4, 5.8, 6.4][i] + offset), specification: spec }));

const study = (id: number, batch: string, offset: number, spec = '4.5 - 6.5') => ({
  id, studyTitle: `S${id}`, productName: 'BX-701', batchNumber: batch, storageConditions: ['25°C/60%RH'], duration: 24, stabilityData: rising(offset, spec),
});

describe('assessRecordedPoolability — both bounds of a two-sided criterion', () => {
  it('reports the UPPER bound as limiting for an attribute drifting upward', async () => {
    const out = await assessRecordedPoolability([study(1, 'B-001', 0), study(2, 'B-002', 0.05)]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ph = (out.data.assessments as Array<Record<string, unknown>>).find((a) => a.parameter === 'pH')!;
    expect(ph.assessable).toBe(true);
    expect(ph.specLimit).toBe(6.5);
    expect(ph.direction).toBe('increasing');
    expect((ph.acceptanceCriterion as { limitingBound: string }).limitingBound).toBe('upper');
    expect(ph.shelfLife as number).toBeLessThan(36);
  });

  it('two batches that share a lower bound but not an upper one do NOT pool as if they agreed', async () => {
    const out = await assessRecordedPoolability([study(1, 'B-001', 0, '4.5 - 6.5'), study(2, 'B-002', 0.05, '4.5 - 6.0')]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ph = (out.data.assessments as Array<Record<string, unknown>>).find((a) => a.parameter === 'pH')!;
    expect(ph.assessable).toBe(false);
    expect(String(ph.reason)).toMatch(/different acceptance criteria/);
  });
});
