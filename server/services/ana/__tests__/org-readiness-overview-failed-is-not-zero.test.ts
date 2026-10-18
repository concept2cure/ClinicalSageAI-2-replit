/**
 * The org readiness overview reports a failed or partial project as such
 * (2026-10-15, finding 7 at its consumer).
 *
 * What the code used to do:
 *  - a project whose aggregate threw was listed with score 0, every component
 *    0 and filingBlocking false — measured figures for a read that failed;
 *  - averageScore was 0 when no project had been aggregated;
 *  - a missing projects table or column (42P01 / 42703) returned the empty
 *    overview, "no projects", for a read that failed.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({ query: h.query }) }));

import { deriveOrgReadinessOverview, getOrgReadinessOverview } from '../org-readiness-overview';
import type { ProjectReadinessAggregate, ReadinessComponentScore } from '../project-readiness-aggregator';

const meta = (projectId: number) => ({
  projectId,
  projectName: `P${projectId}`,
  projectCode: null,
  projectStatus: 'active',
  therapeuticArea: null,
});
const scored = (score: number | null): ReadinessComponentScore => ({
  weight: 0.1,
  assessed: score !== null,
  score,
  weighted: null,
  detail: '',
});

describe('deriveOrgReadinessOverview', () => {
  it('a failed project has no score and no filing verdict, and there is no average of nothing', () => {
    const o = deriveOrgReadinessOverview(7, [{ meta: meta(1), aggregate: null, error: 'boom' }]);
    expect(o.projects[0]).toMatchObject({ status: 'failed', score: null, filingBlocking: null });
    expect(Object.values(o.projects[0].componentScores).every(v => v === null)).toBe(true);
    expect(o.projects[0].notAssessed).toHaveLength(5);
    expect(o.averageScore).toBeNull();
  });

  it('a partial project names the components it was not scored on', () => {
    const aggregate = {
      projectId: 2,
      organizationId: 7,
      asOf: '2026-10-15T00:00:00.000Z',
      score: 56,
      measuredWeight: 0.8,
      notAssessed: [],
      filingBlocking: false,
      components: {
        sectionCoverage: scored(50),
        citationQuality: scored(50),
        consistency: scored(null),
        guidance: scored(null),
        therapeuticContext: scored(100),
      },
      nextActions: [],
      inputs: {},
    } as unknown as ProjectReadinessAggregate;
    const o = deriveOrgReadinessOverview(7, [{ meta: meta(2), aggregate }]);
    expect(o.projects[0].componentScores.consistency).toBeNull();
    expect(o.projects[0].notAssessed).toEqual(['consistency', 'guidance']);
    expect(o.averageScore).toBe(56);
  });
});

describe('getOrgReadinessOverview', () => {
  it('a projects read that fails is an error, not "no projects"', async () => {
    h.query.mockRejectedValue(Object.assign(new Error('column "therapeutic_area" does not exist'), { code: '42703' }));
    await expect(getOrgReadinessOverview(7)).rejects.toMatchObject({ code: '42703' });
  });
});
