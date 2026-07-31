import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockVersionsFindMany, mockArtifactsFindFirst } = vi.hoisted(() => ({
  mockVersionsFindMany: vi.fn(),
  mockArtifactsFindFirst: vi.fn(),
}));

vi.mock('../../server/services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: vi.fn(),
}));

vi.mock('../../server/db.js', () => ({
  db: {
    query: {
      concept2cureArtifactVersions: {
        findMany: mockVersionsFindMany,
      },
      concept2cureArtifacts: {
        findFirst: mockArtifactsFindFirst,
      },
    },
  },
}));

import authoringActionsRouter from '../../server/routes/authoring-actions';

function getGetRouteHandler(path: string) {
  const layer = authoringActionsRouter.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.get
  );
  if (!layer) throw new Error(`Missing route GET ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * Simulates the drizzle relational `findMany` by evaluating the caller's
 * `where` predicate against a fixed row set. The predicate builders mirror
 * how drizzle passes `(columns, operators)` into the callback.
 */
function evalFindMany(rows: any[]) {
  return async ({ where, limit }: any) => {
    const cols = new Proxy({}, { get: (_t, prop) => prop });
    const ops = {
      eq: (col: string, val: any) => (row: any) => row[col] === val,
      and: (...preds: Array<(row: any) => boolean>) => (row: any) => preds.every(p => p(row)),
      desc: (col: string) => ({ col, dir: 'desc' }),
    };
    const predicate = where(cols, ops);
    const filtered = rows.filter(predicate).sort((a, b) => b.version - a.version);
    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  };
}

describe('authoring-actions compare-versions tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const versionRows = [
    // Caller org (1) versions
    { id: 10, artifactId: 100, organizationId: 1, version: 2, status: 'draft', content: 'own current', updatedAt: new Date() },
    { id: 11, artifactId: 100, organizationId: 1, version: 1, status: 'approved', content: 'own approved', updatedAt: new Date() },
    // Another tenant's version for the SAME artifact id — highest version number
    { id: 12, artifactId: 100, organizationId: 2, version: 3, status: 'approved', content: 'CROSS TENANT SECRET', updatedAt: new Date() },
  ];

  it('never returns another tenant\'s artifact version content', async () => {
    mockVersionsFindMany.mockImplementation(evalFindMany(versionRows));

    const req = createMockRequest({ params: { projectId: '5', artifactId: '100' } }) as any;
    req.tenantId = 1;
    const res = createMockResponse();

    const handler = getGetRouteHandler('/compare-versions/:projectId/:artifactId');
    await handler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.available).toBe(true);
    // Cross-tenant version 3 must be excluded: current is the caller's v2, approved is v1.
    expect(payload.currentVersion.version).toBe(2);
    expect(payload.approvedVersion.version).toBe(1);
    // No org-2 content length leaks in (its content differs in length from own rows).
    expect(JSON.stringify(payload)).not.toContain('CROSS TENANT SECRET');
    // The query itself must have been org-scoped.
    expect(mockVersionsFindMany).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when no tenant context is present', async () => {
    const req = createMockRequest({ params: { projectId: '5', artifactId: '100' } }) as any;
    const res = createMockResponse();

    const handler = getGetRouteHandler('/compare-versions/:projectId/:artifactId');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockVersionsFindMany).not.toHaveBeenCalled();
  });
});
