/**
 * 510(k) document orchestration — a 500 carries the envelope, never the
 * thrower's text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The three orchestration handlers (generate-documents, lock, version) answered
 * `{ success: false, error: error.message }`. The orchestration service writes
 * fda_510k_documents, so what it throws in practice is driver text: a relation
 * or column name, a constraint, the connection target. These cases make the
 * service throw a sentinel that stands for that text and assert it reaches the
 * log, not the body, and that the body carries the request id instead.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL relation "fda_510k_documents" does not exist';

const { svc, logError } = vi.hoisted(() => ({
  svc: {
    orchestrateDocumentGeneration: vi.fn(),
    lockDocument: vi.fn(),
    createDocumentVersion: vi.fn(),
  },
  logError: vi.fn(),
}));

vi.mock('../../services/DocumentOrchestrationService.js', () => ({
  default: class {
    orchestrateDocumentGeneration = svc.orchestrateDocumentGeneration;
    lockDocument = svc.lockDocument;
    createDocumentVersion = svc.createDocumentVersion;
  },
}));
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../documentOrchestrationRoutes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-doc-orch');
    (req as any).user = { id: 11, organizationId: 7 };
    next();
  });
  a.use(router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(res.body)).not.toMatch(/fda_510k_documents|does not exist/);
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-doc-orch');
}

beforeEach(() => vi.clearAllMocks());

describe('510(k) orchestration 500s: envelope out, detail to the log', () => {
  it('POST /api/510k/:projectId/generate-documents', async () => {
    svc.orchestrateDocumentGeneration.mockRejectedValue(new Error(SENTINEL));
    const res = await request(app()).post('/api/510k/42/generate-documents');
    expectContained(res);
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('POST /api/510k/documents/:documentId/lock', async () => {
    svc.lockDocument.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).post('/api/510k/documents/d-1/lock'));
  });

  it('POST /api/510k/documents/:documentId/version', async () => {
    svc.createDocumentVersion.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).post('/api/510k/documents/d-1/version'));
  });

  it('leaves the 401 for a missing actor unchanged', async () => {
    const a = express();
    a.use(router);
    const res = await request(a).post('/api/510k/42/generate-documents');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authenticated organization/user context required' });
  });
});
