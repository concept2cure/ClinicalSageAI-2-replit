/**
 * Concept2Cure artifact creation — source-evidence citation gate
 *
 * Pins two governance behaviors of
 * POST /api/concept2cure/projects/:projectId/artifacts
 * (server/routes/concept2cure.ts):
 *
 *   1. SOURCE_EVIDENCE_NOT_FOUND fails closed: a metadata.sourceArtifactIds
 *      entry that does not resolve to an artifact in the caller's org+project
 *      refuses the write with 400 and persists nothing. This gate previously
 *      had no runnable coverage (its only exercise was a broken e2e).
 *
 *   2. The persisted metadata carries the VALIDATED deduped citation array,
 *      not the raw caller array. The artifacts-center listing renders
 *      json_array_length(metadata->'sourceArtifactIds') as "N cited sources",
 *      so persisting the raw ['a','a','',42] (with only 'a' existing) would
 *      surface "4 cited sources" — fabricated governance metadata. Verified
 *      failing before the fix: with the raw array persisted, the assertion in
 *      test 2 reports a 4-element array instead of ['artifact_evidence_1'].
 *
 * Harness style mirrors tests/routes/concept2cure.test.ts: mock db/auth/tenant
 * middleware, import the real router, and invoke the route's final handler
 * directly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest, createMockResponse, expectStatus } from '../setup';

// ── Hoisted mock state ───────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  const state = {
    /** Rows returned by the source-evidence lookup (select({artifactId,title})). */
    sourceLookupRows: [] as Array<{ artifactId: string; title: string }>,
    /** Every payload passed to db.insert(...).values(...). */
    insertedValues: [] as any[],
    reset() {
      this.sourceLookupRows = [];
      this.insertedValues.length = 0;
    },
  };
  return state;
});

// ── Mock db (shape-dispatched, same pattern as tests/routes/concept2cure.test.ts)

