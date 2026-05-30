/**
 * Integration tests for the restored Document Authoring routes
 * (server/routes/documentAuthoring.routes.ts) — the 21 CFR Part 11 document
 * create/fetch path the client depends on, which had regressed to a live 404
 * after the original file was deleted. See FORENSIC_CODE_AUDIT_2026-05-29.md.
 *
 * db + auditService are mocked so the handlers' control flow (auth/org/workspace
 * gates, validation, create + initial-version, tenant-scoped fetch) is exercised
 * without a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock the drizzle db with a configurable chainable builder ──────────────────
let insertReturning: any[] = [];
let selectRows: any[] = [];
const auditLogAction = vi.fn();

function chain(resolveWith: () => any[]) {
  const c: any = {
    insert: () => c,
    values: () => c,
    returning: () => Promise.resolve(resolveWith()),
    update: () => c,
    set: () => c,
    where: () => c,
    select: () => c,
    from: () => c,
    limit: () => Promise.resolve(selectRows),
  };
  return c;
}

vi.mock('../../server/db', () => ({
  db: {
    insert: () => chain(() => insertReturning),
    update: () => chain(() => []),
    select: () => chain(() => selectRows),
  },
  pool: {},
  getPool: () => ({}),
}));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => auditLogAction(...a) },
}));

import authoringRouter from '../../server/routes/documentAuthoring.routes';

function makeApp(user?: Record<string, unknown>, tenant?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (user) req.user = user;
    if (tenant) req.tenantContext = tenant;
    next();
  });
  app.use('/api/document-authoring', authoringRouter);
  return app;
}

const goodUser = { id: 7, organizationId: 99 };
const goodTenant = { organizationId: 99, clientWorkspaceId: 3 };

beforeEach(() => {
  insertReturning = [{ id: 100, title: 'X', documentType: 'regulatory', organizationId: 99 }];
  selectRows = [];
  auditLogAction.mockReset();
});

describe('POST /api/document-authoring/documents', () => {
  it('401s without user/org context', async () => {
    const res = await request(makeApp(undefined, goodTenant))
      .post('/api/document-authoring/documents')
      .send({ title: 'Doc' });
    expect(res.status).toBe(401);
  });

  it('400s without client workspace context', async () => {
    const res = await request(makeApp(goodUser, { organizationId: 99 }))
      .post('/api/document-authoring/documents')
      .send({ title: 'Doc' });
    expect(res.status).toBe(400);
  });

  it('400s when title is missing', async () => {
    const res = await request(makeApp(goodUser, goodTenant))
      .post('/api/document-authoring/documents')
      .send({ content: 'body only' });
    expect(res.status).toBe(400);
  });

  it('creates a document and emits a Part 11 audit entry', async () => {
    const res = await request(makeApp(goodUser, goodTenant))
      .post('/api/document-authoring/documents')
      .send({ title: 'My Doc', content: 'Hello', documentType: 'regulatory' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { id: 100 } });
    expect(auditLogAction).toHaveBeenCalledTimes(1);
    const entry = auditLogAction.mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'document.create', resourceType: 'document', resourceId: 100 });
  });

  it('creates a document without content (no initial version) and still succeeds', async () => {
    const res = await request(makeApp(goodUser, goodTenant))
      .post('/api/document-authoring/documents')
      .send({ title: 'No content doc' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/document-authoring/documents/:id', () => {
  it('401s without org context', async () => {
    const res = await request(makeApp()).get('/api/document-authoring/documents/100');
    expect(res.status).toBe(401);
  });

  it('400s on a non-numeric id', async () => {
    const res = await request(makeApp(goodUser, goodTenant)).get(
      '/api/document-authoring/documents/abc'
    );
    expect(res.status).toBe(400);
  });

  it('404s when the document belongs to another org (tenant isolation)', async () => {
    selectRows = [{ id: 100, organizationId: 1234 }];
    const res = await request(makeApp(goodUser, goodTenant)).get(
      '/api/document-authoring/documents/100'
    );
    expect(res.status).toBe(404);
  });

  it('returns the document when it belongs to the caller org', async () => {
    selectRows = [{ id: 100, organizationId: 99, title: 'Mine' }];
    const res = await request(makeApp(goodUser, goodTenant)).get(
      '/api/document-authoring/documents/100'
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { id: 100 } });
  });
});
