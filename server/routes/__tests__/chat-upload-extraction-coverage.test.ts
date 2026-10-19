/**
 * D2 / W2 — the upload response states OCR coverage
 * (docs/evidence/D2-OCR-BUDGET/2026-10-18/CONTRACT.md, Amendment A, "Upload (B5)").
 *
 * Written from the contract only, fail-first against the baseline bytes. The
 * harness is the one chat-upload-durability.test.ts uses: the REAL multipart
 * router, upload-safety middleware and data-room extractCapture, with the
 * scanner, filesystem, database, extractor and downstream services as
 * controlled fixtures. No upload touches disk or a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const m = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  scanBuffer: vi.fn(),
  extractDocumentText: vi.fn(),
  resolveGovernedContext: vi.fn(),
  recordArtifactProvenance: vi.fn(),
  findSourceByChecksum: vi.fn(),
  findSupersededCandidate: vi.fn(),
  createSource: vi.fn(),
  createSupersedingSource: vi.fn(),
  writeUploadRetrievalAtom: vi.fn(),
  resolveVaultView: vi.fn(),
  resolveOrgVaultView: vi.fn(),
  classifyForFiling: vi.fn(),
  processCapturedSource: vi.fn(),
}));

vi.mock('../../db.js', () => {
  const pool = { query: (...args: unknown[]) => m.poolQuery(...args) };
  return { pool, getPool: () => pool };
});
vi.mock('../../db.ts', () => {
  const pool = { query: (...args: unknown[]) => m.poolQuery(...args) };
  return { pool, getPool: () => pool };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: (...args: unknown[]) => m.mkdir(...args),
      writeFile: (...args: unknown[]) => m.writeFile(...args),
    },
  };
});
vi.mock('../../utils/virusScan', () => ({ scanBuffer: (...args: unknown[]) => m.scanBuffer(...args) }));
vi.mock('../../services/ocr/index.js', () => ({ extractDocumentText: m.extractDocumentText }));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: m.resolveGovernedContext,
}));
vi.mock('../../services/provenance/artifact-provenance', () => ({
  recordArtifactProvenance: m.recordArtifactProvenance,
}));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  findSourceByChecksum: m.findSourceByChecksum,
  findSupersededCandidate: m.findSupersededCandidate,
  createSource: m.createSource,
  createSupersedingSource: m.createSupersedingSource,
}));
vi.mock('../../services/chat-uploads/upload-retrieval-atom.js', () => ({
  writeUploadRetrievalAtom: m.writeUploadRetrievalAtom,
}));
vi.mock('../../services/vault/vault-filing.service.js', () => ({
  resolveVaultView: m.resolveVaultView,
  resolveOrgVaultView: m.resolveOrgVaultView,
  classifyForFiling: m.classifyForFiling,
}));
vi.mock('../../services/clinical-regulatory-evidence/data-room-processing.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/clinical-regulatory-evidence/data-room-processing.js')>();
  return { ...actual, processCapturedSource: m.processCapturedSource };
});

// Unrelated handlers imported by the real chat router are outside this path.
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(), getThreadMessages: vi.fn(), saveChatMessage: vi.fn(),
}));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: vi.fn(() => ({})) }));
vi.mock('../../services/lumen-context-builder.js', () => ({ getIntelligencePrefix: vi.fn() }));
vi.mock('../../services/ana-guidance-executor.js', () => ({ processResponseActions: vi.fn() }));
vi.mock('../../services/kernel-decision-record.js', () => ({ logKernelDecision: vi.fn() }));
vi.mock('../../services/kernel-router.js', () => ({ planKernelExecution: vi.fn() }));
vi.mock('../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: vi.fn(), recordKernelPolicyOutcome: vi.fn() }));
vi.mock('../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: vi.fn() }));
vi.mock('../../services/claude/ClaudeToolDefinitions.js', () => ({ ALL_CLAUDE_TOOLS: [] }));
vi.mock('../../services/claude/ClaudeToolExecutor.js', () => ({ executeAgenticLoop: vi.fn() }));
vi.mock('../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: vi.fn() }));

import chatRouter from '../chat';

const PROGRAM_ID = '11111111-1111-1111-1111-111111111111';
const SCANNED = Buffer.from('%PDF-1.4\n% synthetic scanned binder, never parsed\n%%EOF\n');
const OCR_TEXT = 'Recognised clinical study report body text from the first hundred pages.';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: 9 };
    (req as express.Request & { tenantId?: number }).tenantId = 5;
    next();
  });
  instance.use('/api/chat', chatRouter);
  return instance;
}

function upload(projectId?: string) {
  const req = request(app()).post('/api/chat/upload');
  if (projectId) req.field('projectId', projectId);
  return req.attach('file', SCANNED, { filename: 'binder.pdf', contentType: 'application/pdf' });
}

function extractsWith(coverage?: unknown) {
  m.extractDocumentText.mockResolvedValue({
    text: OCR_TEXT, method: 'pdf-ocr', confidence: 88, ...(coverage === undefined ? {} : { coverage }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  m.scanBuffer.mockResolvedValue({ scanned: true, clean: true });
  m.poolQuery.mockResolvedValue({ rows: [{ present: 1, id: 77 }] });
  m.mkdir.mockResolvedValue(undefined);
  m.writeFile.mockResolvedValue(undefined);
  extractsWith();
  m.findSourceByChecksum.mockResolvedValue(null);
  m.findSupersededCandidate.mockResolvedValue(null);
  m.createSource.mockResolvedValue({ id: 41 });
  m.createSupersedingSource.mockResolvedValue({ source: { id: 41 } });
  m.resolveVaultView.mockResolvedValue('ctd');
  m.resolveOrgVaultView.mockResolvedValue('ctd');
  m.classifyForFiling.mockReturnValue({ needsReview: true });
  m.processCapturedSource.mockResolvedValue({ ok: true, processed: true, status: 'completed' });
  // The atom itself is NOT truncated: any indexedWholeFile=false below comes from coverage.
  m.writeUploadRetrievalAtom.mockResolvedValue({
    atomId: 81, extractedChars: OCR_TEXT.length, embeddedChars: OCR_TEXT.length, truncated: false, embedded: true,
  });
  m.resolveGovernedContext.mockReturnValue({
    validation: { valid: true, errors: [], warnings: [] }, resolved: {},
    contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ok' } },
  });
});

describe('upload response — extractionCoverage and indexedWholeFile (B5)', () => {
  it.each([
    ['page_budget', { pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' }],
    ['time_budget', { pageCount: 40, pagesRead: 17, limitedBy: 'time_budget' }],
    ['ocr_failed', { pageCount: 7, pagesRead: null, limitedBy: 'ocr_failed' }],
  ])('a %s read reports its coverage and indexedWholeFile false', async (_kind, coverage) => {
    extractsWith(coverage);
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body.extractionCoverage).toEqual(coverage);
    expect(res.body.retrieval).toMatchObject({ indexedWholeFile: false });
  });

  it('the upload extraction runs under the automatic budget', async () => {
    extractsWith({ pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' });
    await upload(PROGRAM_ID);
    expect(m.extractDocumentText).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', 'binder.pdf',
      { pdfOcrBudget: { maxPages: 100, maxDurationMs: 600_000 } });
  });

  it('a complete OCR read reports its coverage and stays indexedWholeFile true', async () => {
    const coverage = { pageCount: 3, pagesRead: 3, limitedBy: null };
    extractsWith(coverage);
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body.extractionCoverage).toEqual(coverage);
    expect(res.body.retrieval).toMatchObject({ indexedWholeFile: true });
  });

  it('a read without coverage reports extractionCoverage null', async () => {
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('extractionCoverage', null);
  });

  it('a conversation upload (no project) still reports its coverage', async () => {
    const coverage = { pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' };
    extractsWith(coverage);
    const res = await upload();
    expect(res.status).toBe(200);
    expect(res.body.extractionCoverage).toEqual(coverage);
  });

  it('CONTROL: a read without coverage keeps indexedWholeFile true', async () => {
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, extractionMethod: 'pdf-ocr' });
    expect(res.body.retrieval).toMatchObject({ indexedWholeFile: true });
  });

  it('CONTROL: an EXTRACTION_PARTIAL processing result is passed through to dataRoom.processing', async () => {
    m.processCapturedSource.mockResolvedValue({ ok: true, processed: true, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' });
    const res = await upload(PROGRAM_ID);
    expect(res.body.dataRoom).toMatchObject({
      recorded: true, readable: true,
      processing: { ok: true, processed: true, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' },
    });
  });
});
