/**
 * Concept2Cure Routes - Unit Tests
 *
 * Covers project creation, conversation creation, artifact creation,
 * and electronic signature creation paths.
 *
 * @module tests/routes/concept2cure.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  expectStatus,
  expectJson,
} from '../setup';

/* The transactional client the canonical signing route checks out
   (BEGIN / signature INSERT / audit INSERT / COMMIT). Hoisted so the signature
   tests can read what was persisted; every other statement answers empty, as
   the client did before. */
const sign = vi.hoisted(() => ({
  clientQuery: vi.fn(async (sql: unknown) =>
    typeof sql === 'string' && /INSERT INTO electronic_signatures/i.test(sql)
      ? { rows: [{ id: 42, signed_at: new Date('2026-09-23T00:00:00Z') }], rowCount: 1 }
      : { rows: [], rowCount: 0 }),
}));

// Mock dependencies used by concept2cure routes
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
    // Drizzle select chains are awaitable; mirror that in tests.
    chain.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows).then(onFulfilled, onRejected);
    chain.catch = (onRejected: any) => Promise.resolve(rows).catch(onRejected);
    chain.finally = (onFinally: any) => Promise.resolve(rows).finally(onFinally);
    return chain;
  };

  const db = {
    select: vi.fn((shape?: any) => {
      const keys = shape && typeof shape === 'object' ? Object.keys(shape) : [];

      // Project access checks: load scoped project row
      if (
        keys.includes('createdById') &&
        keys.includes('ownerId') &&
        keys.includes('settings') &&
        keys.includes('organizationId')
      ) {
        return {
          from: vi.fn(() => makeQueryChain([{ ...baseProject }])),
        };
      }

      // Sharing visibility read
      if (keys.length === 1 && keys[0] === 'visibility') {
        return {
          from: vi.fn(() => makeQueryChain([{ visibility: 'private' }])),
        };
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
      return {
        from: vi.fn(() => makeQueryChain([{ ...baseProject }])),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => {
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
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: 1,
              artifactId: 'artifact_test',
              organizationId: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              version: 1,
              type: 'document',
              category: 'document',
              title: 'Test Artifact',
              content: 'Content',
              contentHash: 'hash',
              metadata: {},
              settings: {},
            },
          ]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  /*
   * `pool` is exported too, because the route module uses BOTH. Several handlers
   * run raw SQL through pool.query — resolveClientWorkspaceId being the one every
   * create path hits first, now that it reads the caller org's workspace from the
   * database instead of returning a fabricated constant outside production.
   * Without this export the module threw `No "pool" export is defined on the
   * "../../server/db" mock` on entry, which the route caught and reported as a
   * plain 500. That is the route behaving correctly; the mock was incomplete.
   *
   * The workspace lookup answers with a row ONLY for the workspace these tests
   * claim in tenantContext ({ organizationId: '1', clientWorkspaceId: '1' }), so
   * the fixture models a workspace that genuinely belongs to the caller's org
   * rather than waving every query through. resolveClientWorkspaceId fails closed
   * when that row is absent — it refuses a workspace outside the caller's org —
   * and that behaviour stays exercisable here.
   */
  const pool = {
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      const p = (params as unknown[] | undefined) ?? [];
      if (typeof sql === 'string' && /client_workspaces/i.test(sql)) {
        const wsId = Number(p[0] ?? 1);
        const orgId = Number(p[1] ?? 1);
        return wsId === 1 && orgId === 1
          ? { rows: [{ id: 1 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      /* The canonical signing route (POST /api/esignature/sign) resolves the
         §11.50 signer from the org-scoped membership record and the §11.70
         content from the tenant-scoped version. Same discipline as the
         workspace fixture: a row only for user 1 in org 1, and version 1 of a
         document in org 1 — anything else is "not in your organization". */
      if (typeof sql === 'string' && /FROM users u\s+JOIN organization_users/i.test(sql)) {
        return Number(p[0]) === 1 && Number(p[1]) === 1
          ? { rows: [{ name: 'Test Signer', email: 'tester@example.com', title: 'Regulatory Lead' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (typeof sql === 'string' && /FROM document_versions/i.test(sql)) {
        return Number(p[0]) === 1 && Number(p[1]) === 1
          ? { rows: [{ document_id: 10, version_number: '1', content: 'signed body' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => ({
      query: sign.clientQuery,
      release: vi.fn(),
    })),
  };

  return { db, pool, getPool: () => pool };
});

vi.mock('../../server/services/ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    getEnabledProviders: () => ['mock-provider'],
    route: vi.fn().mockResolvedValue({
      content: 'Generated template content',
      model: 'mock-model',
    }),
  }),
}));

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));

/* §11.200 re-verification at the moment of signing: the route now checks the
   signer's password (and TOTP when enrolled) through injected deps. The policy
   itself is pinned in services/part11 tests; here the deps are stubbed so the
   ROUTE is exercised — a wrong password is refused by the same policy. */
vi.mock('../../server/services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string, hash: string) => plain === 'correct-horse-battery' && hash === 'stored-hash',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
  loadPasswordHash: async () => 'stored-hash',
}));

vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

// Import after mocks
import concept2cureRouter from '../../server/routes/concept2cure';
// The artifact domain moved to its own router (L53, slice 8).
import artifactRouter from '../../server/routes/c2c/artifacts';
// AI editing moved to its own router (L53, slice 9).
import aiEditingRouter from '../../server/routes/c2c/ai-editing';
// Conversation mutations moved to their own router (L53, slice 6).
import conversationRouter from '../../server/routes/c2c/conversations';
/* Signature creation. POST /projects/:projectId/artifacts/:artifactId/signatures
   was REMOVED on 2026-09-20 — it was a second signature substrate
   (concept2cure_signatures, its own hash recipe, no §11.70 binding); see the
   note in server/routes/c2c/artifacts.ts and its pin,
   server/routes/c2c/__tests__/artifact-signature-route-removed.test.ts. The one
   substrate is electronic_signatures, reached for a document version by
   POST /api/esignature/sign — so that is where these signature tests now drive. */
import esignatureRouter from '../../server/routes/esignature';

describe('Concept2Cure API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a project with valid payload', async () => {
    const req = createMockRequest({
      body: {
        name: 'Test Project',
        submissionType: 'IND',
        description: 'Test description',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    // Invoke handler directly by simulating route
    const layer = concept2cureRouter.stack.find((l: any) => l.route?.path === '/projects' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        name: 'Test Project',
        submissionType: 'IND',
      }),
    });
  });

  it('should create a conversation for a project', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: { title: 'New Conversation' },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = conversationRouter.stack.find((l: any) => l.route?.path === '/projects/:projectId/conversations' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'New Conversation',
      }),
    });
  });

  it('should create an artifact for a project', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: {
        type: 'document',
        category: 'document',
        title: 'Test Artifact',
        content: 'Test content',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = artifactRouter.stack.find((l: any) => l.route?.path === '/projects/:projectId/artifacts' && l.route?.methods?.post);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'Test Artifact',
      }),
    });
  });

  it('should persist template lineage when creating artifact from template', async () => {
    const req = createMockRequest({
      params: { projectId: 'proj_1' },
      body: {
        type: 'document',
        category: 'document',
        title: 'Template Artifact',
        content: 'Template-driven content',
        templateId: 'tpl_ind_cover_letter',
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();

    const layer = artifactRouter.stack.find(
      (l: any) => l.route?.path === '/projects/:projectId/artifacts' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expectStatus(res, 201);
    expectJson(res, {
      success: true,
      data: expect.objectContaining({
        title: 'Template Artifact',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Template Artifact',
        }),
      })
    );
  });

  it('should reject AI template generation without projectId unless adhoc context is explicit', async () => {
    const req = createMockRequest({
      params: { templateId: 'ind-cover-letter' },
      body: {
        variables: {
          PRODUCT_NAME: 'Test Product',
          INDICATION: 'Oncology',
          SPONSOR: 'Test Sponsor',
          IND_NUMBER: '000000',
          SUBMISSION_TYPE: 'Initial IND',
          DIVISION: 'CDER',
        },
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = aiEditingRouter.stack.find(
      (l: any) =>
        l.route?.path === '/ai/templates/:templateId/generate' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);
    expectStatus(res, 400);
  });

  it('should return IND package templates when filtered by package', async () => {
    const req = createMockRequest({
      query: { package: 'ind_readiness' },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = concept2cureRouter.stack.find(
      (l: any) => l.route?.path === '/templates' && l.route?.methods?.get
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'tpl_ind_cover_letter' }),
          expect.objectContaining({ id: 'tpl_ind_investigator_brochure' }),
          expect.objectContaining({ id: 'tpl_ind_pre_ind_briefing' }),
        ]),
      })
    );
  });

  it('should allow AI template generation when adhoc context is explicit', async () => {
    const req = createMockRequest({
      params: { templateId: 'ind-cover-letter' },
      body: {
        contextAttachment: 'adhoc',
        variables: {
          PRODUCT_NAME: 'Test Product',
          INDICATION: 'Oncology',
          SPONSOR: 'Test Sponsor',
          IND_NUMBER: '000000',
          SUBMISSION_TYPE: 'Initial IND',
          DIVISION: 'CDER',
        },
      },
    }) as any;
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };

    const res = createMockResponse();
    const layer = aiEditingRouter.stack.find(
      (l: any) =>
        l.route?.path === '/ai/templates/:templateId/generate' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          result: expect.any(String),
          template: expect.objectContaining({
            id: 'ind-cover-letter',
          }),
        }),
      })
    );
  });

  /** The canonical signing request, as an authenticated signer in org 1. */
  const signingRequest = (body: Record<string, unknown>) => {
    const req = createMockRequest({ body }) as any;
    req.headers = { 'x-forwarded-for': '127.0.0.1' };
    req.userId = 1;
    req.userEmail = 'tester@example.com';
    req.userRole = 'admin';
    req.user = { id: 1, email: 'tester@example.com', organizationId: 1 };
    req.tenantContext = { organizationId: '1', clientWorkspaceId: '1' };
    return req;
  };
  const signHandler = () => {
    const layer = (esignatureRouter as any).stack.find((l: any) => l.route?.path === '/sign' && l.route?.methods?.post);
    expect(layer, 'POST /api/esignature/sign is the one signing route for a document version').toBeTruthy();
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };
  /** The one electronic_signatures INSERT the transaction issued, as column → value. */
  const persistedSignature = () => {
    const calls = sign.clientQuery.mock.calls.filter((c: unknown[]) =>
      /INSERT INTO electronic_signatures/i.test(String(c[0])));
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0] as [string, unknown[]];
    const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((c) => c.trim());
    return Object.fromEntries(cols.map((c, i) => [c, params[i]]));
  };

  it('should create a signature for an artifact version — through the one signing substrate', async () => {
    // The artifact route's second substrate is gone (see the import note); a
    // document version is signed through POST /api/esignature/sign.
    expect(
      artifactRouter.stack.some((l: any) =>
        l.route?.path === '/projects/:projectId/artifacts/:artifactId/signatures' && l.route?.methods?.post),
      'the removed second signature substrate is back',
    ).toBe(false);

    const req = signingRequest({
      documentId: 10,
      versionId: 1,
      signaturePurpose: 'Approved for submission',
      signatureMeaning: 'I approve this version for submission',
      action: 'approved',
      password: 'correct-horse-battery',
      // Claims about HOW identity was established, asserted by the party being
      // authenticated. They must not reach the record.
      authenticationMethod: 'sso',
      secondFactorVerified: true,
    });
    const res = createMockResponse();

    await signHandler()(req, res);

    expectStatus(res, 201);
    expectJson(res, { signatureId: 42, signatureHash: expect.any(String) });
    const row = persistedSignature();
    expect(row.signature_purpose).toBe('Approved for submission');
    expect(row.signer_id).toBe(1);
    expect(row.organization_id).toBe(1);
    // What is persisted about HOW identity was established is derived from the
    // re-verification, never taken from the request body.
    expect(row.authentication_method).toBe('password');
    expect(row.second_factor_verified).toBe(false);
    // Signature and audit row committed together (§11.10(e)).
    const sqls = sign.clientQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s) => /INSERT INTO audit_logs/i.test(s))).toBe(true);
    expect(sqls.some((s) => /^\s*COMMIT/i.test(s))).toBe(true);
  });

  it('refuses a signature whose password does not verify — identity is checked at the moment of signing', async () => {
    const req = signingRequest({
      documentId: 10,
      versionId: 1,
      signaturePurpose: 'Approved for submission',
      action: 'approved',
      password: 'wrong',
    });
    const res = createMockResponse();
    await signHandler()(req, res);
    expectStatus(res, 401);
    // Refused before anything is written: no transaction was opened.
    expect(sign.clientQuery).not.toHaveBeenCalled();
  });
});
