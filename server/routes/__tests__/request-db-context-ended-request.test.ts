/**
 * F1, 2026-11-01. The slice 0 launch walk (2026-10-26) reported, on a dev server
 * with RLS_ENFORCE=on as app_service, that a signed-in administrator's Quality
 * reads, the notification badge and the project's unified work "fail" with
 * {"err":"Request-scoped database context is required","code":"REQUEST_DB_CONTEXT_REQUIRED"}.
 *
 * Three things are pinned here, through the middleware chain these routes are
 * served behind, over a real HTTP socket:
 *
 *   1. A read the caller waits for is served on its own tenant-scoped request
 *      connection (the six reads the walk named, in warn and enforce boundary
 *      modes). This held at HEAD before the change: the walk's lines were never
 *      a completed read failing.
 *   2. A read the caller cancels while authentication is still running (the
 *      browser's net::ERR_ABORTED, docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/
 *      continuation/browser-context-summary.json) reaches its handler after its
 *      response has ended. Since 11feb8d93 and b927133ac its client is released
 *      at once, so the handler fails closed and takes no connection. Before this
 *      change that refusal was named REQUEST_DB_CONTEXT_REQUIRED, the code for a
 *      route mounted with no scope installer at all, and serverError logged it
 *      as a server failure: the walk's exact line. It is now named for what it
 *      is, REQUEST_ENDED, and noted rather than logged as a failure.
 *   3. A route with no scope installer still answers REQUEST_DB_CONTEXT_REQUIRED
 *      at error level: the change does not hide the defect that code exists for.
 *
 * The chain, mirrored from production in this order:
 *   applyAuthBoundary (server/startup/middleware.ts: the /api boundary with the
 *     real authenticateToken, then validateTenantContext and the body parsers);
 *   the global /api gate (server/bootstrap/register-platform-routes.ts:245),
 *     which runs authMiddleware for every path not on its open list;
 *   app.use('/api/mdx', mdxNotificationsRoutes) and
 *     app.use('/api/mdx', mdxQmsRoutes) (register-inline-routes.ts);
 *   app.use('/api/concept2cure', authenticateToken, scheduleOfEventsRoutes)
 *     (register-concept2cure-routes.ts:48).
 * The JWT is really signed and verified. The database is a double: the account
 * standing read (one per authenticator, which is where the test holds the
 * request while the client goes away), the membership and lifecycle reads, and
 * a request pool whose connections record every statement.
 */
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo, Socket } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 2;
const USER = 7;
const ORG_UUID = 'cec579dd-c9c5-44d7-b96f-be0cb408fd34';
const PROGRAM = '5f0c2a41-7a8e-4d1b-9c55-1e2f3a4b5c6d';

/** Holds the request at its Nth account-standing read until the test resumes it. */
const gate = vi.hoisted(() => {
  let reads = 0;
  let pauseAt = 0;
  let onPaused: (() => void) | null = null;
  let release: (() => void) | null = null;
  return {
    reset(at = 0) { reads = 0; pauseAt = at; onPaused = null; release = null; },
    reads: () => reads,
    async standingRead(): Promise<void> {
      reads += 1;
      if (reads !== pauseAt) return;
      await new Promise<void>((resolve) => { release = resolve; onPaused?.(); });
    },
    whenPaused: () => new Promise<void>((resolve) => { onPaused = resolve; }),
    resume: () => release?.(),
  };
});

/** The request pool behind every LazyRequestDbClient: each connection records what ran on it. */
const conn = vi.hoisted(() => ({
  connections: 0,
  releases: 0,
  statements: [] as Array<{ text: string; params?: unknown[] }>,
  reset() { this.connections = 0; this.releases = 0; this.statements.length = 0; },
}));

function chain(rows: Array<Record<string, unknown>>): any {
  const c: any = {};
  c.from = () => c;
  c.leftJoin = () => c;
  c.where = () => c;
  c.limit = () => Promise.resolve(rows);
  return c;
}

