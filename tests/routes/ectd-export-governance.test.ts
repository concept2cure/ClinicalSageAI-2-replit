import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockGenerate, mockValidate, mockGovernance } = vi.hoisted(() => ({
  mockGenerate: vi.fn(async () => ({
    buffer: Buffer.from('zip-bytes'),
    filename: 'submission.zip',
    stats: {
      totalModules: 5,
      totalFiles: 10,
      totalGranules: 7,
      generatedAt: '2026-03-25T00:00:00.000Z',
    },
  })),
  mockValidate: vi.fn(async () => ({ valid: true, errors: [] })),
  // The handler also calls registerExportGovernanceQuick before res.send;
  // it returns falsy when the real DB writeback fails, which then short-
  // circuits to 500. Tests need a passing mock so res.send actually
  // runs. Returning a truthy artifact id is sufficient (the handler
  // checks for falsy only).
  mockGovernance: vi.fn(async () => ({ artifactId: 'art_123' })),
}));

vi.mock('../../server/services/ectdExportService', () => ({
  generateEctdPackage: mockGenerate,
  validateEctdPackage: mockValidate,
}));

vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: mockGovernance,
}));

import ectdExportRoutes from '../../server/routes/ectd-export';

function getHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = ectdExportRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('eCTD export governance gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalGate === undefined) {
      delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
    } else {
      process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = originalGate;
    }
  });

  it('blocks export in strict mode without human approval', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: {},
    }) as any;
    req.organizationId = 1;
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'HUMAN_REVIEW_REQUIRED' }));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('allows export when strict mode disabled and sets governance headers', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: { region: 'FDA', submissionType: 'initial' },
    }) as any;
    // The route reads tenant + user from the JWT principal, not from
    // req.organizationId. Set both so the governance writeback can attribute
    // the export to a real user before res.send runs.
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-AI-Generated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Required', 'true');
    expect(res.send).toHaveBeenCalled();
  });

  it('allows strict mode with approved governance evidence', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: {
        governance: {
          aiGenerated: true,
          humanReviewApproved: true,
          reviewerName: 'Reg QA',
          reviewTimestamp: '2026-03-25T00:00:00.000Z',
        },
      },
    }) as any;
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Reviewer', 'Reg%20QA');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Timestamp', '2026-03-25T00:00:00.000Z');
    expect(res.send).toHaveBeenCalled();
  });
});
