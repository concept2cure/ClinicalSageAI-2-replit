/**
 * GET …/projects/:projectId/artifacts/:artifactId/versions names who made each
 * version (fold F3 slice B, D2, 2026-10-29).
 *
 * The project Vault's artifact leaf lists the artifact's versions from this
 * read (it is organization- and project-bound, PF-17), so the reader can see
 * who made each one, when, and what changed. The read returned `createdById`
 * only, a number no reader can act on. It now also returns `createdBy`, the
 * name the tenant may show (services/tenant/actor-names.ts, the resolver this
 * router already uses for reviewers), or "user <id>" when no name may be
 * shown. A name lookup that fails fails the read: a version list that cannot
 * say who made its versions is not offered as if it could.
 *
 * Harness: artifact-placement-says-whether-its-decision-was-recorded.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { st } = vi.hoisted(() => ({ st: { queue: [] as unknown[][], names: vi.fn() } }));

function chain(): any {
  const c: any = {};
  for (const m of ['select', 'selectDistinct', 'from', 'innerJoin', 'leftJoin', 'where', 'insert', 'values', 'update', 'set', 'delete']) c[m] = () => c;
  for (const m of ['orderBy', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => Promise.resolve(st.queue.shift() ?? []);
  c.then = (ok: any, ko: any) => Promise.resolve(st.queue.shift() ?? []).then(ok, ko);
  return c;
}

vi.mock('../../../services/cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: vi.fn(async (_org: number, raw: string) =>
    /^\d+$/.test(raw)
      ? { state: 'linked', artifactProjectId: Number(raw), via: 'numeric' }
      : { state: 'unaddressable', artifactProjectId: null, detail: 'not a project' },
  ),
}));
vi.mock('../../../db', () => ({
  get db() {
    return {
      select: () => chain(), selectDistinct: () => chain(), insert: () => chain(),
      update: () => chain(), delete: () => chain(),
      transaction: async (fn: (tx: unknown) => unknown) => fn(chain()),
    };
  },
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));
vi.mock('../../../services/tenant/actor-names', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/tenant/actor-names')>()),
  resolveActorNames: (...a: unknown[]) => st.names(...a),
}));
vi.mock('../../../services/ectd/package-content-change', () => ({ markPackagesContentChangedForArtifact: vi.fn() }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../project-access', async () => {
  const verifyProjectAccess = vi.fn(async () => true);
  // The router's admission, decided by the same stub (c2c/__tests__/support/admission-double.ts).
  const { admissionDecidedBy } = await import('./support/admission-double');
  return { verifyProjectAccess, getActorRole: () => 'viewer', projectAdmissionMiddleware: admissionDecidedBy(verifyProjectAccess) };
});
vi.mock('../../../services/clinical-regulatory-evidence/lineage-gate', () => ({ enforceAuthorLineage: vi.fn() }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptArtifactChange: vi.fn(), interceptFeedback: vi.fn() }));
vi.mock('../../../services/generation-guard.js', () => ({ createTraceId: () => 't1', emitTraceEvent: vi.fn() }));
vi.mock('../../../db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({ query: vi.fn() }) }));

import artifactRouter from '../artifacts';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.userId = 777;
  req.userRole = 'viewer';
  req.tenantContext = { organizationId: 99 };
  req.tenantId = 99;
  next();
});
app.use('/api/c2c', artifactRouter);

const ARTIFACT = {
  id: 4242, artifactId: 'artifact_abc', organizationId: 99, projectId: 3, type: 'document',
  category: 'document', title: 'Clinical overview', content: 'c', contentHash: 'h5', version: 5,
  ctdSection: '2.5', status: 'review', metadata: {}, createdAt: new Date(), updatedAt: new Date(),
};
const version = (n: number, by: number | null) => ({
  id: 100 + n, artifactId: 4242, organizationId: 99, version: n, content: `v${n}`, contentHash: `h${n}`,
  changeDescription: n === 5 ? 'Efficacy tables updated' : null, createdById: by, createdAt: new Date(`2026-10-2${n}T09:00:00Z`),
});

const read = () => request(app).get('/api/c2c/projects/3/artifacts/artifact_abc/versions');

beforeEach(() => {
  st.queue = [[ARTIFACT], [version(5, 12), version(3, 13), version(1, null)]];
  st.names.mockReset();
  st.names.mockResolvedValue(new Map([[12, { name: 'R. Writer', email: 'r@x' }]]));
});

describe('GET …/artifacts/:artifactId/versions — who made each version', () => {
  it('names each version’s author, or says the user id when no name may be shown', async () => {
    const res = await read();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.versions.map((v: any) => [v.version, v.createdById, v.createdBy])).toEqual([
      [5, 12, 'R. Writer'],
      [3, 13, 'user 13'],
      [1, null, null],
    ]);
    expect([...st.names.mock.calls[0][0]]).toEqual([12, 13, null]);
  });

  it('a name lookup that fails fails the read, never an unnamed list', async () => {
    st.names.mockRejectedValue(new Error('actor_name unavailable'));
    const res = await read();
    expect(res.status).toBe(500);
    expect(res.body.data).toBeUndefined();
  });

  it('still answers 404 for an artifact that is not this project’s', async () => {
    st.queue = [[{ ...ARTIFACT, projectId: 4 }]];
    const res = await read();
    expect(res.status).toBe(404);
    expect(st.names).not.toHaveBeenCalled();
  });
});
