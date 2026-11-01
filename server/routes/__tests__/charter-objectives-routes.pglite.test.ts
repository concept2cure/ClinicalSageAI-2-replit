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

const h = vi.hoisted(() => ({ pg: null as any, db: null as any, admitted: new Set<number>([10, 12, 13]), readOnly: new Set<number>([13]),
  admissions: [] as Array<{ id: string; forWrite: unknown; programId?: string }> }));

vi.mock('../../db/requestDb', () => ({
  requestDb: () => h.db,
  requestPgClient: () => ({ query: (sql: string, params?: unknown[]) => h.pg.query(sql, params) }),
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({
  strictProjectRowForRef: async (_db: unknown, { ref }: { ref: string }) => (/^[0-9a-f-]{36}$/i.test(ref)
    ? ({ '1111': 10, '2222': 12, '3333': 13 } as Record<string, number>)[ref.slice(9, 13)] ?? null
    : Number.parseInt(ref, 10) || null),
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
      if (forWrite && h.readOnly.has(Number(id))) throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'No changes.');
      return { id: Number(id) };
    },
  };
});
vi.mock('../../services/auditService', () => ({ default: { logAction: async () => ({ persisted: true }) } }));
vi.mock('../../services/lumen-context/intelligence-prefix', () => ({ invalidateIntelligencePrefix: () => undefined }));
// The canonical name resolver (public.actor_name under the tenant scope), as a
// test double: user 7 is a member this tenant may name; anyone else is not.
vi.mock('../../services/tenant/actor-names', () => ({
  resolveActorNames: async (ids: Iterable<number>) => new Map([...ids].filter((id) => id === 7).map((id) => [id, { name: 'Rae Writer', email: 'rae@example.test' }])),
  actorLabel: (names: Map<number, { name: string | null }>, id: number | null | undefined) => (id == null ? null : names.get(id)?.name ?? `user ${id}`),
}));

import router from '../charters';

const ROOT = path.resolve(__dirname, '../../..');
const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const CTA_PROGRAM = '7abb1c22-2222-4222-8333-444455556666';
const READ_ONLY_PROGRAM = '7abb1c22-3333-4222-8333-444455556666';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, program_type text, primary_agency text, product_name text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', 1, 'ind', 'FDA', 'C2C-101'),
      ('${CTA_PROGRAM}', 1, 'cta', 'EU', 'C2C-202'), ('${READ_ONLY_PROGRAM}', 1, 'nda', 'FDA', 'C2C-303');
    INSERT INTO projects VALUES (10, 1, '${PROGRAM}'), (9, 1, NULL), (12, 1, '${CTA_PROGRAM}'), (13, 1, '${READ_ONLY_PROGRAM}');`);
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
    const before = h.admissions.length;
    const ok = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.history).toHaveLength(1);
    // The read is admitted in read mode; only then is write mode probed, for canChange.
    expect(h.admissions.slice(before).map((a) => a.forWrite)).toEqual([false, true]);
    const refused = await request(app()).get('/api/charters/by-project/9/objectives');
    expect(refused.status).toBe(404);
    expect(refused.body.data).toBeUndefined();
  });

  it("records the objective of a project whose filing the charter did not classify before: a CTA in the EU", async () => {
    const r = await request(app()).put(`/api/charters/by-project/${CTA_PROGRAM}/objectives`).send({ ...objective, reason: 'From the CTA protocol' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toEqual({ version: 1, unchanged: false });
    const charter = (await h.pg.query('SELECT submission_type, regulatory_region, product_name FROM project_charters WHERE project_id = 12')).rows;
    expect(charter).toEqual([{ submission_type: 'CTA', regulatory_region: 'EMA', product_name: 'C2C-202' }]);
  });

  it('says who recorded the current version and each version before it, by name where the tenant may name them', async () => {
    const r = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
    expect(r.status).toBe(200);
    expect(r.body.data.current).toMatchObject({ version: 1, updatedBy: 7, recordedBy: 'Rae Writer', locked: false });
    expect(r.body.data.history.map((e: { recordedBy: string }) => e.recordedBy)).toEqual(['Rae Writer']);
  });

  it('tells the reader whether they may record a new version: yes for a writer, no for a reader the project admits only to read', async () => {
    const writer = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
    expect(writer.body.data.canChange).toBe(true);
    const reader = await request(app()).get(`/api/charters/by-project/${READ_ONLY_PROGRAM}/objectives`);
    expect(reader.status).toBe(200);
    expect(reader.body.data).toMatchObject({ current: null, canChange: false });
    // The probe for change is the PUT's own admission, in write mode, pinned to the program.
    expect(h.admissions.at(-1)).toMatchObject({ id: '13', forWrite: true, programId: READ_ONLY_PROGRAM });
  });

  it('says a locked objective cannot be changed, even by a writer', async () => {
    await h.pg.exec("UPDATE charter_sections SET read_only = true WHERE section_key = 'objectives'");
    try {
      const r = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
      expect(r.body.data).toMatchObject({ canChange: false, current: { locked: true } });
    } finally {
      await h.pg.exec("UPDATE charter_sections SET read_only = false WHERE section_key = 'objectives'");
    }
  });

  it('fails the read, and returns no record, when the recorded objective cannot be read: never "not stated"', async () => {
    const where = "section_key = 'objectives' AND charter_id = (SELECT id FROM project_charters WHERE project_id = 10)";
    const [{ content }] = (await h.pg.query(`SELECT content FROM charter_sections WHERE ${where}`)).rows as Array<{ content: string }>;
    await h.pg.exec(`UPDATE charter_sections SET content = 'not the recorded form' WHERE ${where}`);
    try {
      const r = await request(app()).get(`/api/charters/by-project/${PROGRAM}/objectives`);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ success: false, error: 'OBJECTIVES_UNREADABLE' });
      expect(r.body.data).toBeUndefined();
    } finally {
      await h.pg.query(`UPDATE charter_sections SET content = $1 WHERE ${where}`, [content]);
    }
  });
});
