/**
 * EU MDR/IVDR technical-file delivery governance.
 *
 * POST /api/submissions/programs/:programId/technical-file/export must hand the
 * assembled ZIP bytes to the SAME governed-export consequence path eSTAR uses
 * (createGovernedExportConsequence when a PM-spine project anchors the program,
 * audited-unplaced delivery otherwise), and POST
 * /sequences/:seqId/technical-file/assemble must read the bundle bytes BEFORE
 * cleaning up the staging directory and deliver them the same way.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { createMockRequest, createMockResponse } from '../setup';

const ZIP_BYTES = Buffer.from('PK technical-file bytes for the governance test');
const ZIP_SHA = createHash('sha256').update(ZIP_BYTES).digest('hex');
const PROGRAM_UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

const {
  mockGovernedConsequence,
  mockLogAction,
  mockProgramRows,
  mockAnchor,
  mockFromProgram,
  mockFromCore,
  fakeDb,
} = vi.hoisted(() => {
  const mockProgramRows = vi.fn<[], unknown[]>(() => []);
  const fakeDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => mockProgramRows()) })),
      })),
    })),
  } as any;
  return {
    fakeDb,
    mockProgramRows,
    mockGovernedConsequence: vi.fn(async (input: any) => ({
      governed: true,
      source_type: input.sourceType,
      artifact_id: 'artifact_techfile_1',
      artifact_version: 1,
      artifact_status: 'draft',
      placement_state: 'placed',
      suggested_placement: input.suggestedPlacement ?? null,
      provenance_ref: 'prov_techfile_1',
      audit_ref: 'audit_techfile_1',
      delivered_artifact_sha256: createHash('sha256').update(input.binaryOutput).digest('hex'),
      downloadable_output_ref: {
        encoding: 'base64',
        mime_type: input.mimeType,
        filename: input.filename,
        data: input.binaryOutput.toString('base64'),
      },
    })),
    mockLogAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })),
    mockAnchor: vi.fn(async () => 4242 as number | null),
    mockFromProgram: vi.fn(async () => programResult()),
    mockFromCore: vi.fn(async () => ({}) as any),
  };
});

function programResult() {
  return {
    buffer: ZIP_BYTES,
    filename: 'PROG-2b6d4a80-technical-file-mdr.zip',
    sha256: ZIP_SHA,
    sizeBytes: ZIP_BYTES.length,
    fileCount: 4,
    materialized: 4,
    manifest: { regulation: 'mdr', ready: false, entries: [] },
    skipped: [],
    unresolvedLeaves: [],
    unfinalized: 1,
    unfinalizedSections: [{ sectionCode: 'II.6.1.g', status: 'drafted' }],
    ready: false,
  };
}

vi.mock('../../server/db', () => ({ db: fakeDb, pool: { query: vi.fn() }, getPool: () => ({ query: vi.fn() }) }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));
vi.mock('../../server/services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: mockAnchor,
}));
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
}));
// Keep the real audited-unplaced helper (it is what writes the EXPORT_GENERATED
// row we assert on); stub only the registry-backed consequence.
vi.mock('../../server/services/export/governedExportConsequence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createGovernedExportConsequence: mockGovernedConsequence,
}));
vi.mock('../../server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core', () => ({
  assembleTechnicalFileFromCore: mockFromCore,
  assembleTechnicalFileFromProgram: mockFromProgram,
}));

import submissionsRouter from '../../server/routes/submissions';

function getHandler(routePath: string) {
  const layer = (submissionsRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.post,
  );
  if (!layer) throw new Error(`Missing route POST ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return createMockRequest({
    params: { programId: PROGRAM_UUID },
    body: { regulation: 'mdr' },
    tenantContext: { organizationId: 2 },
    user: { id: 9, organizationId: 2 },
    ...overrides,
  } as any) as any;
}

function jsonBody(res: any) {
  return res.json.mock.calls[res.json.mock.calls.length - 1][0];
}

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('POST /programs/:programId/technical-file/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgramRows.mockReturnValue([{ id: PROGRAM_UUID, name: 'AcmeScope MDR', organizationId: 2 }]);
    mockAnchor.mockResolvedValue(4242);
    mockFromProgram.mockImplementation(async () => programResult());
  });

  it('(a) anchored program: hands the ZIP bytes to the governed export consequence', async () => {
    const req = makeReq();
    const res = createMockResponse() as any;
    await getHandler('/programs/:programId/technical-file/export')(req, res);

    expect(mockFromProgram).toHaveBeenCalledWith(
      expect.objectContaining({ programId: PROGRAM_UUID, organizationId: 2, userId: 9, regulation: 'mdr' }),
    );
    expect(mockGovernedConsequence).toHaveBeenCalledTimes(1);
    const input = mockGovernedConsequence.mock.calls[0][0] as any;
    expect(input.binaryOutput).toBe(ZIP_BYTES);
    expect(input.sourceType).toBe('export_zip');
    expect(input.mimeType).toBe('application/zip');
    expect(input.projectId).toBe(4242);
    expect(input.organizationId).toBe(2);
    expect(input.backendRoute).toMatch(/technical-file\/export/);

    expect(res.status).not.toHaveBeenCalledWith(expect.not.stringMatching(/^200$/));
    const body = jsonBody(res);
    expect(body.governed).toBe(true);
    expect(body.delivered_artifact_sha256).toBe(ZIP_SHA);
    expect(body.downloadable_output_ref.data).toBe(ZIP_BYTES.toString('base64'));
    expect(body.regulation).toBe('mdr');
    expect(body.fileCount).toBe(4);
    expect(body.unfinalized).toBe(1);
  });

  it('(b) unanchored program: audited-unplaced delivery with the sha256, bytes still returned', async () => {
    mockAnchor.mockResolvedValue(null);
    const req = makeReq();
    const res = createMockResponse() as any;
    await getHandler('/programs/:programId/technical-file/export')(req, res);

    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 2,
        userId: 9,
        action: 'EXPORT_GENERATED',
        details: expect.objectContaining({
          sourceType: 'export_zip',
          sha256: ZIP_SHA,
          artifactRegistry: 'unplaced_pending_document_identity_contract',
        }),
      }),
    );
    const body = jsonBody(res);
    expect(body.governed).toBe(false);
    expect(body.audited).toBe(true);
    expect(body.artifact_id).toBeNull();
    expect(body.sha256).toBe(ZIP_SHA);
    expect(body.downloadable_output_ref.data).toBe(ZIP_BYTES.toString('base64'));
  });

  it('(c) no authored content: 422 NO_AUTHORED_CONTENT, no consequence, no export audit', async () => {
    mockFromProgram.mockImplementation(async () => {
      const err = new Error('No authored mdr content for this program in this organization.') as Error & { code: string };
      err.code = 'NO_AUTHORED_CONTENT';
      throw err;
    });
    const req = makeReq();
    const res = createMockResponse() as any;
    await getHandler('/programs/:programId/technical-file/export')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(jsonBody(res)).toMatchObject({ error: { code: 'NO_AUTHORED_CONTENT' } });
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'EXPORT_GENERATED' }));
  });

  it('(d) program from another organization: 404 and the assembler is never invoked', async () => {
    mockProgramRows.mockReturnValue([]);
    const req = makeReq();
    const res = createMockResponse() as any;
    await getHandler('/programs/:programId/technical-file/export')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFromProgram).not.toHaveBeenCalled();
    expect(mockGovernedConsequence).not.toHaveBeenCalled();
  });

  it('(e) size cap: the consequence refusing the bytes is an honest 413, never a 200 with empty data', async () => {
    mockGovernedConsequence.mockRejectedValueOnce(
      new Error('INVALID_GOVERNED_EXPORT_INPUT: binaryOutput exceeds max size (26214400 bytes)'),
    );
    const req = makeReq();
    const res = createMockResponse() as any;
    await getHandler('/programs/:programId/technical-file/export')(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    const body = jsonBody(res);
    expect(body.error?.code).toBe('EXPORT_TOO_LARGE');
    expect(body.downloadable_output_ref).toBeUndefined();
  });
});

describe('POST /sequences/:seqId/technical-file/assemble', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(f) reads the bundle bytes before cleanup and delivers them through the export path', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'techfile-route-'));
    tmpDirs.push(dir);
    const zipPath = path.join(dir, 'SEQ-7-technical-file-mdr.zip');
    await fs.writeFile(zipPath, ZIP_BYTES);
    // cleanup deletes the file: if the route reads AFTER cleanup, it cannot
    // possibly return these bytes.
    const cleanup = vi.fn(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });
    mockFromCore.mockResolvedValueOnce({
      bundle: { path: zipPath, sha256: ZIP_SHA, sizeBytes: ZIP_BYTES.length, fileCount: 2, skippedCount: 0, displayName: 'x' },
      cleanup,
      skipped: [],
      materialized: 2,
      unresolvedLeaves: [],
      ready: true,
    });

    const req = makeReq({ params: { seqId: '7' }, body: { regulation: 'mdr' } });
    const res = createMockResponse() as any;
    await getHandler('/sequences/:seqId/technical-file/assemble')(req, res);

    expect(cleanup).toHaveBeenCalledTimes(1);
    const body = jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.sha256).toBe(ZIP_SHA);
    expect(body.downloadable_output_ref?.data).toBe(ZIP_BYTES.toString('base64'));
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT_GENERATED', details: expect.objectContaining({ sha256: ZIP_SHA }) }),
    );
  });
});
