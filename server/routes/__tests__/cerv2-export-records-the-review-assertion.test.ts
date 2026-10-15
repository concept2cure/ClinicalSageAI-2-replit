/**
 * A CER v2 document export records the review assertion that let it through.
 *
 * Until 2026-10-15 POST /api/cerv2/export/{pdf,docx,zip} stamped
 * `X-Concept2Cure-Human-Review-Approved: true` with a reviewer name and time
 * taken verbatim from the request body, and the governed export record's
 * metadata carried none of it (docType, format, programId only). The metadata
 * now carries `reviewAttestation`: the caller's assertion, as an assertion,
 * with the authenticated user who made it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../../../tests/setup';

const { mockPdf, mockGovernedConsequence } = vi.hoisted(() => ({
  mockPdf: vi.fn(async () => Buffer.from('pdf')),
  mockGovernedConsequence: vi.fn(async (input: any) => ({ governed: true, source_type: input.sourceType })),
}));

const fakeDb = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 101 }] }) }) }),
}));
vi.mock('../../db/requestDb', () => ({ requestDb: () => fakeDb }));
vi.mock('../../export/renderers', () => ({
  renderPdfBuffersFor510k: vi.fn(),
  renderPdfBuffersForPma: vi.fn(),
  renderPdfBuffersForCer: vi.fn(),
  renderCombinedPdf: mockPdf,
  renderCombinedDocx: vi.fn(),
}));
vi.mock('../../export/stylePacks/config', () => ({ stylePacks: { '510k_v1': {}, pma_v1: {}, cer_mdr_v1: {} } }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: any, _res: any, next: any) => next() }));
vi.mock('../../services/export/governedExportConsequence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createGovernedExportConsequence: mockGovernedConsequence,
}));

import cerv2ExportRoutes from '../cerv2-export-routes';

function handler(path: string) {
  const layer = (cerv2ExportRoutes as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ASSERTED = {
  aiGenerated: true,
  humanReviewApproved: true,
  reviewerName: 'QA Reviewer',
  reviewerRole: 'Regulatory QA Reviewer',
  reviewTimestamp: '2026-03-24T12:00:00.000Z',
};

function exportRequest(governance?: unknown) {
  const req = createMockRequest({
    body: {
      docType: 'cerv2_510k',
      projectId: 101,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello export' }] }] },
      meta: { title: 'Test Export' },
      ...(governance ? { governance } : {}),
    },
  }) as any;
  req.userRole = 'editor';
  req.userId = 45;
  req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
  return req;
}

const savedGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';
});
afterEach(() => {
  if (savedGate === undefined) delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  else process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = savedGate;
});

describe('POST /api/cerv2/export/pdf — the review assertion is recorded as one', () => {
  it('the governed export record carries the assertion and the user who made it', async () => {
    const res = createMockResponse();
    await handler('/pdf')(exportRequest(ASSERTED), res);
    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
    const input = mockGovernedConsequence.mock.calls[0][0] as { userId: number; metadata: Record<string, unknown> };
    expect(input.userId).toBe(45);
    expect(input.metadata.reviewAttestation, 'the review attestation was not recorded').toEqual({
      authorization: 'caller-asserted-review',
      assertedByUserId: 45,
      aiGenerated: true,
      reviewerName: 'QA Reviewer',
      reviewerRole: 'Regulatory QA Reviewer',
      reviewTimestamp: '2026-03-24T12:00:00.000Z',
    });
  });

  it('the response names the approval as caller-asserted, not as an approved review', async () => {
    const res = createMockResponse();
    await handler('/pdf')(exportRequest(ASSERTED), res);
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', expect.anything());
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Export-Authorization', 'caller-asserted-review');
  });
});
