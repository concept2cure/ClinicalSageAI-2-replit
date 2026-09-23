/**
 * POST /api/protocol-development/documents/:id/study-design (bind)
 * POST /api/protocol-development/documents/:id/study-design/remove (unbind)
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md step 1b. The two routes carry the
 * same ceremony as every other write on this router — `governedScoped`: the
 * request-scoped tenant connection, BEGIN → write → recordGovernedAction →
 * COMMIT, a governed reason of at least 8 characters, and org scoping that
 * makes another organisation's protocol a 404 rather than a silent no-op.
 *
 * The store is in-process PGlite so the tenant scoping is proven against real
 * SQL; `recordGovernedAction` is a spy, because the ledger's own contract
 * (audit chain, c2c_ana_actions, audit_logs) is proven in its own suite — what
 * matters here is that the route records the action, with the right command,
 * target, reason and domain, inside the same transaction as the write.
 */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let pglite: PGlite;
const query = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[] };
};
const client = { query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined };

vi.mock('../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => query(s, p), connect: async () => client },
  db: {},
}));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => client }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));

const recordGovernedAction = vi.hoisted(() => vi.fn());
vi.mock('../c2c/actions', () => ({ recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...a) }));

import protocolDevelopmentRouter from '../protocol-development';

const ORG = 7;
const OTHER = 9;
const USER = 11;
const STUDY = 'sd_route_test';

const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int, protocol_kind text, title text, version text, status text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz, study_design_id text, study_design_linked_at timestamptz, study_design_linked_by int);
CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id int, study_id varchar(100) UNIQUE, protocol_title text, study_phase varchar(20), indication text, protocol_status varchar(50), metadata json, updated_at timestamptz DEFAULT now());
`;

function appAs(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = USER;
    if (org != null) (req as any).tenantId = org;
    next();
  });
  app.use('/api/protocol-development', protocolDevelopmentRouter);
  return app;
}

let docId = 0;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });

beforeEach(async () => {
  recordGovernedAction.mockReset();
  recordGovernedAction.mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'abc' });
  await pglite.exec(`DELETE FROM protocol_documents; DELETE FROM cdisc_prm_studies;`);
  const d = await pglite.query<{ id: number }>(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, version, status)
     VALUES ($1,'clinical','A Phase 3 Study','0.3','in_development') RETURNING id`, [ORG],
  );
  docId = d.rows[0].id;
  await pglite.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_title, study_phase, indication, protocol_status, metadata)
     VALUES ($1,$2,'A Phase 3 Study','3','type 2 diabetes','draft',$3)`,
    [ORG, STUDY, JSON.stringify({ kind: 'c2c.studyDesign.v1', design: { title: 'A Phase 3 Study' } })],
  );
});

describe('POST /api/protocol-development/documents/:id/study-design', () => {
  it('binds the design and records the governed action', async () => {
    const res = await request(appAs(ORG))
      .post(`/api/protocol-development/documents/${docId}/study-design`)
      .send({ studyDesignId: STUDY, reason: 'Converging the protocol onto its design object.' });
    expect(res.status).toBe(201);
    expect(res.body.studyDesignId).toBe(STUDY);

    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const arg = recordGovernedAction.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.command).toBe('update');
    expect(arg.target).toBe(`protocol-document:${docId}`);
    expect(arg.domain).toBe('protocol_development');
    expect(arg.orgId).toBe(ORG);
    expect(String(arg.reason)).toContain('Converging');
    expect((arg.payload as Record<string, unknown>).studyDesignId).toBe(STUDY);

    const row = await pglite.query<{ study_design_id: string }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(row.rows[0].study_design_id).toBe(STUDY);
  });

  it('404s for another organization\'s protocol and writes nothing', async () => {
    const res = await request(appAs(OTHER))
      .post(`/api/protocol-development/documents/${docId}/study-design`)
      .send({ studyDesignId: STUDY, reason: 'Trying to bind across a tenant boundary.' });
    expect(res.status).toBe(404);
    expect(recordGovernedAction).not.toHaveBeenCalled();
    const row = await pglite.query<{ study_design_id: string | null }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(row.rows[0].study_design_id).toBeNull();
  });

  it('404s for a design that is not this tenant\'s', async () => {
    await pglite.query(`UPDATE cdisc_prm_studies SET tenant_id = $1 WHERE study_id = $2`, [OTHER, STUDY]);
    const res = await request(appAs(ORG))
      .post(`/api/protocol-development/documents/${docId}/study-design`)
      .send({ studyDesignId: STUDY, reason: 'Binding a design this tenant does not own.' });
    expect(res.status).toBe(404);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('refuses a reason shorter than the governed minimum', async () => {
    const res = await request(appAs(ORG))
      .post(`/api/protocol-development/documents/${docId}/study-design`)
      .send({ studyDesignId: STUDY, reason: 'short' });
    expect(res.status).toBe(400);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('401s without authentication context', async () => {
    const res = await request(appAs(null))
      .post(`/api/protocol-development/documents/${docId}/study-design`)
      .send({ studyDesignId: STUDY, reason: 'No tenant on this request at all.' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/protocol-development/documents/:id/study-design/remove', () => {
  it('unbinds and records the governed action', async () => {
    await pglite.query(`UPDATE protocol_documents SET study_design_id = $1 WHERE id = $2`, [STUDY, docId]);
    const res = await request(appAs(ORG))
      .post(`/api/protocol-development/documents/${docId}/study-design/remove`)
      .send({ reason: 'The design was bound to the wrong protocol.' });
    expect(res.status).toBe(201);
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const arg = recordGovernedAction.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.target).toBe(`protocol-document:${docId}`);
    expect((arg.payload as Record<string, unknown>).studyDesignId).toBeNull();
    const row = await pglite.query<{ study_design_id: string | null }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(row.rows[0].study_design_id).toBeNull();
  });

  it('404s for another organization\'s protocol', async () => {
    await pglite.query(`UPDATE protocol_documents SET study_design_id = $1 WHERE id = $2`, [STUDY, docId]);
    const res = await request(appAs(OTHER))
      .post(`/api/protocol-development/documents/${docId}/study-design/remove`)
      .send({ reason: 'Trying to unbind across a tenant boundary.' });
    expect(res.status).toBe(404);
    const row = await pglite.query<{ study_design_id: string | null }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(row.rows[0].study_design_id).toBe(STUDY);
  });
});
