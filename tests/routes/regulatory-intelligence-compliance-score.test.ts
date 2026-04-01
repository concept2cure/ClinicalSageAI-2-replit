import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const mockGetRegulatoryIntelligence = vi.fn();
const mockComputeReadinessScore = vi.fn();

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (req: any, _res: any, next: any) => {
    req.tenantId = req.tenantId ?? 42;
    next();
  },
}));

vi.mock('../../server/services/regulatory-intelligence-service', () => ({
  RegulatoryIntelligenceService: class {
    async initialize() {
      return;
    }

    async getRegulatoryIntelligence(...args: any[]) {
      return mockGetRegulatoryIntelligence(...args);
    }
  },
}));

vi.mock('../../server/services/intelligence/readiness-scoring-engine.js', () => ({
  computeReadinessScore: (...args: any[]) => mockComputeReadinessScore(...args),
}));

import router from '../../server/routes/regulatory-intelligence-api';

function getComplianceScoreHandler() {
  const layer = router.stack.find((l: any) => l.route?.path === '/compliance-score' && l.route?.methods?.get);
  if (!layer) throw new Error('Missing GET /compliance-score route');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('GET /api/regulatory-intelligence/compliance-score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRegulatoryIntelligence.mockResolvedValue({
      key_requirements: [
        { compliance_level: 'mandatory', guideline: 'ICH E6', requirement: 'GCP controls' },
        { compliance_level: 'recommended', guideline: 'FDA Guidance', requirement: 'Narrative quality' },
      ],
      relevant_guidance: [{ id: 'g1' }, { id: 'g2' }],
    });
    mockComputeReadinessScore.mockResolvedValue({
      overallScore: 78,
      dimensions: {
        completeness: 80,
        quality: 77,
        consistency: 75,
        compliance: 76,
      },
      moduleBreakdown: [],
      gaps: [
        { module: 'Module 2', severity: 'critical', description: 'Gap A', remediation: 'Fix A' },
        { module: 'Module 3', severity: 'medium', description: 'Gap B', remediation: 'Fix B' },
      ],
      trend: { direction: 'improving', delta: 4, dataPoints: 5 },
      predictions: { approvalProbability: 68, estimatedReviewDays: 95, estimatedDeficiencies: 3 },
      scoredAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('returns 400 when projectId is missing', async () => {
    const req = createMockRequest({ query: {} }) as any;
    req.tenantId = 42;
    const res = createMockResponse();

    const handler = getComplianceScoreHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns computed score from readiness + intelligence context', async () => {
    const req = createMockRequest({ query: { projectId: '101', phase: 'Phase 2', submissionType: 'IND' } }) as any;
    req.tenantId = 42;
    const res = createMockResponse();

    const handler = getComplianceScoreHandler();
    await handler(req, res);

    expect(mockComputeReadinessScore).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 42, projectId: 101, submissionType: 'IND' }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          overallScore: 78,
          breakdown: expect.objectContaining({
            documentationCompleteness: 80,
            regulatoryReadiness: 76,
            submissionPreparedness: 78,
          }),
          readiness: expect.objectContaining({
            criticalGapCount: 1,
          }),
        }),
      }),
    );
  });
});
