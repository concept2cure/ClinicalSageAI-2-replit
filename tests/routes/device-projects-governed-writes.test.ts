/**
 * `/api/device-projects` — the three writes were org-scoped and nothing else.
 *
 * A device project is the spine an FDA submission is assembled against. Any
 * authenticated member of the organization — a read-only viewer included —
 * could rename one, change its status, or DELETE it, and no row recorded who.
 * A delete is not recoverable.
 *
 * The route had no test file at all, which is how that survived a codebase
 * whose sibling device write (PUT /api/510k/device/profile) has carried a role
 * gate and an audit row for months. These pin the same two controls here: the
 * gate runs BEFORE the handler, and a write that lands is attributed to the
 * session's actor — never to an invented one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockLogAction, mockRows, mockReturning } = vi.hoisted(() => ({
  mockLogAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })),
  mockRows: vi.fn<[], unknown[]>(() => []),
  mockReturning: vi.fn(async () => [{ id: 7, name: 'BX-204 CGM' }]),
}));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
  auditService: { logAction: mockLogAction },
}));

const { fakeDb } = vi.hoisted(() => ({
  fakeDb: {
    select: () => ({
      from: () => ({
        where: Object.assign(async () => mockRows(), { orderBy: async () => mockRows() }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: () => mockReturning() }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => mockReturning() }) }) }),
    delete: () => ({ where: () => ({ returning: () => mockReturning() }) }),
  },
}));
vi.mock('../../server/db', () => ({ db: fakeDb, pool: { query: async () => ({ rows: [] }) } }));

const deviceProjectRoutes = (await import('../../server/routes/device-projects')).default;

function layer(path: string, method: 'get' | 'post' | 'put' | 'delete') {
  const l = (deviceProjectRoutes as any).stack.find(
    (x: any) => x.route?.path === path && x.route?.methods?.[method],
  );
  if (!l) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return l;
}

/** The WHOLE chain, gate included — reaching for the final handler would be
 *  blind to the very control these tests exist to pin. */
function runChain(path: string, method: 'get' | 'post' | 'put' | 'delete') {
  const handlers = layer(path, method).route.stack.map((s: any) => s.handle);
  return async (req: any, res: any) => {
    for (const handle of handlers) {
      let advanced = false;
      await handle(req, res, () => {
        advanced = true;
      });
      if (!advanced) return;
    }
  };
}

function makeReq(role: string, overrides: Record<string, unknown> = {}) {
  const req = createMockRequest({
    // POST additionally requires a workspace; the other two ignore it.
    body: { deviceName: 'BX-204 CGM', clientWorkspaceId: 4, ...(overrides.body as object) },
    ...overrides,
  }) as any;
  req.params = { id: '7', ...(overrides.params as object) };
  req.tenantId = 2;
  req.tenantContext = { organizationId: 2 };
  req.userId = 9;
  req.user = { id: 9, organizationId: 2, role };
  req.userRole = role;
  return req;
}

const WRITES: Array<['post' | 'put' | 'delete', string]> = [
  ['post', '/'],
  ['put', '/:id'],
  ['delete', '/:id'],
];

describe('/api/device-projects — the writes are gated and audited', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.mockReturnValue([{ id: 7, name: 'BX-204 CGM', metadata: {}, organizationId: 2 }]);
    mockReturning.mockResolvedValue([{ id: 7, name: 'BX-204 CGM' }]);
  });

  it.each(WRITES)('%s %s runs the role gate FIRST', (method, path) => {
    const names = layer(path, method).route.stack.map((s: any) => s.handle.name);
    expect(names[0]).toBe('requireEditorAccess');
  });

  it.each(WRITES)('%s %s refuses a viewer 403, writes nothing and audits nothing', async (method, path) => {
    const res = createMockResponse() as any;
    await runChain(path, method)(makeReq('viewer'), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockReturning).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it.each(WRITES)('%s %s audits an accepted write against the session actor', async (method, path) => {
    const res = createMockResponse() as any;
    await runChain(path, method)(makeReq('member'), res);

    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const row = mockLogAction.mock.calls[0][0] as any;
    expect(row.organizationId).toBe(2);
    // The real signed-in user, never a default or a guess.
    expect(row.userId).toBe(9);
    expect(row.resourceType).toBe('device_project');
    expect(row.action).toMatch(/^DEVICE_PROJECT_(CREATED|UPDATED|DELETED)$/);
  });

  it.each(WRITES)('%s %s refuses when no actor resolves rather than auditing an invented one', async (method, path) => {
    const req = makeReq('admin');
    delete req.userId;
    delete req.user.id;
    const res = createMockResponse() as any;
    await runChain(path, method)(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('the READ stays open — a viewer can still list the org’s device projects', async () => {
    const res = createMockResponse() as any;
    await runChain('/', 'get')(makeReq('viewer'), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalled();
  });
});
