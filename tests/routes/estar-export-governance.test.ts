import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockRender510k,
  mockGovernedConsequence,
  mockResolveRows,
  mockLogAction,
  mockLoadAuthoredSections,
} = vi.hoisted(() => ({
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
  /** Rows the project-anchor resolution query returns (one query per request). */
  mockResolveRows: vi.fn<[], unknown[]>(() => []),
  mockLogAction: vi.fn(async () => undefined),
  mockLoadAuthoredSections: vi.fn(async () => [] as Array<{ title: string; content: string }>),
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

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => mockResolveRows()) })),
      })),
    })),
  },
}));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
}));

vi.mock('../../server/services/pathway-engines/estar/estar-content-leaves', () => ({
  loadDeviceContentLeaves: vi.fn(async () => []),
  loadAuthoredDeviceSections: mockLoadAuthoredSections,
  sectionsToEditorJson: (sections: Array<{ title: string; content: string }>) => ({
    type: 'doc',
    content: sections.flatMap((s) => [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: s.title }] },
      { type: 'paragraph', content: [{ type: 'text', text: s.content }] },
    ]),
  }),
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

function makeReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest({ body: body(), ...overrides }) as any;
  req.userRole = 'editor';
  req.userId = 9;
  // requireEditorAccess middleware (which would normally set this) is
  // bypassed because the test grabs only the final handler. Set the
  // resolved id directly so getOrganizationId(req) doesn't throw.
  req.resolvedOrganizationId = 2;
  req.header = (name: string) => (name === 'x-organization-id' ? '2' : undefined);
  return req;
}

const PROGRAM_UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

describe('510(k) eSTAR governed export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: numeric project 33 resolves in-org (GA path).
    mockResolveRows.mockReturnValue([{ id: 33, deviceName: 'Test Device' }]);
  });

  it('creates governed bundle consequence with durable references', async () => {
    const req = makeReq();
    const res = createMockResponse() as any;

    const handler = getHandler('/build');
    await handler(req, res);

    expect(mockRender510k).toHaveBeenCalledTimes(1);
    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);

    // Truthfulness invariant (B0): the loose section-PDF ZIP must NOT be
    // labelled as a submittable official eSTAR. The route records
    // officialEstarPdf:false and a draft placement so no downstream surface
    // presents it as the official FDA eSTAR PDF that CDRH ingests.
    expect(mockGovernedConsequence).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 33,
        suggestedPlacement: 'Module 1 / 510(k) content package (draft)',
        metadata: expect.objectContaining({ officialEstarPdf: false }),
      })
    );

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

  it('404s when the project does not resolve in the caller org', async () => {
    mockResolveRows.mockReturnValue([]);

    const req = makeReq();
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });

  it('delivers an audited (registry-unplaced) export for a program-spine UUID project', async () => {
    mockResolveRows.mockReturnValue([{ id: PROGRAM_UUID, name: 'BX-204 CGM' }]);

    const req = makeReq({
      body: {
        meta: { id: 'BX-204', ident: PROGRAM_UUID, title: 'BX-204 draft package' },
        content: { sections: [] },
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    // No PM-spine anchor exists for the program spine, so the artifact
    // registry cannot place it — the export must still be delivered AND
    // audit-logged, and must say plainly that it is not registry-placed.
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 2,
        action: 'EXPORT_GENERATED',
        resourceType: 'estar_content_package',
        resourceId: PROGRAM_UUID,
        details: expect.objectContaining({
          sourceType: 'export_estar_zip',
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          artifactRegistry: 'unplaced_pending_document_identity_contract',
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        governed: false,
        audited: true,
        artifact_id: null,
        program_id: PROGRAM_UUID,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        downloadable_output_ref: expect.objectContaining({
          encoding: 'base64',
          mime_type: 'application/zip',
        }),
      })
    );
  });

  it('assembles content server-side from authored sections with useProjectContent', async () => {
    mockLoadAuthoredSections.mockResolvedValueOnce([
      { title: 'Device Description', content: 'A continuous glucose monitor.' },
    ]);

    const req = makeReq({
      body: {
        meta: { id: 'k123', projectId: 33, title: 'Test eSTAR Export' },
        useProjectContent: true,
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(mockLoadAuthoredSections).toHaveBeenCalledWith(2, { documentId: undefined });
    expect(mockRender510k).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'doc' }),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('422s honestly when useProjectContent finds no authored sections', async () => {
    mockLoadAuthoredSections.mockResolvedValueOnce([]);

    const req = makeReq({
      body: {
        meta: { id: 'k123', projectId: 33 },
        useProjectContent: true,
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NO_AUTHORED_CONTENT' })
    );
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });

  it('fails closed when governed persistence fails', async () => {
    mockGovernedConsequence.mockRejectedValueOnce(new Error('persistence failed'));

    const req = makeReq();
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
