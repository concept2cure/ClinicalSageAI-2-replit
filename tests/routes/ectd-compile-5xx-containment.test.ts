/**
 * eCTD compile — a 500 carries the envelope, never the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * compile / status / history / validate answered `{ error, message:
 * error.message }`. Each reads project_sections, ectd_compilations, the
 * required-section catalog and the submission spine on the shared pool, so the
 * message is driver text. Harness as ectd-compile-ident.test.ts; the
 * required-section resolver is the dependency made to throw (compile, status,
 * validate all call it inside their outer try).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const SENTINEL = 'SENTINEL-DB-DETAIL relation "ectd_required_sections" does not exist';

const { poolQuery, resolveRequiredSections, logError } = vi.hoisted(() => ({
  poolQuery: vi.fn(async () => ({ rows: [] })),
  resolveRequiredSections: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/ectd/required-sections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/required-sections')>();
  return { ...actual, resolveRequiredSections };
});
vi.mock('../../server/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';

function getHandler(path: string, method: 'get' | 'post') {
  const layer = (ectdCompileRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(body: Record<string, unknown> = {}) {
  const req = createMockRequest({ params: { projectIdent: '42' }, body }) as any;
  req.tenantId = 7;
  return req;
}

function resWithRequestId() {
  const res = createMockResponse() as any;
  res.getHeader = vi.fn((name: string) => (name === 'X-Request-Id' ? 'req-set-a-ectd' : undefined));
  return res;
}

function expectContained(res: any) {
  expect(res.status).toHaveBeenCalledWith(500);
  const body = res.json.mock.calls[0][0];
  expect(JSON.stringify(body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(body)).not.toMatch(/ectd_required_sections|does not exist/);
  expect(body.error).toBe('INTERNAL_ERROR');
  expect(body.correlationId).toBe('req-set-a-ectd');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  poolQuery.mockImplementation(async () => ({ rows: [] }));
  resolveRequiredSections.mockRejectedValue(new Error(SENTINEL));
});

describe('ectd-compile 500s: envelope out, detail to the log', () => {
  it('POST /:projectIdent/compile', async () => {
    const res = resWithRequestId();
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ region: 'FDA' }), res);
    expectContained(res);
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /:projectIdent/status', async () => {
    const res = resWithRequestId();
    await getHandler('/:projectIdent/status', 'get')(makeReq(), res);
    expectContained(res);
  });

  it('POST /:projectIdent/validate', async () => {
    const res = resWithRequestId();
    await getHandler('/:projectIdent/validate', 'post')(makeReq({ region: 'FDA' }), res);
    expectContained(res);
  });

  it('GET /:projectIdent/history — an unreadable history is still the coded 503, unchanged', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM ectd_compilations')) throw new Error(SENTINEL);
      return { rows: [] };
    });
    const res = resWithRequestId();
    await getHandler('/:projectIdent/history', 'get')(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'HISTORY_UNAVAILABLE', message: 'Compilation history could not be read.' },
    });
  });
});
