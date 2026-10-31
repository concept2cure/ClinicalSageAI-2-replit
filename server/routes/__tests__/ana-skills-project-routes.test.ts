/**
 * /api/ana-skills for a project and for the composer: who may deploy a skill
 * to a project or turn one off there, with what record; what the composer may
 * pick; and a draft tried before it is saved.
 *
 * The project is resolved and admitted the way AnA's turn admits it
 * (admitAnaProjectScope), and a change also needs the project's write
 * admission (requireProjectAdmission). Both are stubbed here at their seams:
 * their own tests prove them; these prove the routes ask them, and stop when
 * they refuse.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const auditRows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../services/auditService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: async (_client: unknown, entry: Record<string, unknown>) => {
    auditRows.push(entry);
  },
}));
vi.mock('../../db', () => ({ pool: { query: vi.fn(), connect: vi.fn() }, getPool: () => ({ query: vi.fn() }) }));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const admission = vi.hoisted(() => ({ read: true, write: true, projectId: 9 }));
vi.mock('../../services/ana/project-scope-admission', async importOriginal => {
  const real = await importOriginal<typeof import('../../services/ana/project-scope-admission')>();
  return {
    ...real,
    admitAnaProjectScope: vi.fn(async (_q: unknown, input: { projectRef: unknown }) => {
      if (!admission.read) throw new real.AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.');
      return { projectId: admission.projectId, programId: String(input.projectRef), projectRef: String(input.projectRef) };
    }),
  };
});
vi.mock('../c2c/project-access', async importOriginal => {
  const real = await importOriginal<typeof import('../c2c/project-access')>();
  return {
    ...real,
    requireProjectAdmission: vi.fn(async (_req: unknown, _id: unknown, forWrite?: boolean) => {
      if (forWrite && !admission.write) {
        throw new real.ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'Your current role and project permissions do not allow changes to this record.');
      }
      return {};
    }),
  };
});

import skillsRouter from '../ana-skills';

interface Seen {
  sql: string;
  params: unknown[];
}

function fakeClient(rowsFor: (sql: string) => Array<Record<string, unknown>> = () => []) {
  const seen: Seen[] = [];
  return {
    seen,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      seen.push({ sql, params });
      return { rows: rowsFor(sql), rowCount: 1 };
    }),
  };
}

function appAs(user: Record<string, unknown>, client: ReturnType<typeof fakeClient>) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = user;
    (req as unknown as { dbClient: unknown }).dbClient = client;
    next();
  });
  app.use('/api/ana-skills', skillsRouter);
  return app;
}

const EDITOR = { id: 5, organizationId: 42, role: 'member', roles: ['member'], name: 'Pat Editor' };
const REASON = 'This program files its labeling with every sequence.';
const PROGRAM = '0f3c1a2b-1111-4222-8333-444455556666';
const writes = (c: ReturnType<typeof fakeClient>) => c.seen.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql));

beforeEach(() => {
  auditRows.length = 0;
  admission.read = true;
  admission.write = true;
  admission.projectId = 9;
});

describe('deploying a skill to a project, or turning one off there', () => {
  it('refuses a person the project does not admit to change it, and writes nothing', async () => {
    admission.write = false;
    const client = fakeClient();
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: 'always', reason: REASON });
    expect(res.status).toBe(403);
    expect(writes(client)).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it('refuses a change with no reason', async () => {
    const client = fakeClient();
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: 'always', reason: 'ok' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(writes(client)).toEqual([]);
  });

  it('deploys to the project the program resolves to, with the reason and its audit row', async () => {
    const client = fakeClient();
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: 'always', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: 'labeling', projectId: 9, changed: true, state: 'always', audited: true });
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO project_skill_settings'))!;
    expect(insert.params).toEqual([42, 9, 'labeling', 'always', REASON, 5]);
    expect(auditRows[0]).toMatchObject({ tenantId: 42, action: 'ana_skill.project_deployed', resourceId: '9:labeling', reason: REASON });
  });

  it('refuses a fourth deployed skill, and writes nothing', async () => {
    const deployed = ['cmc', 'biostatistics', 'clinical'].map(k => ({ skill_key: k, state: 'always' }));
    const client = fakeClient(sql => (sql.includes('FROM project_skill_settings') ? deployed : []));
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: 'always', reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_SKILLS_FULL');
    expect(writes(client)).toEqual([]);
  });

  it('refuses to deploy a skill the organization turned off', async () => {
    const client = fakeClient(sql => (sql.includes('FROM organization_skill_settings') ? [{ skill_key: 'labeling', enabled: false, reason: 'Not ours.', updated_at: null }] : []));
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: 'always', reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SKILL_NOT_ON');
    expect(writes(client)).toEqual([]);
  });

  it('clears the project’s setting, and records that', async () => {
    const client = fakeClient(sql => (sql.includes('FROM project_skill_settings') ? [{ skill_key: 'labeling', state: 'off' }] : []));
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/settings/labeling`).send({ state: null, reason: REASON });
    expect(res.status).toBe(200);
    expect(writes(client).some(q => q.sql.includes('DELETE FROM project_skill_settings'))).toBe(true);
    expect(auditRows[0]).toMatchObject({ action: 'ana_skill.project_cleared' });
  });

  it('refuses a project the person cannot read', async () => {
    admission.read = false;
    const res = await request(appAs(EDITOR, fakeClient())).get(`/api/ana-skills/projects/${PROGRAM}`);
    expect(res.status).toBe(403);
  });

  // 2026-10-31, found in the running app: the session carries its ids as strings ("1", "2"), the
  // project admission accepts only numbers, so every project home answered 403 to its own admin.
  it('admits a person whose session states the ids as strings, as numbers', async () => {
    const { admitAnaProjectScope } = await import('../../services/ana/project-scope-admission');
    vi.mocked(admitAnaProjectScope).mockClear();
    const res = await request(appAs({ ...EDITOR, id: '5', organizationId: '42' }, fakeClient())).get(`/api/ana-skills/projects/${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(admitAnaProjectScope).mock.calls[0][1]).toMatchObject({ organizationId: 42, userId: 5 });
  });
});

describe('a skill written for a project', () => {
  const SKILL = {
    name: 'Our labeling cadence',
    description: 'How this program keeps its labeling current with each sequence.',
    instructions: '## Method\nCompare the draft label to the last filed one, section by section.',
    disciplines: ['labeling'],
    useCases: ['review'],
    triggers: ['labeling cadence'],
    status: 'active',
  };

  it('is stored against the admitted project, whatever project the body names', async () => {
    const client = fakeClient(sql => (sql.includes('INSERT INTO account_skill_bundles') ? [{ id: 1, bundle_id: 'bundle_1', status: 'active', version: 1, project_id: 9 }] : []));
    const res = await request(appAs(EDITOR, client)).post(`/api/ana-skills/projects/${PROGRAM}/skills`).send({ ...SKILL, projectId: 12345, reason: REASON });
    expect(res.status).toBe(201);
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO account_skill_bundles'))!;
    expect(insert.params[20]).toBe(9);
    expect(auditRows[0]).toMatchObject({ action: 'ana_skill.created' });
  });

  it('cannot replace a library skill: that is the organization’s decision', async () => {
    const client = fakeClient();
    const res = await request(appAs(EDITOR, client))
      .post(`/api/ana-skills/projects/${PROGRAM}/skills`)
      .send({ ...SKILL, extendsSkillKey: 'labeling', extensionMode: 'replace', reason: REASON });
    expect(res.status).toBe(422);
    expect(writes(client)).toEqual([]);
  });

  it('is changed from its own project only', async () => {
    const client = fakeClient(sql => (sql.includes('SELECT project_id FROM account_skill_bundles') ? [{ project_id: 10 }] : []));
    const res = await request(appAs(EDITOR, client)).put(`/api/ana-skills/projects/${PROGRAM}/skills/1`).send({ ...SKILL, reason: REASON });
    expect(res.status).toBe(404);
    expect(writes(client)).toEqual([]);
  });
});

describe('what the composer can pick, and a draft tried before it is saved', () => {
  it('lists what is on, leaves out what the project turned off, and marks what it deploys', async () => {
    const client = fakeClient(sql =>
      sql.includes('FROM project_skill_settings')
        ? [
            { skill_key: 'labeling', state: 'off', reason: REASON, updated_at: null },
            { skill_key: 'cmc', state: 'always', reason: REASON, updated_at: null },
          ]
        : [],
    );
    const res = await request(appAs(EDITOR, client)).get(`/api/ana-skills/available?project=${PROGRAM}`);
    expect(res.status).toBe(200);
    const keys = res.body.skills.map((s: { key: string }) => s.key);
    expect(keys).not.toContain('labeling');
    expect(res.body.skills.find((s: { key: string }) => s.key === 'cmc').projectState).toBe('always');
  });

  it('loads an unsaved draft for a question its trigger phrase is in, and stores nothing', async () => {
    const client = fakeClient();
    const res = await request(appAs(EDITOR, client))
      .post('/api/ana-skills/test')
      .send({
        message: 'Walk me through our zebra protocol review.',
        draft: {
          name: 'Zebra protocol review',
          description: 'How our team reviews a zebra protocol before it is filed.',
          instructions: '## Method\nRead the protocol against our checklist and list each gap.',
          disciplines: ['clinical'],
          useCases: ['review'],
          triggers: ['zebra protocol'],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.draftKey).toBe('org:draft');
    expect(res.body.selection.selected.map((s: { key: string }) => s.key)).toContain('org:draft');
    expect(writes(client)).toEqual([]);
  });

  it('reads a skill’s versions from its audit rows', async () => {
    const client = fakeClient(sql => {
      if (sql.includes('SELECT bundle_id FROM account_skill_bundles')) return [{ bundle_id: 'bundle_1' }];
      if (sql.includes('FROM audit_logs')) {
        return [{ occurred_at: '2026-10-22T10:00:00Z', action: 'ana_skill.updated', reason: REASON, actor_name: 'Pat Editor', new_values: { next: { version: 2, status: 'active', instructions: '## Method\nv2' } } }];
      }
      return [];
    });
    const res = await request(appAs(EDITOR, client)).get('/api/ana-skills/organization/1/history');
    expect(res.status).toBe(200);
    expect(res.body.history[0]).toMatchObject({ version: 2, actorName: 'Pat Editor', reason: REASON, action: 'ana_skill.updated' });
    const read = client.seen.find(q => q.sql.includes('FROM audit_logs'))!;
    expect(read.params.slice(0, 2)).toEqual([42, 'bundle_1']);
  });
});
