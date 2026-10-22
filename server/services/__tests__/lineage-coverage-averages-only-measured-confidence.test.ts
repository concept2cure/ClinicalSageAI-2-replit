/**
 * getLineageCoverage averages only the confidence scores that were measured,
 * and says "no measured confidence" when none was.
 *
 * Since 2026-10-15 provenance-backed lineage rows record confidence_score NULL
 * (not measured — persist-provenance / toLineageSource). getLineageCoverage
 * still summed `rec.confidenceScore || 0` over every row of a source type and
 * divided by the row count, so a source type whose rows carry no score at all
 * reported avgConfidence 0 — a measured zero nobody measured — and one with a
 * single 80 among two rows reported 40. Only measured scores are averaged now;
 * with none, the average is null and says why. A measured 0 is still a 0.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
vi.mock('../../db', () => ({
  db: { select: () => ({ from: () => ({ where: async () => rows.current }) }) },
}));

import { getLineageCoverage } from '../data-lineage-service';

const row = (sourceObjectType: string, confidenceScore: number | null, targetField: string | null = 'sec-1') => ({
  sourceObjectType,
  confidenceScore,
  targetField,
});

describe('getLineageCoverage — confidence averages', () => {
  it('averages measured scores only; none measured is null with the reason', async () => {
    rows.current = [
      row('retrieval_chunk', null),
      row('retrieval_chunk', null, 'sec-2'),
      row('external_evidence', 80),
      row('external_evidence', null),
      row('manual_entry', 0),
    ];
    const report = await getLineageCoverage(7, 'artifact', 'art-1');
    const bySource = Object.fromEntries(report.lineageSources.map((s) => [s.sourceType, s]));

    expect(bySource.retrieval_chunk.avgConfidence, 'unmeasured rows were averaged as zeros').toBeNull();
    expect(bySource.retrieval_chunk).toMatchObject({ count: 2, measuredCount: 0, confidenceNote: 'no measured confidence' });

    expect(bySource.external_evidence).toMatchObject({ count: 2, measuredCount: 1, avgConfidence: 80, confidenceNote: null });
    // A measured zero is a zero.
    expect(bySource.manual_entry).toMatchObject({ count: 1, measuredCount: 1, avgConfidence: 0, confidenceNote: null });
  });
});