vi.mock('../../db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pool: {
    query: async (sql: string) => {
      if (/SELECT status FROM users/.test(sql)) {
        await gate.standingRead();
        return { rows: [{ status: 'active' }] };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
  db: {
    // Projection { status, paymentStatus } is the lifecycle posture read; any
    // other is a membership read (authMiddleware's inline one, orgMembership's).
    select: (projection?: Record<string, unknown>) =>
      projection && 'status' in projection
        ? chain([{ status: 'active', paymentStatus: 'active' }])
        : chain([{ role: 'admin', orgUuid: ORG_UUID }]),
  },
  getPool: () => ({
    connect: async () => {
      conn.connections += 1;
      return {
        query: async (textOrConfig: unknown, values?: unknown[]) => {
          const text = typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text: string }).text;
          const params = values ?? (typeof textOrConfig === 'string' ? undefined : (textOrConfig as { values?: unknown[] }).values);
          conn.statements.push({ text, params });
          return { rows: /COUNT\(\*\)::int AS n/.test(text) ? [{ n: 0 }] : [] };
        },
        release: () => { conn.releases += 1; },
      };
    },
    query: async () => ({ rows: [{ max_storage: 5 }] }),
  }),
}));

import { logger } from '../../utils/logger';
import { activeJwtSecret } from '../../utils/jwtVerify';
import { invalidateOrgMembershipCache } from '../../middleware/orgMembership';
import { invalidateTenantPosture } from '../../services/tenant/tenant-lifecycle';

type Line = { level: 'error' | 'warn' | 'info' | 'debug'; message: string; context: Record<string, unknown> | undefined };
const lines: Line[] = [];
const REQUEST_ROUTES = /^\[(mdx-qms|mdx-qms-training|mdx-notifications|project-schedule-of-events)\]/;
/** The line a route's own catch wrote for this request, if any. */
const routeLine = () => lines.find((l) => REQUEST_ROUTES.test(l.message));
const codeOf = (l: Line | undefined) => (l?.context as { code?: unknown } | undefined)?.code ?? null;

let app: express.Express;
let bareApp: express.Express;
let token: string;

beforeAll(async () => {
  const { applyAuthBoundary } = await import('../../startup/middleware');
  const { authMiddleware } = await import('../../auth');
  const { authenticateToken } = await import('../../middleware/auth');
  const mdxQmsRoutes = (await import('../mdx-qms')).default;
  const mdxNotificationsRoutes = (await import('../mdx-notifications')).default;
  const scheduleOfEventsRoutes = (await import('../project-schedule-of-events')).default;

  app = express();
  applyAuthBoundary(app);
  app.use('/api', authMiddleware);
  app.use('/api/mdx', mdxNotificationsRoutes);
  app.use('/api/mdx', mdxQmsRoutes);
  app.use('/api/concept2cure', authenticateToken, scheduleOfEventsRoutes);

  // The defect REQUEST_DB_CONTEXT_REQUIRED exists to name: a router reached by
  // an identified caller with no scope installer in front of it.
  bareApp = express();
  bareApp.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: USER, userId: USER, organizationId: ORG, role: 'admin' };
    next();
  });
  bareApp.use('/api/mdx', mdxQmsRoutes);

  token = jwt.sign({ type: 'access', userId: USER, organizationId: String(ORG), role: 'admin', email: 'qa@example.invalid' }, activeJwtSecret(), { expiresIn: '15m' });
});

const ORIGINAL = { mode: process.env.AUTH_BOUNDARY_MODE, rls: process.env.RLS_ENFORCE };
beforeEach(() => {
  process.env.RLS_ENFORCE = 'on';
  gate.reset();
  conn.reset();
  lines.length = 0;
  invalidateOrgMembershipCache();
  invalidateTenantPosture();
  for (const level of ['error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(logger, level).mockImplementation(((message: string, context?: Record<string, unknown>) => {
      lines.push({ level, message, context });
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL.mode === undefined) delete process.env.AUTH_BOUNDARY_MODE; else process.env.AUTH_BOUNDARY_MODE = ORIGINAL.mode;
  if (ORIGINAL.rls === undefined) delete process.env.RLS_ENFORCE; else process.env.RLS_ENFORCE = ORIGINAL.rls;
});

const READS = [
  ['doc-list', '/api/mdx/qms/documents', 'FROM qms_documents'],
  ['change-list', '/api/mdx/qms/changes', 'FROM qms_change_controls'],
  ['doc-review-due', '/api/mdx/qms/documents/review-due', 'FROM qms_documents'],
  ['training-compliance', '/api/mdx/qms/training/compliance', 'qms_'],
  ['unread-count', '/api/mdx/notifications/unread-count', 'COUNT(*)::int AS n'],
  ['unified work', `/api/concept2cure/projects/${PROGRAM}/unified-work`, ''],
] as const;

describe('a read the caller waits for is served on its tenant-scoped request connection', () => {
  for (const mode of ['warn', 'enforce'] as const) {
    it.each(READS)(`%s (%s), boundary ${mode}`, async (_name, path, sqlMark) => {
      process.env.AUTH_BOUNDARY_MODE = mode;
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);

      expect(res.status, JSON.stringify(res.body)).not.toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('REQUEST_DB_CONTEXT_REQUIRED');
      expect(routeLine(), 'the route logged a failure for a completed read').toBeUndefined();
      // One connection, opened with this caller's tenant session variables, then the handler's own SQL on it.
      expect(conn.connections).toBe(1);
      expect(conn.statements[0].text).toContain("set_config('app.current_tenant_id'");
      // The caller's verified account joins the scope (fd04214563, P-104): the owner wall private rules read.
      expect(conn.statements[0].params).toEqual([String(ORG), 'admin', ORG_UUID, String(USER)]);
      expect(conn.statements.length).toBeGreaterThan(1);
      if (sqlMark) expect(conn.statements.slice(1).some((s) => s.text.includes(sqlMark)), conn.statements.map((s) => s.text).join('\n')).toBe(true);
      await vi.waitFor(() => expect(conn.releases).toBe(1));
    });
  }
});

