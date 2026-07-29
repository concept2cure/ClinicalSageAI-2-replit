/**
 * End-to-end: chat upload → text extraction → project memory.
 *
 * Drives a real file through the actual `POST /api/chat/upload` handler (via the
 * mounted chat router) and asserts the extracted text lands in the project's
 * memory: the `concept2cure_artifacts` row and the embedded `lumen_data_atoms`
 * atom both carry the document's real content, and the atom is embedded.
 *
 * The DB pool and embedding service are stubbed (so no Postgres / OpenAI), but
 * extraction is REAL — extractDocumentText runs end to end:
 *   • text/plain → utf8 (deterministic, always runs)
 *   • image/png  → WASM Tesseract OCR (runs only when language data is vendored)
 *
 * Companion to tests/routes/chat-governed-upload.test.ts (governance-failure
 * path); this is the success path that proves content reaches memory.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createMockRequest, createMockResponse } from '../setup';

const { mockResolveGovernedContext, mockPoolQuery, mockEmbedAtom, mockGetEmbeddingService } = vi.hoisted(() => ({
  mockResolveGovernedContext: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockEmbedAtom: vi.fn().mockResolvedValue(undefined),
  mockGetEmbeddingService: vi.fn(),
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

// The chat router pulls in a large dependency graph; stub the pieces the upload
// path never reaches so importing the router stays cheap and side-effect free.
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

const HAS_LANG_DATA = existsSync(
  path.resolve(__dirname, '../../server/assets/tessdata/eng.traineddata.gz'),
);

function getPostHandler(routePath: string) {
  const layer = (chatRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.post,
  );
  if (!layer) throw new Error(`Missing route POST ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/** The args of the lumen_data_atoms insert: [orgId, artId, title, content]. */
function findAtomInsert() {
  return mockPoolQuery.mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO lumen_data_atoms'),
  );
}
function findArtifactInsert() {
  return mockPoolQuery.mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO concept2cure_artifacts'),
  );
}

function textImagePng(text: string): Buffer {
  const canvas = createCanvas(720, 160);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 720, 160);
  ctx.fillStyle = '#000000';
  ctx.font = '44px sans-serif';
  ctx.fillText(text, 30, 95);
  return canvas.toBuffer('image/png');
}

async function runUpload(
  file: { originalname: string; mimetype: string; buffer: Buffer },
  opts: { projectId?: string | null; tenantId?: number | null } = {},
) {
  const { projectId = 'proj_12', tenantId = 5 } = opts;
  const body = projectId ? { projectId } : {};
  const req = createMockRequest({ body }) as any;
  req.user = { id: 9 };
  if (tenantId != null) req.tenantId = tenantId;
  req.file = { ...file, size: file.buffer.length };
  const res = createMockResponse();
  await getPostHandler('/upload')(req, res);
  return res;
}

describe('chat upload → extraction → project memory (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: every query returns no rows; the atom insert is overridden per-test
    // to return an id so the embedding branch runs.
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockGetEmbeddingService.mockReturnValue({ embedAtom: mockEmbedAtom });
    mockResolveGovernedContext.mockReturnValue({
      contract: {
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        documentClass: 'evidence_memo',
        readinessGate: 'internal_review',
        workspaceTarget: 'project',
        originSurface: 'import_pipeline',
        recommendationSource: 'report_engine',
        regulatorIntent: 'evidence_analysis',
        exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ready' },
      },
      validation: { valid: true, errors: [], warnings: [] },
      resolved: {},
    });
  });

  it('writes a text file’s real content into the artifact and embedded memory atom', async () => {
    const body = 'Patient enrollment reached 412 of 680 across 14 sites in 3 countries.';
    // Make the atom insert return an id so the embedding path fires.
    mockPoolQuery.mockImplementation((sql: string) =>
      String(sql).includes('INSERT INTO lumen_data_atoms')
        ? Promise.resolve({ rows: [{ id: 4242 }] })
        : Promise.resolve({ rows: [] }),
    );

    const res = await runUpload({
      originalname: 'enrollment.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(body, 'utf8'),
    });

    // Success response
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready',
        fileName: 'enrollment.txt',
        // Extraction summary surfaced for the chat UI's "read · N words" chip.
        extractionMethod: 'utf8',
        extractionWords: body.trim().split(/\s+/).length,
      }),
    );

    // Artifact carries the extracted text (not a filename placeholder).
    const artifactInsert = findArtifactInsert();
    expect(artifactInsert).toBeDefined();
    expect(artifactInsert![1]).toEqual(expect.arrayContaining([expect.stringContaining(body)]));

    // Memory atom carries the same content → AnA can retrieve it.
    const atomInsert = findAtomInsert();
    expect(atomInsert).toBeDefined();
    const atomContent = atomInsert![1][3] as string;
    expect(atomContent).toContain(body);

    // The atom was embedded with the id the insert returned.
    expect(mockEmbedAtom).toHaveBeenCalledWith(4242);
  });

  it('does NOT store a filename placeholder when extraction yields real text', async () => {
    const body = 'Real extracted body text, not a placeholder.';
    const res = await runUpload({
      originalname: 'note.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(body, 'utf8'),
    });
    expect(res.status).not.toHaveBeenCalledWith(400);
    const atomInsert = findAtomInsert();
    expect(atomInsert![1][3]).not.toContain('[Uploaded via chat:');
  });

  it('reports extraction status for an org-scoped upload (no project, no artifact)', async () => {
    const body = 'Org scoped note with several words here.';
    const res = await runUpload(
      { originalname: 'org.txt', mimetype: 'text/plain', buffer: Buffer.from(body, 'utf8') },
      { projectId: null },
    );

    // Success, and the response still reports the file was read.
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready',
        extractionMethod: 'utf8',
        extractionWords: body.trim().split(/\s+/).length,
        artifactId: null,
      }),
    );
    // No project → no artifact / memory atom insert.
    expect(findArtifactInsert()).toBeUndefined();
    expect(findAtomInsert()).toBeUndefined();
  });

  (HAS_LANG_DATA ? it : it.skip)(
    'OCRs an uploaded image and stores the recognised text in memory',
    async () => {
      mockPoolQuery.mockImplementation((sql: string) =>
        String(sql).includes('INSERT INTO lumen_data_atoms')
          ? Promise.resolve({ rows: [{ id: 77 }] })
          : Promise.resolve({ rows: [] }),
      );

      const res = await runUpload({
        originalname: 'scan.png',
        mimetype: 'image/png',
        buffer: textImagePng('Adverse event narrative'),
      });

      expect(res.status).not.toHaveBeenCalledWith(400);
      const atomInsert = findAtomInsert();
      expect(atomInsert).toBeDefined();
      const atomContent = (atomInsert![1][3] as string).toLowerCase();
      expect(atomContent).toContain('adverse event narrative');
      expect(mockEmbedAtom).toHaveBeenCalledWith(77);
    },
    60000,
  );
});
