import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockRender510k,
  mockGovernedConsequence,
  mockResolveRows,
  mockLogAction,
  mockLoadAuthoredSections,
  mockLoadContentLeaves,
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
      filename: 'k123_content-package-draft.zip',
      data: Buffer.from('zip-data').toString('base64'),
    },
  })),
  /** Rows the project-anchor resolution query returns (one query per request). */
  mockResolveRows: vi.fn<[], unknown[]>(() => []),
  mockLogAction: vi.fn(async () => undefined),
  mockLoadAuthoredSections: vi.fn(async () => [] as Array<{ title: string; content: string }>),
  mockLoadContentLeaves: vi.fn(
    async () => [] as Array<{ sectionCode: string; title: string; documentType?: string }>,
  ),
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

// Stub only the registry-backed consequence; the audited-unplaced helper is
// the real one (it writes the EXPORT_GENERATED row these tests observe).
vi.mock('../../server/services/export/governedExportConsequence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createGovernedExportConsequence: mockGovernedConsequence,
}));

// The route resolves its project anchor through `requestDb(req)` — the
// request-scoped drizzle client — not the shared pool, so `server/db` alone no
// longer intercepts. Same fake, returned from both.
const { fakeDb } = vi.hoisted(() => ({ fakeDb: { select: vi.fn() } as any }));
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
}));

vi.mock('../../server/services/pathway-engines/estar/estar-content-leaves', () => ({
  loadDeviceContentLeaves: mockLoadContentLeaves,
  loadAuthoredDeviceSections: mockLoadAuthoredSections,
  // The scope resolver is data-driven in production (governed content present?);
  // here a programId is taken as governed so the routing of the scope is what
  // the tests observe.
  resolveDeviceContentScope: async (_org: number, o: { programId?: string; documentId?: number }) =>
    o.programId
      ? { scope: { programId: o.programId }, source: 'governed_program' }
      : { scope: { documentId: o.documentId }, source: o.documentId !== undefined ? 'legacy_document' : 'legacy_org_wide' },
  sectionsToEditorJson: (sections: Array<{ title: string; content: string }>) => ({
    type: 'doc',
    content: sections.flatMap((s) => [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: s.title }] },
      { type: 'paragraph', content: [{ type: 'text', text: s.content }] },
    ]),
  }),
}));

