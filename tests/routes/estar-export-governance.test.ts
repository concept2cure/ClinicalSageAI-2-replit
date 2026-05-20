import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockRender510k, mockGovernedConsequence } = vi.hoisted(() => ({
  mockRender510k: vi.fn(async () => ({
    coverLetter: Buffer.from('cover'),
    summary: Buffer.from('summary'),
    deviceDescription: Buffer.from('device'),
    seDiscussion: Buffer.from('se'),
    performanceTesting: Buffer.from('perf'),
    labeling: Buffer.from('label'),
  })),
  mockGovernedConsequence: vi.fn(async () => ({
    governed: true,
    source_type: 'export_estar_zip',
    artifact_id: 'artifact_estar_1',
    artifact_version: 1,
    artifact_status: 'draft',
    placement_state: 'placed',
    suggested_placement: 'Module 1 / 510(k) eSTAR package',
    provenance_ref: 'prov_estar_1',
    audit_ref: 'audit_estar_1',
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: 'application/zip',
      filename: 'k123_eSTAR.zip',
      data: Buffer.from('zip-data').toString('base64'),
    },
  })),
}));

vi.mock('../../server/export/renderers', () => ({
  renderPdfBuffersFor510k: mockRender510k,
}));

vi.mock('../../server/export/stylePacks/config', () => ({
  stylePacks: {
    '510k_v1': {},
  },
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/services/export/governedExportConsequence', () => ({
  createGovernedExportConsequence: mockGovernedConsequence,
}));

import estarRoutes from '../../server/routes/510k-estar-routes';

function getHandler(path: string) {
  const layer = estarRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  if (!layer) throw new Error(`Missing route POST ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function body() {
  return {
    meta: {
      id: 'k123',
      projectId: 33,
      title: 'Test eSTAR Export',
      ctdSection: 'm1.5',
    },
    content: { sections: [] },
    attachments: [],
  };
}

describe('510(k) eSTAR governed export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates governed bundle consequence with durable references', async () => {
    const req = createMockRequest({ body: body() }) as any;
    req.userRole = 'editor';
    req.userId = 9;
    // requireEditorAccess middleware (which would normally set this) is
    // bypassed because the test grabs only the final handler. Set the
    // resolved id directly so getOrganizationId(req) doesn't throw.
    req.resolvedOrganizationId = 2;
    req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);

    const res = createMockResponse() as any;

    const handler = getHandler('/build');
    await handler(req, res);

    expect(mockRender510k).toHaveBeenCalledTimes(1);
    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        governed: true,
        source_type: 'export_estar_zip',
        artifact_id: 'artifact_estar_1',
        placement_state: 'placed',
        provenance_ref: 'prov_estar_1',
        audit_ref: 'audit_estar_1',
        downloadable_output_ref: expect.objectContaining({
          encoding: 'base64',
          mime_type: 'application/zip',
          filename: 'k123_eSTAR.zip',
        }),
      })
    );
  });

  it('fails closed when governed persistence fails', async () => {
    mockGovernedConsequence.mockRejectedValueOnce(new Error('persistence failed'));

    const req = createMockRequest({ body: body() }) as any;
    req.userRole = 'editor';
    req.userId = 9;
    req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);

    const res = createMockResponse() as any;

    const handler = getHandler('/build');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'GOVERNED_EXPORT_FAILED',
      })
    );
    expect(res.end).not.toHaveBeenCalled();
  });
});
