/**
 * chat upload → canonical source identity.
 *
 * Every uploaded file must resolve to ONE `cre_evidence_sources` row of type
 * `client_document`. That identity is what the Data Room, evidence links and
 * dossier relationships hang off; without it an upload exists only as a
 * `file_uploads` row, a governed artifact and an embedding atom, none of which
 * can answer "which dossier sections use this file".
 *
 * Drives the REAL `POST /api/chat/upload` handler. The DB pool, embedding
 * service and evidence spine are stubbed; extraction is real.
 *
 * Companion to the PGlite integration test, which proves the spine's own
 * checksum/identity behaviour against real Postgres. This one proves the ROUTE
 * calls it correctly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const {
  mockResolveGovernedContext,
  mockPoolQuery,
  mockGetEmbeddingService,
  mockCreateSource,
  mockFindSourceByChecksum,
  mockFindSupersededCandidate,
  mockCreateSupersedingSource,
} = vi.hoisted(() => ({
  mockResolveGovernedContext: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockGetEmbeddingService: vi.fn(),
  mockCreateSource: vi.fn(),
  mockFindSourceByChecksum: vi.fn(),
  mockFindSupersededCandidate: vi.fn(),
  mockCreateSupersedingSource: vi.fn(),
}));

vi.mock('../../server/services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));
vi.mock('../../server/db.js', () => {
  const poolStub = { query: mockPoolQuery };
  return { pool: poolStub, getPool: () => poolStub };
});
vi.mock('../../server/db.ts', () => {
  const poolStub = { query: mockPoolQuery };
  return { pool: poolStub, getPool: () => poolStub };
});
vi.mock('../../server/services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: mockGetEmbeddingService,
}));
vi.mock('../../server/services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  createSource: mockCreateSource,
  findSourceByChecksum: mockFindSourceByChecksum,
  // The upload handler resolves whether this document supersedes an earlier
  // source before it creates identity; a mocked ESM module THROWS on a missing
  // export, so both must be present even when no predecessor is found.
  findSupersededCandidate: mockFindSupersededCandidate,
  createSupersedingSource: mockCreateSupersedingSource,
}));

// The chat router pulls a large graph; stub what the upload path never reaches.
vi.mock('../../server/services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(),
  getThreadMessages: vi.fn(),
  saveChatMessage: vi.fn(),
}));
vi.mock('../../server/services/ai-gateway/index.js', () => ({ getGateway: vi.fn(() => ({})) }));
vi.mock('../../server/services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: vi.fn().mockResolvedValue(''),
}));
vi.mock('../../server/services/ana-guidance-executor.js', () => ({
  processResponseActions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../server/services/kernel-decision-record.js', () => ({
  logKernelDecision: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../server/services/kernel-router.js', () => ({
  planKernelExecution: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../server/services/kernel-adaptive-policy.js', () => ({
  getKernelPolicyHint: vi.fn().mockResolvedValue(null),
  recordKernelPolicyOutcome: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../server/services/intelligence/rim-interceptors.js', () => ({
  interceptChatResponse: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../server/services/claude/ClaudeToolDefinitions.js', () => ({ ALL_CLAUDE_TOOLS: [] }));
vi.mock('../../server/services/claude/ClaudeToolExecutor.js', () => ({
  executeAgenticLoop: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../server/services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: vi.fn().mockResolvedValue(''),
}));

import chatRouter from '../../server/routes/chat';

function getPostHandler(routePath: string) {
  const layer = (chatRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.post,
  );
  if (!layer) throw new Error(`Missing route POST ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function runUpload(
  opts: {
    projectId?: string | null;
    tenantId?: number | null;
    content?: string;
    fileName?: string;
  } = {},
) {
  const {
    projectId = 'proj_12', tenantId = 5, content = 'enrollment data',
    fileName = 'protocol.txt',
  } = opts;
  const req = createMockRequest({ body: projectId ? { projectId } : {} }) as any;
  req.user = { id: 9 };
  if (tenantId != null) req.tenantId = tenantId;
  const buffer = Buffer.from(content, 'utf8');
  req.file = {
    originalname: fileName,
    mimetype: 'text/plain',
    buffer,
    size: buffer.length,
  };
  const res = createMockResponse();
  await getPostHandler('/upload')(req, res);
  return res;
}

/** The payload passed to res.json(). */
function payload(res: any) {
  return res.json.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [] });
  mockGetEmbeddingService.mockReturnValue({ embedAtom: vi.fn().mockResolvedValue(undefined) });
  mockResolveGovernedContext.mockReturnValue({
    validation: { valid: true, errors: [], warnings: [] },
    resolved: {},
    contract: {
      clientTrack: 'biotech',
      submissionProgram: 'general_ri',
      persona: 'regulatory',
      regulatorScope: 'fda',
      documentClass: 'evidence_memo',
      readinessGate: 'internal_review',
      workspaceTarget: 'project',
      originSurface: 'api_route',
      recommendationSource: 'report_engine',
      regulatorIntent: 'evidence_analysis',
      exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ok' },
    },
  });
  mockFindSourceByChecksum.mockResolvedValue(null);
  mockCreateSource.mockResolvedValue({ id: 4242 });
  // No predecessor by default: the upload is a new document, so the handler
  // takes the createSource path (createSupersedingSource stays unused).
  mockFindSupersededCandidate.mockResolvedValue(null);
  mockCreateSupersedingSource.mockResolvedValue({ source: { id: 4242 } });
});

