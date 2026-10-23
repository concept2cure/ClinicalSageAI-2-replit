/**
 * GRDHE reads, executes and cancels an export job, and reads and validates an
 * adverse event, by id only within the signed-in tenant: another tenant's id is
 * a 404 and nothing of that tenant's row is read or changed.
 *
 * What the code used to do (until 2026-10-22): getExportJob,
 * updateExportJobStatus, completeExportJob and getCanonicalAdverseEventById
 * selected and updated by UUID alone (`WHERE id = $1`). Only row-level
 * security scoped them, so on any connection RLS does not bind (a superuser,
 * a BYPASSRLS role, a session whose tenant setting is unset or stale) a caller
 * read another tenant's case and job, and cancelled its job.
 *
 * The router and the service are real and run on PGlite (a superuser, so RLS
 * does not filter: the predicate in the SQL is what is tested) over
 * db/migrations/081_grdhe_regulatory_mapping_layer.sql.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const MINE = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const THEIRS = '9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e';

let pg: PGlite;
const ids: Record<'mine' | 'theirs', { event: string; job: string }> = {
  mine: { event: '', job: '' },
  theirs: { event: '', job: '' },
};

function app(tenant: string) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 42, email: 'qa.lead@sponsor.example', organizationUuid: tenant };
    next();
  });
  return a;
}

async function seed(tenant: string) {
  const event = await pg.query<{ id: string }>(
    `INSERT INTO regulatory_harmonization.canonical_adverse_events
       (tenant_id, case_number, case_type, report_type, event_date, receive_date, is_serious,
        patient, reactions, suspect_products, reporter, content_hash, created_by)
     VALUES ($1, 'CASE-001', 'spontaneous', 'initial', '2026-03-10', '2026-03-15', false,
        '{"sex":"F"}', '[{"term":"Headache"}]', '[{"name":"Examplamab"}]', '{}', 'h', 'qa')
     RETURNING id`,
    [tenant]
  );
  const job = await pg.query<{ id: string }>(
    `INSERT INTO regulatory_harmonization.export_jobs
       (tenant_id, source_entity_type, source_entity_ids, source_entity_count, target_format, target_jurisdiction, status, created_by)
     VALUES ($1, 'adverse_event', ARRAY[$2::uuid], 1, 'EMA_E2B_R3', 'EMA', 'pending', 'qa') RETURNING id`,
    [tenant, event.rows[0].id]
  );
  return { event: event.rows[0].id, job: job.rows[0].id };
}

let mine: express.Express;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await pg.exec(SQL);
  holder.db = drizzle(pg);
  ids.mine = await seed(MINE);
  ids.theirs = await seed(THEIRS);
  const router = (await import('../grdheRoutes')).default;
  mine = app(MINE);
  mine.use('/api/grdhe', router);
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

const jobStatus = async (id: string) =>
  (await pg.query<{ status: string }>('SELECT status FROM regulatory_harmonization.export_jobs WHERE id = $1', [id])).rows[0].status;

describe("another tenant's id is not found", () => {
  it('GET /exports/:jobId', async () => {
    const r = await request(mine).get(`/api/grdhe/exports/${ids.theirs.job}`);
    expect(r.status, "another tenant's export job was served by id").toBe(404);
    expect(JSON.stringify(r.body)).not.toContain(THEIRS);
  });

  it('POST /exports/:jobId/execute reads nothing and changes nothing', async () => {
    const r = await request(mine).post(`/api/grdhe/exports/${ids.theirs.job}/execute`);
    expect(r.status, "another tenant's export job was executed by id").toBe(404);
    expect(await jobStatus(ids.theirs.job)).toBe('pending');
  });

  it('POST /exports/:jobId/cancel changes nothing', async () => {
    const r = await request(mine).post(`/api/grdhe/exports/${ids.theirs.job}/cancel`).send({ reason: 'x' });
    expect(r.status, "another tenant's export job was cancelled by id").toBe(404);
    expect(await jobStatus(ids.theirs.job)).toBe('pending');
    const audit = await pg.query('SELECT 1 FROM regulatory_harmonization.export_job_audit_log WHERE job_id = $1', [ids.theirs.job]);
    expect(audit.rows).toHaveLength(0);
  });

  it('GET /adverse-events/:eventId', async () => {
    const r = await request(mine).get(`/api/grdhe/adverse-events/${ids.theirs.event}`);
    expect(r.status, "another tenant's adverse event was served by id").toBe(404);
    expect(JSON.stringify(r.body)).not.toContain('Examplamab');
  });

  it('POST /adverse-events/:eventId/validate', async () => {
    const r = await request(mine).post(`/api/grdhe/adverse-events/${ids.theirs.event}/validate`).send({ targetFormat: 'EMA_AE_E2B_R3' });
    expect(r.status, "another tenant's adverse event was validated by id").toBe(404);
  });
});

describe("control: the caller's own ids are served", () => {
  it('reads its own export job and adverse event', async () => {
    expect((await request(mine).get(`/api/grdhe/exports/${ids.mine.job}`)).status).toBe(200);
    const ae = await request(mine).get(`/api/grdhe/adverse-events/${ids.mine.event}`);
    expect(ae.status).toBe(200);
    expect(ae.body.data.tenantId).toBe(MINE);
  });

  it('cancels its own export job', async () => {
    const r = await request(mine).post(`/api/grdhe/exports/${ids.mine.job}/cancel`).send({ reason: 'duplicate' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await jobStatus(ids.mine.job)).toBe('cancelled');
  });
});
