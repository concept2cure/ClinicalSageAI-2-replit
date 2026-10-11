/**
 * POST /api/chat/upload — the bytes are checked by assertUploadSafe before the
 * handler stores anything (IAM-14, plan P1-5).
 *
 * The handler ran verifyFileSignature and the virus scan itself, by hand, and
 * missed the two things the canonical helper (server/middleware/uploadSafety.ts)
 * adds:
 *
 *   - the NAME binds the type: `report.pdf` declared text/html with HTML bytes
 *     passed the text-shaped check and was stored as evidence under a .pdf name
 *     (periodic review 2026-09-28, SEC-A-3);
 *   - the scan is FAIL-CLOSED in production: with no reachable scanner the
 *     handler logged "Virus scan bypassed" and stored the file.
 *
 * Driven through the REAL router with a real multipart request, as
 * tests/routes/chat-upload-wiring.test.ts does, so the check is proven where it
 * is mounted rather than on a hand-built req.file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const m = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  createSource: vi.fn(),
  scanBuffer: vi.fn(),
}));

vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: vi.fn(() => ({ validation: { valid: true, errors: [], warnings: [] }, resolved: {}, contract: {} })),
}));
vi.mock('../../services/cmc/project-membership.js', () => ({ projectBelongsToTenant: vi.fn(async () => true) }));
vi.mock('../../services/cmc/project-membership.ts', () => ({ projectBelongsToTenant: vi.fn(async () => true) }));
vi.mock('../../db.js', () => {
  const pool = { query: (...a: unknown[]) => m.poolQuery(...a) };
  return { pool, getPool: () => pool };
});
vi.mock('../../db.ts', () => {
  const pool = { query: (...a: unknown[]) => m.poolQuery(...a) };
  return { pool, getPool: () => pool };
});
vi.mock('../../services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: vi.fn(() => ({ embedAtom: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  createSource: (...a: unknown[]) => m.createSource(...a),
  findSourceByChecksum: vi.fn(async () => null),
  findSupersededCandidate: vi.fn(async () => null),
  createSupersedingSource: vi.fn(async () => ({ source: { id: 41 } })),
}));
vi.mock('../../utils/virusScan', () => ({ scanBuffer: (...a: unknown[]) => m.scanBuffer(...a) }));
// The chat router pulls a large graph; stub what the upload path never reaches.
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(),
  getThreadMessages: vi.fn(),
  saveChatMessage: vi.fn(),
}));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: vi.fn(() => ({})) }));
vi.mock('../../services/lumen-context-builder.js', () => ({ getIntelligencePrefix: vi.fn().mockResolvedValue('') }));
vi.mock('../../services/ana-guidance-executor.js', () => ({ processResponseActions: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/kernel-decision-record.js', () => ({ logKernelDecision: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/kernel-router.js', () => ({ planKernelExecution: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/kernel-adaptive-policy.js', () => ({
  getKernelPolicyHint: vi.fn().mockResolvedValue(null),
  recordKernelPolicyOutcome: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../services/claude/ClaudeToolDefinitions.js', () => ({ ALL_CLAUDE_TOOLS: [] }));
vi.mock('../../services/claude/ClaudeToolExecutor.js', () => ({ executeAgenticLoop: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: vi.fn().mockResolvedValue('') }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: { ...actual.promises, writeFile: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined) },
  };
});

import chatRouter from '../chat';

function app() {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use((req, _res, next) => {
    (req as express.Request & { user?: unknown; tenantId?: number }).user = { id: 9 };
    (req as express.Request & { tenantId?: number }).tenantId = 5;
    next();
  });
  a.use('/api/chat', chatRouter);
  return a;
}

const upload = (name: string, type: string, body: string) =>
  request(app()).post('/api/chat/upload').attach('file', Buffer.from(body, 'utf8'), { filename: name, contentType: type });

const wroteAnything = () => m.poolQuery.mock.calls.some(([s]) => /INSERT INTO/i.test(String(s)));

beforeEach(() => {
  vi.clearAllMocks();
  m.poolQuery.mockResolvedValue({ rows: [] });
  m.createSource.mockResolvedValue({ id: 41 });
  m.scanBuffer.mockResolvedValue({ scanned: true, clean: true });
});

describe('chat evidence upload runs assertUploadSafe before anything is stored', () => {
  it.each([
    ['enrollment.csv', 'text/csv', 'subject,value\n001,0'],
    ['enrollment.tsv', 'text/tab-separated-values', 'subject\tvalue\n001\t0'],
    ['resource.json', 'application/json', '{"subject":"001","value":0}'],
    ['define.xml', 'application/xml', '<Study id="S1"><Subject id="001" /></Study>'],
  ])('stores and raw-text reads %s through the real multipart route after clean scanning', async (name, mime, source) => {
    const res = await upload(name, mime, source);
    expect(res.status).toBe(200);
    expect(res.body.extractionMethod).toBe('utf8');
    expect(res.body.extractionWords).toBeGreaterThan(0);
    expect(m.scanBuffer).toHaveBeenCalledWith(Buffer.from(source));
    expect(wroteAnything()).toBe(true);
  });

  it.each(['json', 'xml', 'tsv'])('refuses a PDF declared under a .%s name before scan/storage', async (extension) => {
    const res = await upload(`data.${extension}`, 'application/pdf', '%PDF-1.4\n');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_MISMATCH');
    expect(m.scanBuffer).not.toHaveBeenCalled();
    expect(wroteAnything()).toBe(false);
  });

  it('a text file named and declared as text is stored (control)', async () => {
    const res = await upload('protocol.txt', 'text/plain', 'enrollment data');
    expect(res.status).toBe(200);
    expect(wroteAnything()).toBe(true);
  });

  it('HTML sent as report.pdf is refused — the name binds the type — and nothing is written', async () => {
    const res = await upload('report.pdf', 'text/html', '<html><body onload="steal()">x</body></html>');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_MISMATCH');
    expect(wroteAnything()).toBe(false);
  });

  it('in production a file the scanner could not scan is refused (503) and nothing is written', async () => {
    m.scanBuffer.mockResolvedValue({ scanned: false, clean: true, reason: 'no CLAMAV_HOST' });
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await upload('protocol.txt', 'text/plain', 'enrollment data');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('FILE_SCAN_UNAVAILABLE');
      expect(wroteAnything()).toBe(false);
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('a flagged file is refused with no signature name echoed', async () => {
    m.scanBuffer.mockResolvedValue({ scanned: true, clean: false, signature: 'Eicar-Test-Signature' });
    const res = await upload('protocol.txt', 'text/plain', 'enrollment data');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_SCAN_REJECTED');
    expect(JSON.stringify(res.body)).not.toMatch(/Eicar/);
    expect(wroteAnything()).toBe(false);
  });
});
