/**
 * GET/PUT /api/charters/by-project/:ref/objectives answer only for a project
 * the person may open (to read) or change (to record), on the real charter
 * tables (the charter migrations run in PGlite).
 *
 * The admission (requireProjectAdmission) and the program-anchor resolution
 * are replaced. The request's database is PGlite, through drizzle and raw
 * queries alike, as requestDb and requestPgClient hand them out.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as any, db: null as any, admitted: new Set<number>([10]), admissions: [] as Array<{ id: string; forWrite: unknown; programId?: string }> }));

vi.mock('../../db/requestDb', () => ({
  requestDb: () => h.db,
  requestPgClient: () => ({ query: (sql: string, params?: unknown[]) => h.pg.query(sql, params) }),
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({
  strictProjectRowForRef: async (_db: unknown, { ref }: { ref: string }) => (/^[0-9a-f-]{36}$/i.test(ref) ? 10 : Number.parseInt(ref, 10) || null),
}));
vi.mock('../c2c/project-access', () => {
  class ProjectAdmissionRefusal extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    ProjectAdmissionRefusal,
    requireProjectAdmission: async (_req: unknown, id: string, forWrite: unknown, pinned?: { programId?: string }) => {
      h.admissions.push({ id, forWrite, programId: pinned?.programId });
      if (!h.admitted.has(Number(id))) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return { id: Number(id) };
    },
  };
});
vi.mock('../../services/auditService', () => ({ default: { logAction: async () => ({ persisted: true }) } }));
vi.mock('../../services/lumen-context/intelligence-prefix', () => ({ invalidateIntelligencePrefix: () => undefined }));

import router from '../charters';

const ROOT = path.resolve(__dirname, '../../..');
const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, program_type text, primary_agency text, product_name text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', 1, 'ind', 'FDA', 'C2C-101');
    INSERT INTO projects VALUES (10, 1, '${PROGRAM}'), (9, 1, NULL);`);
  for (const f of ['0012_project_charter_timeline.sql', '20260629_charter_tables_rebuild.sql', '20260911_charter_audit_immutability.sql', '20260917_project_charters_declared_columns.sql']) {
    await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
  }
  h.db = drizzle(h.pg);
});
afterAll(async () => { await h.pg.close(); });

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).user = { id: 7, userId: 7, organizationId: 1 }; (req as any).organizationId = 1; next(); });
  a.use('/api/charters', router);
  return a;
}

const objective = { objective: 'Show C2C-101 is safe and tolerable at the proposed doses, and open the IND.', sources: [{ kind: 'protocol', title: 'Protocol C2C-101-201', locator: 'Section 2' }], reason: 'From the protocol' };

describe('the project objective routes', () => {
  it("refuses to record a project's objective for someone the project does not admit, and writes nothing", async () => {
    const r = await request(app()).put('/api/charters/by-project/9/objectives').send(objective);
    expect(r.status).toBe(404);
    expect((await h.pg.query('SELECT 1 FROM charter_sections')).rows).toHaveLength(0);
    expect(h.admissions.at(-1)).toMatchObject({ id: '9', forWrite: true });
  });

  it('refuses a version with no reason, without echoing the text', async () => {
    const r = await request(app()).put(`/api/charters/by-project/${PROGRAM}/objectives`).send({ objective: 'Secret study aim', sources: [] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain('Secret study aim');
  });

  it('records it for an admitted project, from its program, pinned to that program', async () => {
    const r = await request(app()).put(`/api/charters/by-project/${PROGRAM}/objectives`).send(objective);
    expect(r.status).toBe(200);
    expect(r.body.meta).toEqual({ version: 1, unchanged: false });
    expect(r.body.data.current.content.objective).toBe(objective.objective);
    expect(h.admissions.at(-1)).toMatchObject({ id: '10', forWrite: true, programId: PROGRAM });
    const charter = (await h.pg.query('SELECT submission_type, regulatory_region, product_name FROM project_charters')).rows;
    expect(charter).toEqual([{ submission_type: 'IND', regulatory_region: 'FDA', product_name: 'C2C-101' }]);
  });

  it('reads it back for an admitted reader, and refuses one the project does not admit', async () => {
    const ok = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.history).toHaveLength(1);
    expect(h.admissions.at(-1)).toMatchObject({ forWrite: false });
    const refused = await request(app()).get('/api/charters/by-project/9/objectives');
    expect(refused.status).toBe(404);
    expect(refused.body.data).toBeUndefined();
  });
});