fakeDb.select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(async () => mockResolveRows()) })),
  })),
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
    // presents it as the official FDA eSTAR PDF that CDRH ingests — and the
    // package label and file name say what it is (ESTAR-06): an eSTAR is an
    // FDA-issued dynamic PDF, and no template is vendored, so nothing this
    // route emits may carry that name.
    expect(mockGovernedConsequence).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 33,
        suggestedPlacement: 'Module 1 / 510(k) content package (draft)',
        filename: 'k123_content-package-draft.zip',
        metadata: expect.objectContaining({
          officialEstarPdf: false,
          package: 'content package draft (not an eSTAR)',
        }),
      })
    );
    const consequenceArg = mockGovernedConsequence.mock.calls[0][0] as { filename: string };
    expect(consequenceArg.filename).not.toMatch(/eSTAR/);

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
          filename: 'k123_content-package-draft.zip',
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

  it('answers 500 PROJECT_RESOLUTION_FAILED — never 404 — when the anchor READ fails', async () => {
    // query_canceled: a real database failure. "The lookup broke" and "no such
    // project in your organization" are different facts; the first used to be
    // swallowed into the second.
    mockResolveRows.mockImplementationOnce(() => {
      throw Object.assign(new Error('boom: canceling statement due to statement timeout'), { code: '57014' });
    });

    const req = makeReq();
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      error: 'PROJECT_RESOLUTION_FAILED',
      message: 'Could not resolve the project for this export. The problem has been logged.',
    });
    // The failure text never reaches the body.
    expect(JSON.stringify(payload)).not.toMatch(/boom|statement timeout|57014/);
    expect(mockRender510k).not.toHaveBeenCalled();
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('still 404s on schema absence (42P01): a database without the table has no row to find', async () => {
    mockResolveRows.mockImplementationOnce(() => {
      throw Object.assign(new Error('relation "fda_510k_projects" does not exist'), { code: '42P01' });
    });

    const req = makeReq();
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Project not found in your organization' });
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
          filename: 'BX-204_content-package-draft.zip',
          package: 'content package draft (not an eSTAR)',
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
          filename: 'BX-204_content-package-draft.zip',
        }),
      })
    );
  });

  it('places the export in the registry when the program HAS a C1 project anchor', async () => {
    // Document Identity Contract slice C1 gives a uuid program a numeric
    // `projects` row via `projects.regulatory_program_id`. Two queries now run
    // for a program ident: the program lookup, then the anchor lookup.
    mockResolveRows
      .mockReturnValueOnce([{ id: PROGRAM_UUID, name: 'BX-204 CGM' }])
      .mockReturnValueOnce([{ id: 4242 }]);

    const req = makeReq({
      body: {
        meta: { id: 'BX-204', ident: PROGRAM_UUID, title: 'BX-204 draft package' },
        content: { sections: [] },
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    // The anchor exists, so this is a GOVERNED export placed against the
    // anchored project — not the audited-unplaced degradation. Before C1 was
    // wired in, a uuid program could never reach this branch.
    expect(mockGovernedConsequence).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 4242, organizationId: 2 })
    );
    // And it must NOT also file the "not registry-placed" audit claim.
    expect(mockLogAction).not.toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          artifactRegistry: 'unplaced_pending_document_identity_contract',
        }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ governed: true, artifact_id: 'artifact_estar_1' })
    );
  });

  it('keeps the unplaced path when the program resolves but has NO anchor', async () => {
    // The distinction that matters: a program with no anchored project row is
    // a fact about the data (created before C1, or intake skipped it for a
    // stated reason), NOT a failure to try. It must degrade exactly as before.
    mockResolveRows
      .mockReturnValueOnce([{ id: PROGRAM_UUID, name: 'BX-204 CGM' }])
      .mockReturnValueOnce([]);

    const req = makeReq({
      body: {
        meta: { id: 'BX-204', ident: PROGRAM_UUID, title: 'BX-204 draft package' },
        content: { sections: [] },
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ governed: false, audited: true, artifact_id: null })
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

  it("a program anchor reads ITS governed document, not the org-wide legacy store (ESTAR-01/02)", async () => {
    mockResolveRows.mockReturnValue([{ id: PROGRAM_UUID, name: 'BX-204 CGM' }]);
    mockLoadAuthoredSections.mockResolvedValueOnce([
      { title: 'Device Description', content: 'A continuous glucose monitor.' },
    ]);

    const req = makeReq({
      body: {
        meta: { id: 'BX-204', ident: PROGRAM_UUID, title: 'BX-204 draft package' },
        useProjectContent: true,
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(mockLoadAuthoredSections).toHaveBeenCalledWith(2, { programId: PROGRAM_UUID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a program anchor with nothing authored in its governed document 422s and names the store', async () => {
    mockResolveRows.mockReturnValue([{ id: PROGRAM_UUID, name: 'BX-204 CGM' }]);
    mockLoadAuthoredSections.mockResolvedValueOnce([]);

    const req = makeReq({
      body: {
        meta: { id: 'BX-204', ident: PROGRAM_UUID, title: 'BX-204 draft package' },
        useProjectContent: true,
      },
    });
    const res = createMockResponse() as any;

    await getHandler('/build')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NO_AUTHORED_CONTENT', deviceContentSource: 'governed_program' }),
    );
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

describe('POST /api/510k/estar/assemble — the device-assembly contract over HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports artifactKind none with blockers when nothing is authored', async () => {
    mockLoadContentLeaves.mockResolvedValueOnce([]);

    const req = makeReq({ body: { pathway: '510k', variant: 'device' } });
    const res = createMockResponse() as any;

    await getHandler('/assemble')(req, res);

    expect(mockLoadContentLeaves).toHaveBeenCalledWith(2, { documentId: undefined });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.artifactKind).toBe('none');
    expect(payload.canProduceOfficialEstar).toBe(false);
    expect(payload.validationReport.errors.length).toBeGreaterThan(0);
    expect(payload.validationReport.errors).toEqual(payload.blockers);
  });

  it('reports a draft-only artifact for authored content with no vendored template', async () => {
    mockLoadContentLeaves.mockResolvedValueOnce([
      { sectionCode: '3', title: 'Device Description', documentType: 'device_description' },
    ]);

    const req = makeReq({ body: { pathway: '510k', variant: 'device' } });
    const res = createMockResponse() as any;

    await getHandler('/assemble')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    // Content exists but the official FDA template is not vendored — only the
    // non-submittable draft package is honestly producible.
    expect(payload.artifactKind).toBe('content-package-draft');
    expect(payload.canProduceOfficialEstar).toBe(false);
    expect(payload.validationReport.sectionSummary).toBeDefined();
  });
});
