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
  opts: { projectId?: string | null; tenantId?: number | null; content?: string } = {},
) {
  const { projectId = 'proj_12', tenantId = 5, content = 'enrollment data' } = opts;
  const req = createMockRequest({ body: projectId ? { projectId } : {} }) as any;
  req.user = { id: 9 };
  if (tenantId != null) req.tenantId = tenantId;
  const buffer = Buffer.from(content, 'utf8');
  req.file = {
    originalname: 'protocol.txt',
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
