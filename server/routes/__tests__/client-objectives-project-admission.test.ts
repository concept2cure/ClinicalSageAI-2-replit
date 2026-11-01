/**
 * A project's objectives are read and written only by someone the project admits.
 *
 * Until 2026-11-01 GET /api/client-intelligence/ana/objectives filtered on the
 * organisation alone: any member could read a private project's objectives by
 * passing its id, across client workspaces. With no project it returned every
 * project's objectives. POST let an objective, its linked projects and its
 * parent point at any project of the organisation. The admission
 * (requireProjectAdmission) and the program-anchor resolution are replaced
 * here; the database records what was asked of it.
 */
import express from 'express';
import request from 'supertest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  wheres: [] as unknown[],
  inserts: [] as Array<Record<string, unknown>>,
  admitted: new Set<number>([7]),
  admissions: [] as Array<{ projectId: string; forWrite: unknown }>,
  parents: [] as unknown[],
}));

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          h.wheres.push(cond);
          return {
            orderBy: () => ({ limit: async () => [{ id: 1, objective: 'O' }] }),
            limit: async () => h.parents,
          };
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.inserts.push(v);
        return { returning: async () => [{ id: 2, ...v }] };
      },
    }),
  },
}));

vi.mock('../../services/c2c/program-project-anchor', () => ({
  strictProjectRowForRef: async (_db: unknown, { ref }: { ref: unknown }) =>
    /^[0-9a-f-]{36}$/i.test(String(ref)) ? 7 : Number.parseInt(String(ref), 10) || null,
}));

vi.mock('../c2c/project-access', () => {
  class ProjectAdmissionRefusal extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    ProjectAdmissionRefusal,
    requireProjectAdmission: async (_req: unknown, projectId: string, forWrite: unknown) => {
      h.admissions.push({ projectId, forWrite });
      if (!h.admitted.has(Number(projectId))) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return { id: Number(projectId) };
    },
  };
});

import router from '../client-intelligence';

const dialect = new PgDialect();
const sqlOf = (cond: unknown) => dialect.sqlToQuery(cond as never).sql.toLowerCase();

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 5 };
    next();
  });
  a.use('/api/client-intelligence', router);
  return a;
}

beforeEach(() => {
  h.wheres.length = 0;
  h.inserts.length = 0;
  h.admissions.length = 0;
  h.parents = [];
});

describe('GET /api/client-intelligence/ana/objectives', () => {
  it("refuses a project the person may not open, and reads none of its objectives", async () => {
    const r = await request(app()).get('/api/client-intelligence/ana/objectives?projectId=9');
    expect(r.status).toBe(404);
    expect(h.wheres).toHaveLength(0);
  });

  it("reads an admitted project's objectives, by its id or its program", async () => {
    const byId = await request(app()).get('/api/client-intelligence/ana/objectives?projectId=7');
    expect(byId.status).toBe(200);
    const byProgram = await request(app()).get('/api/client-intelligence/ana/objectives?programId=7abb1c22-1111-4222-8333-444455556666');
    expect(byProgram.status).toBe(200);
    expect(h.admissions.map((a) => a.projectId)).toEqual(['7', '7']);
    expect(sqlOf(h.wheres[1])).toContain('"project_id" = $');
  });

  it("with no project, reads the organisation's own objectives, not every project's", async () => {
    const r = await request(app()).get('/api/client-intelligence/ana/objectives');
    expect(r.status).toBe(200);
    expect(h.admissions).toHaveLength(0);
    expect(sqlOf(h.wheres[0])).toContain('"project_id" is null');
  });
});

describe('POST /api/client-intelligence/ana/objectives', () => {
  it('refuses an objective filed under a project the person may not change', async () => {
    const r = await request(app()).post('/api/client-intelligence/ana/objectives').send({ objective: 'O', category: 'clinical', projectId: 9 });
    expect(r.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
    expect(h.admissions).toEqual([{ projectId: '9', forWrite: true }]);
  });

  it('refuses a link to a project the person may not open', async () => {
    const r = await request(app()).post('/api/client-intelligence/ana/objectives').send({ objective: 'O', category: 'clinical', projectId: 7, linkedProjectIds: [7, 9] });
    expect(r.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
  });

  it("refuses a parent that is not an objective of the same project", async () => {
    h.parents = [];
    const r = await request(app()).post('/api/client-intelligence/ana/objectives').send({ objective: 'O', category: 'clinical', projectId: 7, parentObjectiveId: 44 });
    expect(r.status).toBe(404);
    expect(h.inserts).toHaveLength(0);
  });

  it("files an admitted project's objective under its own project, resolved from the program", async () => {
    const r = await request(app()).post('/api/client-intelligence/ana/objectives').send({
      objective: 'Show the primary endpoint is met, and file the NDA', category: 'regulatory',
      projectId: '7abb1c22-1111-4222-8333-444455556666', linkedProjectIds: [7],
    });
    expect(r.status).toBe(200);
    expect(h.inserts[0]).toMatchObject({ projectId: 7, linkedProjectIds: [7], organizationId: 5, createdBy: 17 });
  });
});
