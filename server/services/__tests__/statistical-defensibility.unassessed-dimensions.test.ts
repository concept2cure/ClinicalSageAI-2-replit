/**
 * WO-16C finding 45 — statistical-defensibility manufactures a 50 for any
 * dimension the model did not score, and rewrites an honest 0 as 50.
 *
 * `assessDefensibility` read each of the seven dimensions as `scores.X || 50`,
 * so BOTH an omitted dimension AND a legitimately reported worst score of 0
 * became a hardcoded midpoint — twice over, in the customer-facing
 * `overallScore` average and again in the returned `dimensionScores`. One
 * 0 -> 50 rewrite lifts the mean by ~7.1 points, which is enough to move the
 * rating chip rendered on the routed `biostat-workbench` surface across the
 * 40/60/80 thresholds with no indicator that anything was substituted. The
 * path is biased to fire exactly where the input is emptiest: the shipped
 * client sends five fields, so multiplicity, missing-data and estimand
 * strategy always reach the model as "Not specified".
 *
 * The failure is injected at the DEPENDENCY — `ai.chat`, the only source these
 * scores have ever had — which returns a model response that omits
 * `estimandClarity` and scores `endpointQuality` 0. Nothing inside the service
 * under test is mocked or stubbed.
 *
 * What the fix must hold:
 *   - a reported 0 stays 0 and is averaged as 0;
 *   - a dimension the model did not score is `null`, never 50;
 *   - with any dimension unscored, `overallScore`/`overallRating` are `null`
 *     and `scoreBasis` carries the `{ran:false, reason}` third state from
 *     server/lib/verification-outcome.ts — an average of six dimensions is not
 *     the seven-dimension score the surface labels it as.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chatMock = vi.fn();

// The service carries an unused `db` import; mocking it keeps this unit test
// from reaching for a connection through the module graph.
vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../lib/unified-ai-client', () => ({
  ai: { chat: (...args: unknown[]) => chatMock(...args) },
}));

import { statisticalDefensibilityService } from '../statistical-defensibility-service';

/** The five fields the shipped BiostatWorkbench client actually sends. */
function request() {
  return {
    studyPhase: 'Phase 3',
    indication: 'NSCLC',
    studyDesign: 'randomized double-blind',
    primaryEndpoint: { name: 'PFS' } as never,
    secondaryEndpoints: [],
    sampleSize: 400,
    statisticalMethods: [] as string[],
  };
}

function modelReturns(dimensionScores: Record<string, number>) {
  chatMock.mockResolvedValue({
    content: JSON.stringify({
      dimensionScores,
      criticalIssues: [],
      majorIssues: [],
      minorIssues: [],
      recommendations: [],
    }),
  });
}

beforeEach(() => {
  chatMock.mockReset();
});

describe('assessDefensibility — a dimension nothing scored is not a 50', () => {
  it('keeps an honestly reported 0 at 0 and averages it as 0', async () => {
    modelReturns({
      endpointQuality: 0,
      sampleSizeAdequacy: 90,
      multiplicityControl: 90,
      missingDataHandling: 90,
      statisticalMethodChoice: 90,
      designAppropriateness: 90,
      estimandClarity: 90,
    });

    const report = await statisticalDefensibilityService.assessDefensibility(request());

    expect(report.dimensionScores.endpointQuality).toBe(0);
    // 540 / 7 = 77.1 -> 77 "adequate". Coercing the 0 to 50 gives 84 "strong",
    // i.e. the substitution alone carries the rating over the 80 boundary.
    expect(report.overallScore).toBe(77);
    expect(report.overallRating).toBe('adequate');
    expect(report.scoreBasis.ran).toBe(true);
  });

  it('reports a dimension the model omitted as null, and withholds the overall score', async () => {
    modelReturns({
      endpointQuality: 0,
      sampleSizeAdequacy: 90,
      multiplicityControl: 90,
      missingDataHandling: 90,
      statisticalMethodChoice: 90,
      designAppropriateness: 90,
      // estimandClarity: the model did not answer for this dimension.
    });

    const report = await statisticalDefensibilityService.assessDefensibility(request());

    expect(report.dimensionScores.estimandClarity).toBeNull();
    expect(report.dimensionScores.endpointQuality).toBe(0);
    expect(Object.values(report.dimensionScores)).not.toContain(50);

    // Nothing computed a seven-dimension score, so none is reported.
    expect(report.overallScore).toBeNull();
    expect(report.overallRating).toBeNull();
    expect(report.scoreBasis.ran).toBe(false);
    if (report.scoreBasis.ran === false) {
      expect(report.scoreBasis.reason).toMatch(/estimandClarity/);
    }
  });

  it('rejects a non-numeric or out-of-range score instead of substituting one', async () => {
    modelReturns({
      endpointQuality: 'high' as unknown as number,
      sampleSizeAdequacy: 140,
      multiplicityControl: 90,
      missingDataHandling: 90,
      statisticalMethodChoice: 90,
      designAppropriateness: 90,
      estimandClarity: 90,
    });

    const report = await statisticalDefensibilityService.assessDefensibility(request());

    expect(report.dimensionScores.endpointQuality).toBeNull();
    expect(report.dimensionScores.sampleSizeAdequacy).toBeNull();
    expect(report.overallScore).toBeNull();
  });

  it('does not report a score or a rating when the model returned no content', async () => {
    chatMock.mockResolvedValue({ content: '' });

    const report = await statisticalDefensibilityService.assessDefensibility(request());

    // A model that answered nothing is not a study that scored 0/deficient.
    expect(report.overallScore).toBeNull();
    expect(report.overallRating).toBeNull();
    expect(report.scoreBasis.ran).toBe(false);
  });
});
