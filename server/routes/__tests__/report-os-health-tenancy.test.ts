import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle> | null }));
vi.mock('../../db', () => ({
  get db() { return holder.db; }, getDb: () => holder.db,
  getPool: () => ({ query: async () => ({rows:[]}) }), pool: {query:async () => ({rows:[]})},
}));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../utils/authedOrgId')>()), authedOrgId: () => 7 }));

import reportOsRouter from '../report-os';

const app = express();
app.use((req, _res, next) => {
  (req as unknown as {user:{id:number;organizationId:number;role:string}}).user = {id:5,organizationId:7,role:req.get('x-test-role') ?? 'manager'};
  next();
});
app.use('/api/report-os', reportOsRouter);

let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE report_program_groups(organization_id int);
    CREATE TABLE report_type_registry(type_id text);
    CREATE TABLE report_runs(organization_id int);
    CREATE TABLE report_snapshots(organization_id int);
    CREATE TABLE report_run_dependencies(organization_id int);
    CREATE TABLE project_memory_entries(organization_id int,category text,subcategory text,source_document_type text);
    INSERT INTO report_program_groups VALUES(7),(8),(8);
    INSERT INTO report_type_registry VALUES('global1'),('global2'),('global3');
    INSERT INTO report_runs VALUES(7),(8),(8);
    INSERT INTO report_snapshots VALUES(7),(8),(8);
    INSERT INTO report_run_dependencies VALUES(7),(8),(8);
    INSERT INTO project_memory_entries VALUES
      (7,'regulatory','report_bundle_record','report_os_state'),
      (8,'regulatory','report_bundle_record','report_os_state'),
      (8,'regulatory','report_bundle_record','report_os_state'),
      (7,'regulatory','report_delivery_record','report_os_state'),
      (8,'regulatory','report_delivery_record','report_os_state'),
      (8,'regulatory','report_delivery_record','report_os_state');
  `);
  holder.db = drizzle(database);
});
afterAll(async () => { await database?.close(); });

describe('reporting diagnostics without database RLS', () => {
  it('counts only the authenticated organization while keeping the global taxonomy count', async () => {
    const result = await request(app).get('/api/report-os/health');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({groups:1,taxonomyTypes:3,runs:1,snapshots:1,dependencies:1,bundles:1,deliveries:1});
  });
  it('does not disclose private-project organization totals to an ordinary reader', async () => {
    const result = await request(app).get('/api/report-os/health').set('x-test-role','member');
    expect(result.status).toBe(403);
    expect(result.body.data).toBeUndefined();
  });
});