/**
 * Send `path`, hold it at its `pauseAt`-th account-standing read, close the
 * client's connection there (a page navigating away, a fetch aborted), then let
 * authentication finish. Resolves when the route's own catch has spoken.
 */
async function cancelDuringAuthentication(path: string, pauseAt: number): Promise<void> {
  gate.reset(pauseAt);
  const server = http.createServer(app);
  const sockets: Socket[] = [];
  server.on('connection', (s) => sockets.push(s));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const paused = gate.whenPaused();
    const client = http.get({
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      path,
      agent: false,
      headers: { authorization: `Bearer ${token}` },
    });
    client.on('error', () => undefined);
    await paused;
    const serverSide = sockets[0];
    const closed = serverSide.destroyed ? Promise.resolve() : once(serverSide, 'close');
    client.destroy();
    await closed;
    gate.resume();
    await vi.waitFor(() => expect(routeLine(), 'the handler never ran').toBeDefined(), { timeout: 5_000 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('a read the caller cancels during authentication is not reported as a missing request context', () => {
  it.each<[where: string, path: string, pauseAt: number, holder: string]>([
    // [route, path, which account-standing read held it, the authenticator making that read]
    ['doc-list', '/api/mdx/qms/documents', 1, 'the /api boundary (authenticateToken)'],
    ['doc-list', '/api/mdx/qms/documents', 2, 'the global /api gate (authMiddleware), after the client was bound'],
    ['change-list', '/api/mdx/qms/changes', 2, 'the global /api gate'],
    ['doc-review-due', '/api/mdx/qms/documents/review-due', 1, 'the /api boundary'],
    ['training-compliance', '/api/mdx/qms/training/compliance', 1, 'the /api boundary'],
    ['unread-count', '/api/mdx/notifications/unread-count', 1, 'the /api boundary'],
    ['loading unified work', `/api/concept2cure/projects/${PROGRAM}/unified-work`, 3, 'the mount\'s own authenticateToken'],
  ])('%s (%s): the client left at standing read %i, in %s', async (where, path, pauseAt) => {
    process.env.AUTH_BOUNDARY_MODE = 'warn';
    await cancelDuringAuthentication(path, pauseAt);

    const line = routeLine()!;
    expect(line.message).toContain(where);
    expect(
      lines.filter((l) => codeOf(l) === 'REQUEST_DB_CONTEXT_REQUIRED')
        .map((l) => `${l.level} ${l.message} ${JSON.stringify({ err: l.context?.err, code: l.context?.code })}`),
      'a cancelled request was reported as a route with no request database context',
    ).toEqual([]);
    expect(codeOf(line), `${line.level} ${line.message} ${JSON.stringify(line.context)}`).toBe('REQUEST_ENDED');
    expect(line.level, 'a cancelled request was logged as a server failure').toBe('info');
    // Fail closed, as 11feb8d93 made it: no connection was taken for a request nobody waits for.
    expect(conn.connections).toBe(0);
  });
});

describe('a route with no scope installer still names the defect', () => {
  it('REQUEST_DB_CONTEXT_REQUIRED, logged as a failure', async () => {
    const res = await request(bareApp).get('/api/mdx/qms/documents');
    expect(res.status).toBe(500);
    const line = routeLine()!;
    expect(line.level).toBe('error');
    expect(line.message).toContain('doc-list failed');
    expect(codeOf(line)).toBe('REQUEST_DB_CONTEXT_REQUIRED');
  });
});

afterAll(() => { vi.restoreAllMocks(); });
