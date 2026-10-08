/**
 * A post-market document is created as a draft, by the session's user. The
 * request body cannot create it approved, locked or signed (D5, found by the
 * L195 review's sweep).
 *
 * `POST /api/post-market/programs/:programId/documents` spread the whole body
 * into the insert. So a caller could create a PSUR that was already `approved`
 * and `locked`, naming any approver, approval time and electronic-signature id,
 * none of which went through `approveDocument` and its gate. The route also set
 * the version, and a request with no user was created by 'system'. Edits were
 * already allow-listed (`DOCUMENT_EDITABLE`, ledger L192); creation was not.
 *
 * The service is mocked at its one insert; what it is handed is what the route
 * chose to store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }));

vi.mock('../server/db', () => {
  const query = (sql: string) =>
    Promise.resolve(/FROM regulatory_programs/.test(sql) ? { rows: [{ id: 'p' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  return { db: {}, pool: { query }, getPool: () => ({ query }) };
});
vi.mock('../server/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../server/services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true })),
}));
vi.mock('../server/services/gspr-postmarket/post-market.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createDocument: vi.fn(async (values: Record<string, unknown>) => {
      state.created.push(values);
      return { id: 'doc-1', ...values };
    }),
  };
});

import { postMarketRouter } from '../server/routes/gspr-postmarket';

const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';
const CALLER = 7;

function makeApp(user: Record<string, unknown> | null = { id: CALLER, organizationId: 99 }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  app.use('/api/post-market', postMarketRouter);
  return app;
}

const post = (body: Record<string, unknown>, user?: Record<string, unknown> | null) =>
  request(makeApp(user)).post(`/api/post-market/programs/${PROGRAM}/documents`).send(body);
const DOC = { documentType: 'psur', code: 'PSUR-1', title: 'PSUR 2026', summary: 'Period summary' };

beforeEach(() => {
  state.created = [];
});

describe('a post-market document is created as a draft by the session user', () => {
  it.each([
    ['status', { status: 'approved' }],
    ['locked', { locked: true }],
    ['approvedBy', { approvedBy: 'qa.head@example.com' }],
    ['approvedAt', { approvedAt: '2026-10-01T00:00:00Z' }],
    ['signatureId', { signatureId: 'cccccccc-0000-4000-8000-000000000003' }],
    ['version', { version: 7 }],
    ['createdBy', { createdBy: 'someone-else' }],
    ['updatedBy', { updatedBy: 'someone-else' }],
  ])('a body that sets %s is refused, and nothing is created', async (field, extra) => {
    const res = await post({ ...DOC, ...extra });
    // Leak assertion first: what would have been stored.
    expect(state.created.map((v) => v[field]), `the body must never write ${field}`).not.toContain(
      Object.values(extra)[0],
    );
    expect(res.status).toBe(422);
    expect(state.created).toEqual([]);
  });

  it('the stored row carries only document fields, and the session user as its creator', async () => {
    const res = await post({ ...DOC, id: 'dddddddd-0000-4000-8000-000000000004', organizationId: 5, programId: 'x' });
    expect(res.status).toBe(201);
    expect(state.created).toHaveLength(1);
    const stored = state.created[0];
    expect(stored).not.toHaveProperty('id');
    expect(stored).toMatchObject({
      organizationId: 99,
      programId: PROGRAM,
      documentType: 'psur',
      code: 'PSUR-1',
      title: 'PSUR 2026',
      summary: 'Period summary',
      createdBy: String(CALLER),
      updatedBy: String(CALLER),
    });
    for (const governed of ['status', 'locked', 'approvedBy', 'approvedAt', 'signatureId', 'version']) {
      expect(stored, governed).not.toHaveProperty(governed);
    }
  });

  it("with no user on the request nothing is created by 'system'", async () => {
    const res = await post(DOC, { organizationId: 99 });
    expect(state.created.map((v) => v.createdBy)).not.toContain('system');
    expect(res.status).toBe(401);
    expect(state.created).toEqual([]);
  });

  it('a session subject that arrives as a string still records the user', async () => {
    const res = await post(DOC, { id: String(CALLER), organizationId: 99 });
    expect(res.status).toBe(201);
    expect(state.created[0]).toMatchObject({ createdBy: String(CALLER) });
  });
});
