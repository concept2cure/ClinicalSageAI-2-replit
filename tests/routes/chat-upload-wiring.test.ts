/**
 * POST /api/chat/upload — the WIRING, driven through the real router.
 *
 * WHY THIS FILE EXISTS, AND WHY THE EXISTING SUITE DID NOT CATCH IT
 * `tests/routes/chat-upload-source-identity.test.ts` reaches into the router,
 * pulls the last handler off the layer stack, hand-assigns
 * `req.file = { originalname, mimetype, buffer, size }` and calls it directly.
 * That proves the handler does the right thing GIVEN a parsed file. It cannot
 * prove anything about whether a file ever gets parsed — and it passed happily
 * for the entire period during which no multipart parser was mounted:
 *
 *     router.post('/upload', uploadHandler);   // ← no middleware
 *
 * The only body parsers on /api are express.json and express.urlencoded, and
 * neither consumes multipart/form-data. Every client surface posts a FormData
 * body, so `req.file` was always undefined and `req.body` always `{}`. The
 * handler, written as though multer had run, degraded rather than failing:
 * a `file_uploads` row named 'uploaded_file' with file_size 0, a storage_path
 * nothing was written to, a `cre_evidence_sources` row stamped
 * ingestion_status='ingested', and 200 {status:'ready'}.
 *
 * So these tests send a REAL multipart request through supertest to the REAL
 * mounted router. A test that constructs `req.file` itself can never fail the
 * way production failed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockPoolQuery,
  mockGetEmbeddingService,
  mockCreateSource,
  mockFindSourceByChecksum,
  mockResolveGovernedContext,
  mockFindSupersededCandidate,
  mockCreateSupersedingSource,
} = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockGetEmbeddingService: vi.fn(),
  mockCreateSource: vi.fn(),
  mockFindSourceByChecksum: vi.fn(),
  mockResolveGovernedContext: vi.fn(),
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
  // The upload handler destructures these before creating identity; a mocked
  // ESM module throws on a missing export, so both must be present.
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
// Keep the bytes out of the filesystem; the write itself is not under test.
// The handler does `import { promises as fs } from 'node:fs'`, so that is the
// specifier to intercept.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import chatRouter from '../../server/routes/chat';

/** Mount the REAL router behind the same body parsers /api uses. */
function app() {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use(express.urlencoded({ extended: true }));
  a.use((req, _res, next) => {
    (req as express.Request & { user?: unknown; tenantId?: number }).user = { id: 9 };
    (req as express.Request & { tenantId?: number }).tenantId = 5;
    next();
  });
  a.use('/api/chat', chatRouter);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [] });
  mockGetEmbeddingService.mockReturnValue({ embedAtom: vi.fn().mockResolvedValue(undefined) });
  mockFindSourceByChecksum.mockResolvedValue(null);
  mockCreateSource.mockResolvedValue({ id: 41 });
  mockFindSupersededCandidate.mockResolvedValue(null);
  mockCreateSupersedingSource.mockResolvedValue({ source: { id: 41 } });
  // Only reached when a projectId is supplied; the handler reads
  // `.validation.valid`, so a null stub throws before the response is written.
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
});

