/**
 * The labeling writes take an editing role, as the UDI writes do (D3,
 * 2026-10-29; docs/evidence/D3-DEVICE-WRITES-ADMIT-PROGRAM/2026-10-29/ana-tools-and-role-gate/).
 *
 * mdx-udi.ts puts `requireEditorAccess` (server/middleware/orgMembership.ts,
 * GOVERNED_WRITE_ROLES) on each of its writes. mdx-labeling.ts put nothing on
 * its six, and its mount (`app.use('/api/mdx', mdxLabelingRoutes)` in
 * register-inline-routes.ts) adds nothing, so a `viewer` could create and amend
 * IFUs and labels, add and approve translations, and add and remove symbols.
 *
 * Each write now refuses a caller without an editing role before the handler
 * runs: 403, the same body as the UDI write, and no statement sent. The reads
 * stay open to every member of the organization, as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORG = 7;

const h = vi.hoisted(() => {
  const state = { role: 'member' as string | undefined };
  /** Every statement sent, in order. */
  const sent: string[] = [];
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> => {
    sent.push(sql);
    // requireDocInOrg, the single read, and every write find (or touch) document 1.
    if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql) || /FROM labeling_documents WHERE id = \$1/.test(sql)) {
      return { rows: [{ id: 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, sent, query };
});

vi.mock('../../db', () => ({
  pool: { query: (sql: string) => h.query(sql) },
  getPool: () => ({ query: (sql: string) => h.query(sql) }),
}));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import labelingRouter from '../../routes/mdx-labeling';
import udiRouter from '../../routes/mdx-udi';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: ORG, role: h.state.role };
    next();
  });
  a.use('/api/mdx', udiRouter);
  a.use('/api/mdx', labelingRouter);
  return a;
}

type Method = 'post' | 'patch' | 'delete' | 'get';

const WRITES: Array<{ method: Method; path: string; body?: Record<string, unknown>; ok: number }> = [
  { method: 'post', path: '/api/mdx/labeling', body: { deviceName: 'Infusion pump', docKind: 'ifu' }, ok: 201 },
  { method: 'patch', path: '/api/mdx/labeling/1', body: { status: 'review' }, ok: 200 },
  { method: 'post', path: '/api/mdx/labeling/1/translations', body: { language: 'de' }, ok: 201 },
  /* A PATCH to `approved` is an electronic signature since D5 (2026-10-29): it
     needs a password, a meaning and a reason as well as an editor, and is pinned
     in mdx-labeling-translation-approval-signature.test.ts, which also checks a
     viewer's refusal of it. The editor gate here is checked on a status change
     that is not an approval. */
  { method: 'patch', path: '/api/mdx/labeling/translations/1', body: { status: 'review' }, ok: 200 },
  { method: 'post', path: '/api/mdx/labeling/1/symbols', body: { symbolCode: '5.1.1', symbolName: 'Manufacturer' }, ok: 201 },
  { method: 'delete', path: '/api/mdx/labeling/symbols/1', ok: 204 },
];

const READS = [
  '/api/mdx/labeling',
  '/api/mdx/labeling/1',
  '/api/mdx/labeling/1/translations',
  '/api/mdx/labeling/1/symbols',
  '/api/mdx/labeling/1/coverage',
];

function send(method: Method, path: string, body?: Record<string, unknown>) {
  const r = request(app())[method](path);
  return body ? r.send(body) : r;
}
const wrote = () => h.sent.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));

beforeEach(() => {
  h.sent.length = 0;
  h.query.mockClear();
  h.state.role = 'member';
});

/** The UDI write's refusal of a viewer: the reference the labeling writes match. */
async function udiRefusalOfAViewer() {
  h.state.role = 'viewer';
  const res = await request(app()).post('/api/mdx/udi').send({ deviceName: 'Infusion pump', udiDi: '00812345678901', issuingAgency: 'GS1' });
  h.sent.length = 0;
  return { status: res.status, body: res.body as unknown };
}

describe('the reference: the UDI write refuses a viewer', () => {
  it('answers 403 and sends nothing', async () => {
    const ref = await udiRefusalOfAViewer();
    expect(ref).toEqual({ status: 403, body: { error: 'Insufficient permissions' } });
  });
});

describe.each(WRITES)('$method $path takes an editing role', ({ method, path, body, ok }) => {
  it('refuses a viewer with the UDI write\'s 403, and sends nothing', async () => {
    const ref = await udiRefusalOfAViewer();
    h.state.role = 'viewer';
    const res = await send(method, path, body);
    // First, so a failure shows what the viewer's request sent.
    expect(h.sent).toEqual([]);
    expect({ status: res.status, body: res.body as unknown }).toEqual(ref);
  });

  it('refuses a member with no role, and sends nothing', async () => {
    h.state.role = undefined;
    const res = await send(method, path, body);
    expect(h.sent).toEqual([]);
    expect(res.status).toBe(403);
  });

  it('lets an editor write, as before', async () => {
    const res = await send(method, path, body);
    expect(res.status).toBe(ok);
    expect(wrote()).toBe(true);
  });
});

describe('the labeling reads stay open to every member', () => {
  it.each(READS)('a viewer reads %s', async path => {
    h.state.role = 'viewer';
    const res = await request(app()).get(path);
    expect(res.status).toBe(200);
    expect(wrote()).toBe(false);
  });
});
