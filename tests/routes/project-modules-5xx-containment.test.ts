/**
 * Project-module links — a 500 carries the envelope, never the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * POST /:projectId/modules and POST /:projectId/modules/bulk answered
 * `{ error: err.message }`. The bridge writes project_module_links, so the
 * message is driver text in practice (a unique-constraint name, a relation).
 * Same harness as project-modules-tenant.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const SENTINEL =
  'SENTINEL-DB-DETAIL duplicate key value violates unique constraint "project_module_links_project_id_module_type_key"';

const { bridgeMocks, logError } = vi.hoisted(() => ({
  bridgeMocks: { linkModule: vi.fn(), bulkLink: vi.fn() },
  logError: vi.fn(),
}));

vi.mock('../../server/services/project-module-bridge', () => ({
  SUPPORTED_PROJECT_MODULE_TYPES: ['cer', 'csr', 'ectd', 'vault'],
  projectModuleBridge: bridgeMocks,
}));
vi.mock('../../server/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import projectModulesRouter from '../../server/routes/project-modules';

const handler = (path: string) => {
  const layer = (projectModulesRouter as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  return layer.route.stack[layer.route.stack.length - 1].handle as (req: any, res: any) => Promise<void>;
};

function reqWith(body: unknown) {
  const req = createMockRequest({ params: { projectId: '12' }, headers: { 'x-client-workspace-id': '9' }, body }) as any;
  req.user = { id: 7, organizationId: 3 };
  return req;
}

function resWithRequestId() {
  const res = createMockResponse() as any;
  res.getHeader = vi.fn((name: string) => (name === 'X-Request-Id' ? 'req-set-a-projmod' : undefined));
  return res;
}

function expectContained(res: any) {
  expect(res.status).toHaveBeenCalledWith(500);
  const body = res.json.mock.calls[0][0];
  expect(JSON.stringify(body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(body)).not.toContain('project_module_links');
  expect(body.error).toBe('INTERNAL_ERROR');
  expect(body.correlationId).toBe('req-set-a-projmod');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('project-modules 500s: envelope out, detail to the log', () => {
  it('POST /:projectId/modules', async () => {
    bridgeMocks.linkModule.mockRejectedValue(new Error(SENTINEL));
    const res = resWithRequestId();
    await handler('/:projectId/modules')(reqWith({ moduleType: 'cer', moduleInstanceId: 44 }), res);
    expectContained(res);
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('POST /:projectId/modules/bulk', async () => {
    bridgeMocks.bulkLink.mockRejectedValue(new Error(SENTINEL));
    const res = resWithRequestId();
    await handler('/:projectId/modules/bulk')(reqWith({ modules: [{ moduleType: 'cer', moduleInstanceId: 44 }] }), res);
    expectContained(res);
  });

  it('leaves the Zod 400 unchanged', async () => {
    const res = resWithRequestId();
    await handler('/:projectId/modules')(reqWith({ moduleType: 'not-a-module' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Invalid request');
    expect(bridgeMocks.linkModule).not.toHaveBeenCalled();
  });
});