vi.mock('../../server/db', () => {
  const baseProject = {
    id: 1,
    name: 'Test Project',
    description: 'Test description',
    metadata: {},
    status: 'planning',
    organizationId: 1,
    clientWorkspaceId: 1,
    createdById: 1,
    ownerId: 1,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const makeQueryChain = (rows: any[]) => {
    const chain: any = {};
    chain.where = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => Promise.resolve(rows));
    chain.limit = vi.fn(() => Promise.resolve(rows));
    chain.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(rows).then(onFulfilled, onRejected);
    chain.catch = (onRejected: any) => Promise.resolve(rows).catch(onRejected);
    chain.finally = (onFinally: any) => Promise.resolve(rows).finally(onFinally);
    return chain;
  };

  const db = {
    select: vi.fn((shape?: any) => {
      const keys = shape && typeof shape === 'object' ? Object.keys(shape) : [];

      // Source-evidence citation lookup: select({ artifactId, title })
      if (keys.length === 2 && keys.includes('artifactId') && keys.includes('title')) {
        return { from: vi.fn(() => makeQueryChain([...hoisted.sourceLookupRows])) };
      }

      // Project access check row
      if (
        keys.includes('createdById') &&
        keys.includes('ownerId') &&
        keys.includes('settings') &&
        keys.includes('organizationId')
      ) {
        return { from: vi.fn(() => makeQueryChain([{ ...baseProject }])) };
      }

      // Sharing visibility read
      if (keys.length === 1 && keys[0] === 'visibility') {
        return { from: vi.fn(() => makeQueryChain([{ visibility: 'private' }])) };
      }

      // Sharing members read
      if (keys.includes('role') && keys.includes('status') && keys.includes('userId')) {
        return {
          from: vi.fn(() =>
            makeQueryChain([
              {
                userId: 1,
                role: 'owner',
                status: 'active',
                invitedById: 1,
                acceptedAt: new Date(),
              },
            ])
          ),
        };
      }

      // Generic fallback
      return { from: vi.fn(() => makeQueryChain([{ ...baseProject }])) };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => {
        hoisted.insertedValues.push(payload);
        const chain: any = {};
        chain.returning = vi.fn().mockResolvedValue([
          {
            id: payload?.id ?? 1,
            ...payload,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: payload?.version ?? 1,
          },
        ]);
        chain.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
        chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
        return chain;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  };

  // resolveClientWorkspaceId now resolves the caller org's workspace from the
  // database instead of fabricating id 1; answer that one query honestly and
  // leave every other raw query empty.
  const poolQuery = vi.fn(async (text: unknown) =>
    typeof text === 'string' && text.includes('FROM client_workspaces')
      ? { rows: [{ id: 7 }] }
      : { rows: [] }
  );
  return { db, pool: { query: poolQuery } };
});

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

// Import after mocks
import concept2cureRouter from '../../server/routes/concept2cure';

function getCreateArtifactHandler() {
  const layer = concept2cureRouter.stack.find(
    (l: any) => l.route?.path === '/projects/:projectId/artifacts' && l.route?.methods?.post
  );
  if (!layer) throw new Error('Missing route POST /projects/:projectId/artifacts');
  return (layer as any).route.stack[(layer as any).route.stack.length - 1].handle;
}

function makeAuthorRequest(body: Record<string, unknown>) {
  const req = createMockRequest({ params: { projectId: '1' }, body }) as any;
  req.userId = 1;
  req.userEmail = 'tester@example.com';
  req.userRole = 'admin';
  req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };
  return req;
}

/** The concept2cure_artifacts insert payload — the only insert carrying both
 *  an external artifactId string and a metadata object. */
function findArtifactInsert() {
  return hoisted.insertedValues.find(
    p => p && typeof p.artifactId === 'string' && p.metadata && typeof p.metadata === 'object'
  );
}

describe('POST /projects/:projectId/artifacts — source-evidence citation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.reset();
  });

  it('refuses creation with SOURCE_EVIDENCE_NOT_FOUND when a cited source does not exist, and persists nothing', async () => {
    // No artifact resolves for the cited id (nonexistent, or belonging to a
    // foreign org/project — the lookup is org+project scoped, so both are the
    // same empty result).
    hoisted.sourceLookupRows = [];

    const req = makeAuthorRequest({
      type: 'document',
      category: 'document',
      title: 'Draft citing a missing source',
      content: 'This write must fail because its asserted evidence does not exist.',
      metadata: {
        generationMethod: 'manual',
        sourceArtifactIds: ['artifact_missing_source'],
      },
    });
    const res = createMockResponse();

    await getCreateArtifactHandler()(req, res);

    expectStatus(res, 400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'SOURCE_EVIDENCE_NOT_FOUND',
          details: expect.objectContaining({
            missingSourceArtifactIds: ['artifact_missing_source'],
          }),
        }),
      })
    );
    // Fail closed: no artifact row was written.
    expect(findArtifactInsert()).toBeUndefined();
  });

  it('persists the validated deduped sourceArtifactIds array, not the raw caller array', async () => {
    // Raw caller array: duplicate id + empty string + non-string. Only one
    // real citation exists. json_array_length over the raw array would render
    // "4 cited sources" in the artifacts-center listing.
    hoisted.sourceLookupRows = [{ artifactId: 'artifact_evidence_1', title: 'Evidence 1' }];

    const req = makeAuthorRequest({
      type: 'document',
      category: 'document',
      title: 'Draft citing one real source',
      content: 'Synthetic draft content citing exactly one validated evidence artifact.',
      metadata: {
        generationMethod: 'manual',
        sourceArtifactIds: ['artifact_evidence_1', 'artifact_evidence_1', '', 42],
      },
    });
    const res = createMockResponse();

    await getCreateArtifactHandler()(req, res);

    expectStatus(res, 201);

    const artifactInsert = findArtifactInsert();
    expect(artifactInsert).toBeDefined();
    // The persisted citation list is exactly what was validated: deduped,
    // string-only, every id proven to exist. NOT the raw 4-element array.
    expect(artifactInsert.metadata.sourceArtifactIds).toEqual(['artifact_evidence_1']);
    // Other caller metadata is preserved untouched.
    expect(artifactInsert.metadata.generationMethod).toBe('manual');

    // The response echoes the same validated list — the caller is never shown
    // a citation count the server did not verify.
    const jsonPayload = (res.json as any).mock.calls.at(-1)?.[0];
    expect(jsonPayload?.data?.metadata?.sourceArtifactIds).toEqual(['artifact_evidence_1']);
  });
});