describe('chat upload → canonical source identity', () => {
  it('creates one client_document source and returns its id', async () => {
    const res = await runUpload();

    expect(mockCreateSource).toHaveBeenCalledTimes(1);
    const [orgId, params] = mockCreateSource.mock.calls[0];
    expect(orgId).toBe(5);
    expect(params.sourceType).toBe('client_document');
    expect(params.title).toBe('protocol.txt');
    expect(payload(res).sourceId).toBe(4242);
  });

  it('scopes a numeric project upload to the workspace', async () => {
    await runUpload({ projectId: 'proj_12' });
    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.visibilityClass).toBe('project_private');
    expect(params.clientWorkspaceId).toBe(12);
    expect(params.clientProgramId).toBeNull();
  });

  it('scopes a UUID-keyed program upload instead of rejecting it', async () => {
    // The project management module is keyed on regulatory_programs UUIDs.
    // upload.ts used to parseInt every projectId and return 400
    // GOVERNED_UPLOAD_CONTEXT_INVALID on the NaN, so a file could not be
    // uploaded at all while a UUID-keyed program was open.
    const uuid = '11111111-1111-4111-8111-111111111111';
    const res = await runUpload({ projectId: uuid });

    expect(res.status).not.toHaveBeenCalledWith(400);
    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.clientProgramId).toBe(uuid);
    expect(params.clientWorkspaceId).toBeNull();
    expect(params.visibilityClass).toBe('project_private');
    expect(payload(res).status).toBe('ready');
  });

  it('keeps an unscoped chat attachment tenant-private, not project-wide', async () => {
    await runUpload({ projectId: null });
    expect(mockCreateSource).toHaveBeenCalledTimes(1);
    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.visibilityClass).toBe('tenant_private');
    expect(params.clientWorkspaceId).toBeNull();
  });

  it('records that the document was stored and read, not left pending', async () => {
    await runUpload();
    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.ingestionStatus).toBe('ingested');
    expect(params.extractionStatus).toBe('extracted');
    expect(params.provenance.extractionMethod).toBe('utf8');
  });

  it('carries the upload back to its bytes and its file_uploads row', async () => {
    const res = await runUpload();
    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.storedArtifactRef).toMatch(/^uploads\/org-5\//);
    expect(params.provenance.fileUploadId).toBe(payload(res).fileId);
    expect(params.provenance.origin).toBe('chat_upload');
    expect(params.metadata.mimeType).toBe('text/plain');
  });

  it('hashes the raw bytes, so identity survives a re-upload', async () => {
    await runUpload({ content: 'identical bytes' });
    const first = mockCreateSource.mock.calls[0][1].checksum;

    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockGetEmbeddingService.mockReturnValue({ embedAtom: vi.fn().mockResolvedValue(undefined) });
    mockFindSourceByChecksum.mockResolvedValue(null);
    mockCreateSource.mockResolvedValue({ id: 1 });

    await runUpload({ content: 'identical bytes' });
    expect(mockCreateSource.mock.calls[0][1].checksum).toBe(first);
  });

  it('resolves an existing identity instead of creating a second one', async () => {
    mockFindSourceByChecksum.mockResolvedValue({ id: 777 });

    const res = await runUpload();

    expect(mockCreateSource).not.toHaveBeenCalled();
    expect(payload(res).sourceId).toBe(777);
  });

  it('does not fail the upload when identity resolution errors', async () => {
    // The user's file is already stored; losing the identity is a real gap but
    // must not turn a completed upload into a 500.
    mockCreateSource.mockRejectedValue(new Error('cre tables missing'));

    const res = await runUpload();

    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = payload(res);
    expect(body.status).toBe('ready');
    expect(body.sourceId).toBeNull();
  });

  it('skips identity resolution when the org does not resolve to a numeric id', async () => {
    // `tenantContext.organizationId` is not guaranteed numeric (the shared mock
    // request supplies a string id). Passing NaN through would stamp a garbage
    // owner onto the canonical identity — worse than having no identity.
    const res = await runUpload({ tenantId: null, projectId: null });
    expect(mockFindSourceByChecksum).not.toHaveBeenCalled();
    expect(mockCreateSource).not.toHaveBeenCalled();
    expect(payload(res).sourceId).toBeNull();
  });
});