describe('the multipart parser is actually mounted', () => {
  it('receives the bytes a real multipart request sends', async () => {
    const res = await request(app())
      .post('/api/chat/upload')
      .field('projectId', 'proj_12')
      .attach('file', Buffer.from('enrollment data', 'utf8'), {
        filename: 'protocol.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    // The filename proves the parser ran: without it this was always
    // 'uploaded_file'.
    expect(res.body.fileName ?? res.body.file?.name ?? res.body.name).toBe('protocol.txt');
  });

  it('records the real byte length, not zero', async () => {
    await request(app())
      .post('/api/chat/upload')
      .attach('file', Buffer.from('enrollment data', 'utf8'), {
        filename: 'protocol.txt',
        contentType: 'text/plain',
      });

    // Whatever row was written must carry the true size. Pre-fix every upload
    // stored 0 because `req.body?.fileSize || 0` was the only source.
    const inserted = mockPoolQuery.mock.calls.find(([sql]) =>
      /INSERT INTO file_uploads/i.test(String(sql)),
    );
    expect(inserted, 'expected a file_uploads INSERT').toBeDefined();
    expect(inserted![1]).toContain('enrollment data'.length);
    expect(inserted![1]).not.toContain('uploaded_file');
  });
});

describe('an upload with no bytes fails closed', () => {
  it('refuses a request carrying no file rather than recording a phantom document', async () => {
    // The exact shape every upload took while the parser was missing.
    const res = await request(app()).post('/api/chat/upload').send({ projectId: 'proj_12' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE_RECEIVED');
  });

  it('writes nothing at all when it refuses', async () => {
    // The damage was never the 200 — it was the file_uploads row, the
    // 'ingested' cre_evidence_sources row and the canonical identity minted
    // for a document that did not exist.
    await request(app()).post('/api/chat/upload').send({});

    const wrote = mockPoolQuery.mock.calls.some(([sql]) => /INSERT INTO/i.test(String(sql)));
    expect(wrote).toBe(false);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it('does not accept a filename and size in place of a file', async () => {
    // The old handler took fileName/mimeType/fileSize from the body. An upload
    // endpoint that accepts metadata without a file has no honest use, and
    // that fallback is what made every phantom row look plausible.
    const res = await request(app())
      .post('/api/chat/upload')
      .send({ fileName: 'protocol.pdf', mimeType: 'application/pdf', fileSize: 2048000 });

    expect(res.status).toBe(400);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });
});

describe('content identity comes from content', () => {
  it('gives different documents different checksums', async () => {
    // Pre-fix the fallback hashed `[Uploaded via chat: ${fileName}] (${mime}, ${size} bytes)`,
    // and with no parser those three were constants — so every upload in an
    // org produced the SAME checksum, findSourceByChecksum matched the first
    // one, and four documents collapsed into one source called 'uploaded_file'.
    const send = (body: string, filename: string) =>
      request(app())
        .post('/api/chat/upload')
        .attach('file', Buffer.from(body, 'utf8'), { filename, contentType: 'text/plain' });

    await send('protocol version two', 'protocol.txt');
    await send('a completely different clinical study report', 'csr.txt');

    // createSource(orgId, fields) — the checksum is on the second argument.
    const checksums = mockCreateSource.mock.calls.map(
      ([, fields]) => (fields as { checksum: string }).checksum,
    );
    expect(checksums).toHaveLength(2);
    expect(checksums[0]).toBeTruthy();
    expect(checksums[0]).not.toBe(checksums[1]);
  });

  it('gives identical bytes the same checksum regardless of filename', async () => {
    // The other half of the contract: identity is the document, not its name.
    const send = (filename: string) =>
      request(app())
        .post('/api/chat/upload')
        .attach('file', Buffer.from('identical bytes', 'utf8'), { filename, contentType: 'text/plain' });

    await send('first-name.txt');
    await send('renamed-copy.txt');

    const checksums = mockCreateSource.mock.calls.map(
      ([, fields]) => (fields as { checksum: string }).checksum,
    );
    expect(checksums).toHaveLength(2);
    // Asserted non-empty first: two undefineds are equal, and that would be a
    // green test over a broken contract.
    expect(checksums[0]).toBeTruthy();
    expect(checksums[0]).toBe(checksums[1]);
  });

  it('is a SHA-256 over the bytes, independently reproducible', async () => {
    const bytes = Buffer.from('enrollment data', 'utf8');
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(bytes).digest('hex');

    await request(app())
      .post('/api/chat/upload')
      .attach('file', bytes, { filename: 'protocol.txt', contentType: 'text/plain' });

    expect(mockCreateSource).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ checksum: expected }),
    );
  });
});

describe('the parser enforces its limits', () => {
  it('rejects a file type outside the allowlist with 415, not 500', async () => {
    const res = await request(app())
      .post('/api/chat/upload')
      .attach('file', Buffer.from('MZ\x90\x00', 'binary'), {
        filename: 'payload.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(415);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });
});
