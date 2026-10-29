/**
 * The device screens' Correspondence tab reads a project's letters, and only a
 * project the reader may open (2026-10-29).
 *
 * What the code did until then: the screens name their program (a
 * regulatory_programs uuid); GET /correspondence did Number(projectId), got
 * NaN, dropped the project filter and listed every letter in the
 * organisation, other projects' and private ones included. A letter's detail
 * and an issue review checked the organisation only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const PROGRAM = '3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f';
const h = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[] }>,
  admitted: new Set<string>(),
  writable: new Set<string>(),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => { req.user = { id: 11, organizationId: 2 }; next(); },
}));
vi.mock('../../db', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    h.statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/to_regclass/.test(sql)) return { rows: [{ tbl: 'c2c_submissions' }] };
    if (/FROM projects WHERE organization_id = \$1 AND regulatory_program_id/.test(sql)) return { rows: [{ id: 7 }, { id: 8 }] };
    if (/SELECT \* FROM c2c_correspondence WHERE id = \$1/.test(sql)) return { rows: [{ id: params[0], project_id: params[0] === 'letter-private' ? 9 : 7 }] };
    if (/SELECT c.project_id FROM c2c_correspondence_issues/.test(sql)) return { rows: [{ project_id: 9 }] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, getDb: () => ({}), transaction: async (cb: (c: typeof pool) => unknown) => cb(pool) };
});
vi.mock('../c2c/project-access', () => {
  class ProjectAdmissionRefusal extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    ProjectAdmissionRefusal,
    requireProjectAdmission: async (_req: unknown, id: string, forWrite = false) => {
      if (!h.admitted.has(id)) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      if (forWrite && !h.writable.has(id)) throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'No change allowed.');
      return { id: Number(id) };
    },
  };
});

import routes from '../regulatory-correspondence';

const app = express();
app.use(express.json());
app.use('/api/regulatory-correspondence', routes);
const listSql = () => h.statements.find((s) => /FROM c2c_correspondence WHERE/.test(s.sql) && /ORDER BY received_at/.test(s.sql));

beforeEach(() => { h.statements.length = 0; h.admitted = new Set(['7']); h.writable = new Set(); });

describe('GET /correspondence is one project\'s letters', () => {
  it("lists the program's admitted project's letters only, never the organisation's", async () => {
    const res = await request(app).get(`/api/regulatory-correspondence/correspondence?projectId=${PROGRAM}`);
    expect(res.status).toBe(200);
    const list = listSql()!;
    expect(list.sql).toMatch(/project_id = ANY\(\$2::int\[\]\)/);
    expect(list.params).toEqual([2, [7]]); // project 8 anchors the program too, and this reader may not open it
  });

  it('refuses a request that names no project, and one naming a project the reader may not open', async () => {
    expect((await request(app).get('/api/regulatory-correspondence/correspondence')).status).toBe(422);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence?projectId=not-a-project')).status).toBe(422);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence?projectId=9')).status).toBe(404);
    expect(listSql()).toBeUndefined();
  });

  it("does not show a letter of a project the reader may not open", async () => {
    expect((await request(app).get('/api/regulatory-correspondence/correspondence/letter-7')).status).toBe(200);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence/letter-private')).status).toBe(404);
  });

  it("refuses an issue review by someone who may not change the letter's project, and writes nothing", async () => {
    h.admitted.add('9');
    const res = await request(app).patch('/api/regulatory-correspondence/issues/iss-1/review')
      .send({ humanReviewStatus: 'confirmed', reason: 'Reviewed against the letter text' });
    expect(res.status).toBe(403);
    expect(h.statements.some((s) => /UPDATE c2c_correspondence_issues/.test(s.sql))).toBe(false);
  });
});
