/**
 * End-to-end: chat upload → text extraction → project memory.
 *
 * Drives a real file through the actual `POST /api/chat/upload` handler (via the
 * mounted chat router) and asserts the extracted text lands in the project's
 * memory: the embedded `lumen_data_atoms` atom, keyed to the file's Data Room
 * source (`cre_source:<id>`), carries the document's real content, and the atom
 * is embedded. Since 2026-10-17 (19087b9f0, document store consolidation step 3)
 * the upload writes no `concept2cure_artifacts` copy: the Data Room source is
 * the file's one record, and this suite pins that no copy comes back.
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
// The Data Room source identity is not this suite's subject (chat-upload-
// source-identity.test.ts is). Stubbed so a project-scoped upload records its
// source; with the real service on this suite's stub pool the write fails and
// the upload now, correctly, answers 503 SOURCE_NOT_RECORDED (PF-07).
vi.mock('../../server/services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  createSource: vi.fn(async () => ({ id: 4242 })),
  findSourceByChecksum: vi.fn(async () => null),
  findSupersededCandidate: vi.fn(async () => null),
  createSupersedingSource: vi.fn(async () => ({ source: { id: 4242 } })),
}));

/* The numeric project's ownership (PF-03). Its SQL is proven in
   server/services/cmc/__tests__/project-membership.pglite.test.ts; here project
   12 is organization 5's, and any other numeric project is not. */
const mockProjectBelongs = vi.hoisted(() =>
  vi.fn(async (p: { organizationId: number; projectId: string }) => p.organizationId === 5 && p.projectId === '12'),
);
vi.mock('../../server/services/cmc/project-membership.js', () => ({ projectBelongsToTenant: mockProjectBelongs }));
vi.mock('../../server/services/cmc/project-membership.ts', () => ({ projectBelongsToTenant: mockProjectBelongs }));
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

/** A valid governed context, should anything on the upload path consult one. */
const VALID_GOVERNED_CONTEXT = {
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
};

describe('chat upload → extraction → project memory (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: every query returns no rows; the atom insert is overridden per-test
    // to return an id so the embedding branch runs.
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockGetEmbeddingService.mockReturnValue({ embedAtom: mockEmbedAtom });
    mockResolveGovernedContext.mockReturnValue(VALID_GOVERNED_CONTEXT);
  });

  it('writes a text file’s real content into the embedded memory atom of its Data Room source, and no artifact copy', async () => {
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
        // The Data Room holds the file: its source is the one record.
        sourceId: 4242,
        dataRoom: expect.objectContaining({ recorded: true }),
      }),
    );
    expect(res.status).not.toHaveBeenCalled();

    // One record per uploaded file: no concept2cure_artifacts copy beside the source.
    expect(findArtifactInsert()).toBeUndefined();

    // The atom carries the extracted content, keyed to the source retrieval cites.
    const atomInsert = findAtomInsert();
    expect(atomInsert).toBeDefined();
    expect(atomInsert![1][1]).toBe('cre_source:4242');
    expect(atomInsert![1][3] as string).toContain(body);

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

  it('embeds NOTHING when extraction yields no text — the placeholder is not the document', async () => {
    /* The project (numeric workspace) branch wrote the retrieval atom
       unconditionally, so a file with no extractable text — a scan, an image
       OCR cannot read, here a whitespace-only file — was embedded as
       "[Uploaded via chat: …] (text/plain, N bytes)" and returned from
       retrieval as if it were a passage of the document. The program branch
       already refused this ("only real extracted content, never the filename
       placeholder"); this pins the same rule on the project branch. */
    const res = await runUpload({
      originalname: 'blank.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('   \n\t\n   ', 'utf8'),
    });
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(findAtomInsert()).toBeUndefined();
    expect(mockEmbedAtom).not.toHaveBeenCalled();
  });

  it('reports extraction status for an org-scoped upload (no project, no Data Room source)', async () => {
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
        // No project open: the file stays a conversation file (PF-07).
        sourceId: null,
        dataRoom: expect.objectContaining({ recorded: false }),
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