describe('chat upload → source version is observed, never invented (L21)', () => {
  it('records the version the document declares, and where it read it', async () => {
    await runUpload({
      fileName: 'protocol.txt',
      content: 'CLINICAL STUDY PROTOCOL\nProtocol C2C-401\nVersion 3.2\n15 January 2026',
    });

    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.version).toBe('3.2');
    expect(params.provenance.versionDeclaration).toMatchObject({
      declared: true,
      version: '3.2',
      basis: 'document_text_declaration',
      evidence: 'Version 3.2',
      determinedBy: 'chat_upload ingest',
    });
  });

  it('reads the version off the filename when the document declares none', async () => {
    await runUpload({ fileName: 'SAP_v2.txt', content: 'Primary endpoint is ORR.' });

    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.version).toBe('2');
    expect(params.provenance.versionDeclaration).toMatchObject({
      declared: true, basis: 'filename_declaration',
    });
  });

  it('records an UNKNOWN version as unknown — not as 1, not as a date', async () => {
    // The row this test exists for. Nothing about this upload declares a
    // version. `version` must stay null, and the fact that evidence WAS
    // examined must be on the record: a bare null is indistinguishable from a
    // row that no version determination ever ran against, and the ingest must
    // not close that gap by inventing a number a reviewer would read as real.
    await runUpload({
      fileName: 'brochure.txt',
      content: 'Investigator Brochure. Section 1. Physical properties.',
    });

    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.version).toBeNull();
    for (const tempting of ['1', 1, 'v1', 'latest', '1.0']) {
      expect(params.version).not.toBe(tempting);
    }
    expect(params.provenance.versionDeclaration).toEqual({
      declared: false,
      version: null,
      basis: null,
      reason: 'no_declaration_found',
      examined: ['document_text', 'filename'],
      determinedBy: 'chat_upload ingest',
    });
  });

  it('declines to pick when the document declares two different versions', async () => {
    await runUpload({
      fileName: 'protocol_v9.txt',
      content: 'Protocol Version 2.0, superseding Version 1.0.',
    });

    const [, params] = mockCreateSource.mock.calls[0];
    expect(params.version).toBeNull();
    expect(params.provenance.versionDeclaration).toMatchObject({
      declared: false, reason: 'ambiguous_declarations', candidates: ['2.0', '1.0'],
    });
    // And it did NOT rescue itself from the filename — that would be resolving
    // the document's own conflict with weaker evidence.
    expect(params.provenance.versionDeclaration.examined).toEqual(['document_text']);
  });

  it('carries the determination onto a superseding upload too', async () => {
    // A revision is exactly where a version matters most; the supersession
    // branch builds its own params object and must not drop it.
    mockFindSupersededCandidate.mockResolvedValue({ id: 300 });

    await runUpload({ fileName: 'protocol.txt', content: 'PROTOCOL\nVersion 4.0' });

    expect(mockCreateSource).not.toHaveBeenCalled();
    const [, params] = mockCreateSupersedingSource.mock.calls[0];
    expect(params.version).toBe('4.0');
    expect(params.provenance.versionDeclaration).toMatchObject({ declared: true, version: '4.0' });
    // The supersedes record still travels alongside it.
    expect(params.provenance.supersedes).toMatchObject({ sourceId: 300 });
  });
});
