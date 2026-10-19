/**
 * AnA's chat preload does not present document completeness as readiness
 * (finding 4, 2026-10-15).
 *
 * What the code used to do: preloadRIMContext printed
 * "**Readiness: 75/100**" under "cite as [Readiness: section at score%]".
 * Without a readiness assessment on record — every production call — that 75
 * is document-status completeness alone; quality, consistency and compliance
 * were never assessed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), readiness: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/index.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../intelligence/index.js')>()),
  computeReadinessScore: h.readiness,
}));

import { preloadRIMContext } from '../orchestrator';

const COMPLETENESS_ONLY = {
  overallScore: 75,
  dimensions: { completeness: 75, quality: null, consistency: null, compliance: null },
  moduleBreakdown: [],
  gaps: [{ id: 'g1', module: 'milestones', description: 'Milestone "Pre-IND" is overdue', severity: 'critical', remediation: 'x', estimatedEffortHours: null }],
  trend: { direction: 'unknown', delta: null, dataPoints: 0 },
  predictions: { approvalProbability: null, estimatedReviewDays: null, estimatedDeficiencies: null, basis: 'no_assessment_on_record' },
  scoreBasis: { source: 'no_assessment_on_record', measured: ['completeness'], notMeasured: ['quality', 'consistency', 'compliance'] },
  scoredAt: '2026-10-15T00:00:00.000Z',
};

beforeEach(() => {
  h.readiness.mockReset();
});

describe('preloadRIMContext — the readiness line', () => {
  it('names completeness as completeness and the dimensions nobody assessed', async () => {
    h.readiness.mockResolvedValue(COMPLETENESS_ONLY);
    const block = await preloadRIMContext('51', 9191);
    expect(block).not.toContain('Readiness: 75/100');
    expect(block).toContain(
      'Readiness not assessed — document completeness 75% (document status only); ' +
        'quality, consistency and compliance not assessed',
    );
    // The recorded gap is a fact and is still listed.
    expect(block).toContain('[CRITICAL] milestones: Milestone "Pre-IND" is overdue');
  });
});
