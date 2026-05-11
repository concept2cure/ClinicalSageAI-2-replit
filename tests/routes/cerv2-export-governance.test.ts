import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockPdf, mockDocx } = vi.hoisted(() => ({
  mockPdf: vi.fn(async () => Buffer.from('pdf')),
  mockDocx: vi.fn(async () => Buffer.from('docx')),
}));

const { mockGovernedConsequence } = vi.hoisted(() => ({
  mockGovernedConsequence: vi.fn(async (input: any) => ({
    governed: true,
    source_type: input.sourceType,
    artifact_id: 'artifact_123',
    artifact_version: 1,
    artifact_status: 'draft',
    placement_state: 'placed',
    suggested_placement: 'Module 1',
    provenance_ref: 'prov_123',
    audit_ref: 'audit_123',
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: input.mimeType,
      filename: input.filename,
      data: input.binaryOutput.toString('base64'),
    },
  })),
}));

vi.mock('../../server/export/renderers', () => ({
  renderPdfBuffersFor510k: vi.fn(async () => ({
    coverLetter: Buffer.from('cover'),
    summary: Buffer.from('summary'),
    deviceDescription: Buffer.from('device'),
    seDiscussion: Buffer.from('se'),
    performanceTesting: Buffer.from('perf'),
    labeling: Buffer.from('label'),
  })),
  renderPdfBuffersForPma: vi.fn(async () => ({
    summaryInfo: Buffer.from('summaryInfo'),
    nonclinical: Buffer.from('nonclinical'),
    clinical: Buffer.from('clinical'),
    manufacturing: Buffer.from('manufacturing'),
    labeling: Buffer.from('labeling'),
    riskBenefit: Buffer.from('risk'),
    postApproval: Buffer.from('post'),
  })),
  renderPdfBuffersForCer: vi.fn(async () => ({
    stateOfArt: Buffer.from('soa'),
    devicePurpose: Buffer.from('purpose'),
    clinicalDataSet: Buffer.from('dataset'),
    appraisal: Buffer.from('appraisal'),
    benefitRisk: Buffer.from('benefit'),
    gsprMapping: Buffer.from('gspr'),
    pmsPlan: Buffer.from('pms'),
    conclusions: Buffer.from('conclusions'),
  })),
  renderCombinedPdf: mockPdf,
  renderCombinedDocx: mockDocx,
}));

vi.mock('../../server/export/stylePacks/config', () => ({
  stylePacks: {
    '510k_v1': {},
    pma_v1: {},
    cer_mdr_v1: {},
  },
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/services/mockVault', () => ({
  mockVault: {
    getMockEditorJson: vi.fn(() => ({ type: 'doc', content: [] })),
    list: vi.fn(() => []),
  },
}));

vi.mock('../../server/services/export/governedExportConsequence', () => ({
  createGovernedExportConsequence: mockGovernedConsequence,
}));

import cerv2ExportRoutes from '../../server/routes/cerv2-export-routes';

function getHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = cerv2ExportRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function baseBody() {
  return {
    docType: 'cerv2_510k',
    projectId: 101,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello export' }] }],
    },
    meta: { title: 'Test Export' },
  };
}

describe('CERV2 export governance gate', () => {
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

  it('returns 403 when strict mode is enabled and governance approval is missing', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({ body: baseBody() }) as any;
    req.userRole = 'editor';
    req.userId = 44;
    req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
    const res = createMockResponse();

    const handler = getHandler('/pdf');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'HUMAN_REVIEW_REQUIRED' }));
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it('adds governance headers and exports in non-strict mode', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({ body: baseBody() }) as any;
    req.userRole = 'editor';
    // getUserId(req) is called inside the handler before createGovernedExportConsequence
    // and throws when userId is missing/non-numeric — that throw is caught by the
    // route's try/catch and returns 500 silently, which is why earlier this test
    // saw the consequence spy "called 0 times". Sister tests (165, 199, 217) all
    // set this; 140 was missed when the userId enforcement landed.
    req.userId = 46;
    req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
    const res = createMockResponse();

    const handler = getHandler('/docx');
    await handler(req, res);

    expect(mockDocx).toHaveBeenCalledTimes(1);
    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-AI-Generated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Required', 'true');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      governed: true,
      source_type: 'export_docx',
      artifact_id: 'artifact_123',
      provenance_ref: 'prov_123',
      audit_ref: 'audit_123',
    }));
  });

  it('allows strict mode export when governance approval exists and includes reviewer headers', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      body: {
        ...baseBody(),
        governance: {
          aiGenerated: true,
          humanReviewApproved: true,
          reviewerName: 'QA Reviewer',
          reviewTimestamp: '2026-03-24T12:00:00.000Z',
        },
      },
    }) as any;
    req.userRole = 'editor';
    req.userId = 45;
    req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
    const res = createMockResponse();

    const handler = getHandler('/pdf');
    await handler(req, res);

    expect(mockPdf).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Reviewer', 'QA%20Reviewer');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Timestamp', '2026-03-24T12:00:00.000Z');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      governed: true,
      source_type: 'export_pdf',
      downloadable_output_ref: expect.objectContaining({
        encoding: 'base64',
      }),
    }));
  });

  it('fails closed when governed persistence fails and does not stream a download', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    mockGovernedConsequence.mockRejectedValueOnce(new Error('db writeback failed'));

    const req = createMockRequest({ body: baseBody() }) as any;
    req.userRole = 'editor';
    req.userId = 55;
    req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
    const res = createMockResponse();

    const handler = getHandler('/pdf');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'GOVERNED_EXPORT_FAILED' }));
    expect(res.send).not.toHaveBeenCalled();
  });

  it('returns governed consequence for ZIP export (no direct attachment streaming)', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({
      body: {
        ...baseBody(),
        attachments: [{ filename: 'table.csv', buffer: Buffer.from('a,b').toString('base64') }],
      },
    }) as any;
    req.userRole = 'editor';
    req.userId = 56;
    req.header = (name: string) => (name === 'x-organization-id' ? '1' : undefined);
    const res = createMockResponse();

    const handler = getHandler('/zip');
    await handler(req, res);

    expect(mockGovernedConsequence).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'export_zip',
        backendRoute: 'POST /api/cerv2/export/zip',
        mimeType: 'application/zip',
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        governed: true,
        source_type: 'export_zip',
        provenance_ref: 'prov_123',
        audit_ref: 'audit_123',
        downloadable_output_ref: expect.objectContaining({
          encoding: 'base64',
          mime_type: 'application/zip',
        }),
      })
    );
    expect(res.send).not.toHaveBeenCalled();
  });
});
