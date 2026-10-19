/**
 * Who registered or changed a unified document is the authenticated user —
 * never what the request body says.
 *
 * What the routes used to do (finding 10, 2026-10-15): POST
 * /api/module-integration/register-document spread req.body into
 * registerDocument, and PATCH /documents/:id handed req.body to updateDocument
 * as it came. So created_by on the document, on its first version and on its
 * audit row, updated_by, and every audit row's performed_by were whatever the
 * body said — and so was the initial status. A PATCH body could also set
 * status, created_by, latest_version and organization_id, which moved the
 * document into another tenant. Neither route required an authenticated user.
 *
 * The real router over the real service, on the real migrations in PGlite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// The router builds its service from the shared handle when it loads, so the
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
  'migrations/20261001_domain_history_append_only.sql',
];

const ORG = 7;
const FOREIGN_ORG = 991;
const SESSION_USER = 41;
const ORIGINAL_AUTHOR = '12';
const TITLE = 'ACME-401 Module 3.2.P.8 stability summary';

/** Everything a body might use to claim an identity, a verdict or a tenant. */
const HOSTILE = {
  createdBy: 'mallory',
  updatedBy: 'mallory',
  performedBy: 'mallory',
  userId: 666,
  status: 'approved',
  organizationId: FOREIGN_ORG,
  organization_id: FOREIGN_ORG,
  tenantId: FOREIGN_ORG,
  latestVersion: 42,
};

let pg: PGlite;
let router: Router;
let seq = 0;

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

/** The app as the global /api auth gate leaves a request: a verified user, or none. */
function appAs(userId: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { tenantId: ORG });
    if (userId !== null) {
      Object.assign(req, { userId, user: { id: userId, organizationId: ORG, role: 'member' } });
    }
    next();
  });
  app.use('/api/module-integration', router);
  return app;
}

/** A document already on file, written by someone other than the session user. */
async function seedDocument(): Promise<number> {
  seq += 1;
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO unified_documents (title, document_type, status, created_by, organization_id, latest_version)
     VALUES ($1, 'stability_summary', 'draft', $2, $3, 1) RETURNING id`,
    [TITLE, ORIGINAL_AUTHOR, ORG],
  );
  const id = rows[0].id;
  await pg.query(
    `INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
     VALUES ($1, 1, '{"text":"v1"}', $2, $3)`,
    [id, ORIGINAL_AUTHOR, ORG],
  );
  await pg.query(
    `INSERT INTO module_documents (unified_document_id, module_type, original_id, organization_id)
     VALUES ($1, 'cmc', $2, $3)`,
    [id, `seeded-${seq}`, ORG],
  );
  return id;
}

async function documentRow(id: number) {
  const { rows } = await pg.query<Record<string, unknown>>(
    `SELECT title, status, created_by, updated_by, organization_id, latest_version
       FROM unified_documents WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function auditRows(documentId: number) {
  const { rows } = await pg.query<{ action: string; performed_by: string; details: Record<string, unknown> }>(
    'SELECT action, performed_by, details FROM document_audit_logs WHERE document_id = $1 ORDER BY id',
    [documentId],
  );
  return rows;
}

async function documentsWithOriginalId(originalId: string): Promise<number> {
  const { rows } = await pg.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM module_documents WHERE original_id = $1',
    [originalId],
  );
  return rows[0].n;
}

describe('POST /api/module-integration/register-document — the actor is the session user', () => {
  it('records the session user, the server status and the session tenant, whatever the body claims', async () => {
    const originalId = 'cmc-route-register-1';

    const res = await request(appAs(SESSION_USER))
      .post('/api/module-integration/register-document')
      .send({ title: TITLE, documentType: 'stability_summary', moduleType: 'cmc', originalId, ...HOSTILE });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ createdBy: String(SESSION_USER), status: 'draft', organizationId: ORG });
    const id = res.body.id as number;
    expect(await documentRow(id)).toMatchObject({
      status: 'draft',
      created_by: String(SESSION_USER),
      organization_id: ORG,
      latest_version: 1,
    });
    const { rows: versions } = await pg.query<{ created_by: string; organization_id: number }>(
      'SELECT created_by, organization_id FROM workflow_document_versions WHERE document_id = $1',
      [id],
    );
    expect(versions).toEqual([{ created_by: String(SESSION_USER), organization_id: ORG }]);
    expect((await auditRows(id)).map(r => [r.action, r.performed_by])).toEqual([
      ['document_created', String(SESSION_USER)],
    ]);
  });

  it('refuses a request with no authenticated user, and writes nothing', async () => {
    const originalId = 'cmc-route-register-anonymous';

    const res = await request(appAs(null))
      .post('/api/module-integration/register-document')
      .send({ title: TITLE, documentType: 'stability_summary', moduleType: 'cmc', originalId, ...HOSTILE });

    expect(res.status).toBe(401);
    expect(await documentsWithOriginalId(originalId)).toBe(0);
  });

  it('refuses a body without a valid module, and writes nothing', async () => {
    const originalId = 'cmc-route-register-bad-module';

    const res = await request(appAs(SESSION_USER))
      .post('/api/module-integration/register-document')
      .send({ title: TITLE, documentType: 'stability_summary', moduleType: 'not-a-module', originalId });

    expect(res.status).toBe(400);
    expect(await documentsWithOriginalId(originalId)).toBe(0);
  });
});

describe('PATCH /api/module-integration/documents/:id — the actor is the session user', () => {
  it('applies the change under the session user and audits it; status, authorship, version and tenant stay', async () => {
    const id = await seedDocument();

    const res = await request(appAs(SESSION_USER))
      .patch(`/api/module-integration/documents/${id}`)
      .send({ title: `${TITLE} (rev. 2)`, ...HOSTILE });

    expect(res.status).toBe(200);
    expect(await documentRow(id)).toEqual({
      title: `${TITLE} (rev. 2)`,
      status: 'draft',
      created_by: ORIGINAL_AUTHOR,
      updated_by: String(SESSION_USER),
      organization_id: ORG,
      latest_version: 1,
    });
    expect(await auditRows(id)).toEqual([
      {
        action: 'field_updated',
        performed_by: String(SESSION_USER),
        details: { field: 'title', previous: TITLE, current: `${TITLE} (rev. 2)` },
      },
    ]);
  });

  it('refuses a request with no authenticated user, and changes nothing', async () => {
    const id = await seedDocument();

    const res = await request(appAs(null))
      .patch(`/api/module-integration/documents/${id}`)
      .send({ title: 'Renamed anonymously', ...HOSTILE });

    expect(res.status).toBe(401);
    expect(await documentRow(id)).toMatchObject({ title: TITLE, status: 'draft', updated_by: null, organization_id: ORG });
    expect(await auditRows(id)).toEqual([]);
  });

  it('refuses a body that carries only what this route does not set, and changes nothing', async () => {
    const id = await seedDocument();

    const res = await request(appAs(SESSION_USER))
      .patch(`/api/module-integration/documents/${id}`)
      .send(HOSTILE);

    expect(res.status).toBe(400);
    expect(await documentRow(id)).toMatchObject({
      status: 'draft',
      created_by: ORIGINAL_AUTHOR,
      updated_by: null,
      organization_id: ORG,
      latest_version: 1,
    });
    expect(await auditRows(id)).toEqual([]);
  });
});
