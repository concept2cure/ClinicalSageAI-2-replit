/**
 * The Module 3 routes act as the signed-in user or answer 401 — before any
 * evaluation, composition or write.
 *
 * What the code used to do (until 2026-10-15): with no user on the request,
 *   - GET /readiness and POST /guard/final-export evaluated the governed fabric
 *     with `actorId: (req as any).user?.id || 'system'`, so the decision that
 *     evaluation records was filed as decided by 'system';
 *   - POST /compile and POST /sections/:p/:s/refresh wrote each section's
 *     provenance event with `created_by = String(user?.id || 'system')`;
 *   - POST /build-section (module3ConvergenceRoutes) did the same with
 *     `String(user?.id ?? 'system')`.
 * 'system' names nobody. A user is read through governedActorId (req.userId,
 * then req.user.id) and passed as String(id).
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  canonical: vi.fn(),
  compose: vi.fn(),
  persist: vi.fn(),
  bridge: vi.fn(),
}));

vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
vi.mock('../../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: async () => null }));
vi.mock('../../../db', () => ({
  getPool: () => ({
    query: (...a: unknown[]) => H.query(...a),
    connect: async () => ({ query: (...a: unknown[]) => H.query(...a), release: () => undefined }),
  }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ verifyReauth: vi.fn(), recordGovernedAction: vi.fn() }));
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: (...a: unknown[]) => H.canonical(...a),
}));
vi.mock('../../../services/cmc/module3-compile', () => ({
  composeProjectModule3: (...a: unknown[]) => H.compose(...a),
  persistComposedSection: (...a: unknown[]) => H.persist(...a),
  compiledRecordOf: (s: { structuredPayload: unknown }) => s.structuredPayload,
  loadCanonicalSources: vi.fn(),
}));
vi.mock('../../../services/module3-convergence-service', () => ({
  bridgeCompileToArtifact: (...a: unknown[]) => H.bridge(...a),
  getSectionLabels: vi.fn(),
}));

import osRouter from '../module3OperatingSystemRoutes';
import convergenceRouter from '../module3ConvergenceRoutes';

function app(user: Record<string, unknown> | null) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = 101;
    (req as any).tenantContext = { organizationId: 101 };
    if (user) (req as any).user = user;
    next();
  });
  a.use('/api/cmc/module3-os', osRouter);
  a.use('/api/cmc/module3-convergence', convergenceRouter);
  return a;
}

const SECTION = {
  sectionKey: '3.2.S.1',
  sectionPath: 'm3.3.2.S.1',
  structuredPayload: { sectionKey: '3.2.S.1' },
  narrativeDraft: 'Narrative',
  completeness: 80,
  missingInputs: [],
  lineage: [],
  tables: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  H.query.mockImplementation(async (sql: string) => {
    if (/SELECT id, deterministic_json, approval_state FROM cmc_module3_sections/.test(sql)) {
      return { rows: [{ id: 'sec-1', deterministic_json: {}, approval_state: 'draft' }] };
    }
    return { rows: [] };
  });
  H.canonical.mockResolvedValue({ derivedFlags: {} });
  H.compose.mockResolvedValue({ sources: [{ id: 'so-1' }], sections: [SECTION] });
  H.persist.mockResolvedValue('sec-1');
  H.bridge.mockResolvedValue({ bridged: false, reason: 'not-under-test', detail: '' });
});

const ROUTES = [
  ['get', '/api/cmc/module3-os/readiness/proj-1'],
  ['post', '/api/cmc/module3-os/guard/final-export/proj-1'],
  ['post', '/api/cmc/module3-os/compile/proj-1'],
  ['post', '/api/cmc/module3-os/sections/proj-1/3.2.S.1/refresh'],
  ['post', '/api/cmc/module3-convergence/build-section/proj-1/3.2.S.1'],
] as const;

describe('with no user, the Module 3 routes refuse before acting', () => {
  it.each(ROUTES)('%s %s answers 401, and nothing is evaluated, composed or written', async (method, path) => {
    const res = await (request(app({ organizationId: 101 })) as any)[method](path).send({});
    expect(res.status).toBe(401);
    expect(H.canonical).not.toHaveBeenCalled();
    expect(H.compose).not.toHaveBeenCalled();
    expect(H.persist).not.toHaveBeenCalled();
  });
});

describe('with a user, they act as that user, by id', () => {
  const USER = { id: 9, organizationId: 101 };

  it.each([
    ['get', '/api/cmc/module3-os/readiness/proj-1'],
    ['post', '/api/cmc/module3-os/guard/final-export/proj-1'],
  ] as const)('%s %s evaluates the governed fabric as the user', async (method, path) => {
    await (request(app(USER)) as any)[method](path).send({});
    expect(H.canonical).toHaveBeenCalled();
    expect(H.canonical.mock.calls[0][0].context.actorId).toBe('9');
  });

  it.each([
    ['/api/cmc/module3-os/compile/proj-1'],
    ['/api/cmc/module3-os/sections/proj-1/3.2.S.1/refresh'],
    ['/api/cmc/module3-convergence/build-section/proj-1/3.2.S.1'],
  ] as const)('POST %s records the section as written by the user', async (path) => {
    const res = await request(app(USER)).post(path).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(H.persist).toHaveBeenCalled();
    expect(H.persist.mock.calls[0][4].actorId).toBe('9');
  });
});
