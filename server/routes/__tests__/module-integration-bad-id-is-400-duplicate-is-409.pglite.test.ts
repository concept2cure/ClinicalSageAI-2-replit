/**
 * A path id that is not a positive integer is the caller's error (400), and
 * registering a module document that is already registered is a conflict
 * (409) — neither is a server failure.
 *
 * What the routes used to do (2026-10-15): GET /document/:id, PATCH
 * /documents/:id, GET /templates/:id and GET /workflow-history/:id passed
 * `parseInt(String(id), 10)` straight to the service. For "abc" that is NaN,
 * which reached Postgres as an integer parameter and answered 500; for "12abc"
 * it silently read document 12. GET /templates/:id was never reached at all:
 * GET /templates/:moduleType has the same shape and is registered first, and a
 * value that is not a module_type enum member answered 500 there (as it does on
 * GET /documents/:moduleType). POST /register-document for a (module,
 * originalId) already on file hit the module_doc_idx unique index (23505),
 * which registerDocument logged and rethrew, so the caller got a 500.
 *
 * The real router over the real services, on the real migrations in PGlite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// The router builds its services from the shared handle when it loads, so the
// handle is pointed at PGlite before the router is imported (see beforeAll).
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db', () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('../../db.js', () => ({
  get db() {
    return h.db;
  },
}));

const MIGRATIONS = [
  'migrations/20260729_unified_documents_provision.sql',
  'migrations/20260729b_unified_workflow_companion_tables.sql',
  'migrations/20260730_workflow_doc_versions_org_id.sql',
  'migrations/20260731_workflow_doc_versions_org_not_null.sql',
  'migrations/20260815_workflow_approval_tables.sql',
  'migrations/20261001_domain_history_append_only.sql',
];

const ORG = 7;
const SESSION_USER = 41;
const NOT_POSITIVE_INTEGERS = ['abc', '0', '-3', '1.5', '12abc'];

let pg: PGlite;
let router: Router;

beforeAll(async () => {
  pg = new PGlite();
  for (const file of MIGRATIONS) {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
  }
  h.db = drizzle(pg);
  router = (await import('../moduleIntegrationRoutes')).default;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      tenantId: ORG,
      userId: SESSION_USER,
      user: { id: SESSION_USER, organizationId: ORG, role: 'member' },
    });
    next();
  });
  a.use('/api/module-integration', router);
  return a;
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pg.query<{ n: number }>(sql, params);
  return rows[0].n;
}

describe('a path id that is not a positive integer is answered 400, before any query', () => {
  it.each(NOT_POSITIVE_INTEGERS)('GET /document/%s', async id => {
    const res = await request(app()).get(`/api/module-integration/document/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
  });

  it.each(NOT_POSITIVE_INTEGERS)('PATCH /documents/%s', async id => {
    const res = await request(app())
      .patch(`/api/module-integration/documents/${id}`)
      .send({ title: 'Renamed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
    expect(await count(`SELECT count(*)::int AS n FROM document_audit_logs`, [])).toBe(0);
  });

  it.each(NOT_POSITIVE_INTEGERS)('GET /workflow-history/%s', async id => {
    const res = await request(app()).get(`/api/module-integration/workflow-history/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
  });

  it.each(NOT_POSITIVE_INTEGERS)('GET /templates/%s (neither a module type nor a template id)', async id => {
    const res = await request(app()).get(`/api/module-integration/templates/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
  });

  it('GET /documents/:moduleType with a value that is not a module type is 400', async () => {
    const res = await request(app()).get('/api/module-integration/documents/not-a-module');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/module/);
  });
});

describe('the id routes still answer for well-formed ids', () => {
  it('GET /templates/:id is reachable: an unknown template id is 404, a module type still lists', async () => {
    const byId = await request(app()).get('/api/module-integration/templates/999999');
    expect(byId.status).toBe(404);
    expect(byId.body).toEqual({ error: 'Workflow template not found' });

    const byModule = await request(app()).get('/api/module-integration/templates/cmc');
    expect(byModule.status).toBe(200);
    expect(byModule.body).toEqual([]);
  });

  it('GET /document/:id for an unknown id is 404', async () => {
    const res = await request(app()).get('/api/module-integration/document/999999');
    expect(res.status).toBe(404);
  });

  it('GET /workflow-history/:id for an unknown workflow reads empty', async () => {
    const res = await request(app()).get('/api/module-integration/workflow-history/999999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /register-document for a module document already on file is 409', () => {
  it('answers 409 "already registered" and writes nothing for the second attempt', async () => {
    const body = {
      title: 'ACME-401 3.2.S.4 specification',
      documentType: 'specification',
      moduleType: 'cmc',
      originalId: 'cmc-dup-1',
    };

    const first = await request(app()).post('/api/module-integration/register-document').send(body);
    expect(first.status).toBe(201);

    const second = await request(app())
      .post('/api/module-integration/register-document')
      .send({ ...body, title: 'A second registration of the same module document' });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already registered/);
    expect(second.body).toMatchObject({ moduleType: 'cmc', originalId: 'cmc-dup-1' });

    expect(
      await count(`SELECT count(*)::int AS n FROM module_documents WHERE original_id = $1`, ['cmc-dup-1']),
    ).toBe(1);
    expect(
      await count(`SELECT count(*)::int AS n FROM unified_documents WHERE title = $1`, [
        'A second registration of the same module document',
      ]),
    ).toBe(0);
  });
});
