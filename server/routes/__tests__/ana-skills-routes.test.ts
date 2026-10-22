/**
 * /api/ana-skills — who may change the skills AnA follows for an organization,
 * on whose organization, with what record.
 *
 * The bundle routes this replaces (/api/account-intelligence/bundles) let any
 * member rewrite the organization's instructions with no reason and no audit
 * row. Here: reads for members, changes for administrators only, a stated
 * reason required, the organization from the verified session (never the
 * body), and the change committed with its chained audit row or not at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const auditRows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const auditFails = vi.hoisted(() => ({ value: false }));
vi.mock('../../services/auditService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: async (_client: unknown, entry: Record<string, unknown>) => {
    if (auditFails.value) throw new Error('audit chain refused the row');
    auditRows.push(entry);
  },
}));
vi.mock('../../db', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import skillsRouter from '../ana-skills';

interface Seen {
  sql: string;
  params: unknown[];
}

/** The request-scoped client the auth gate attaches, answering by statement. */
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

function appAs(user: Record<string, unknown> | null, client: ReturnType<typeof fakeClient>) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    (req as unknown as { dbClient: unknown }).dbClient = client;
    next();
  });
  app.use('/api/ana-skills', skillsRouter);
  return app;
}

const ADMIN = { id: 5, organizationId: 42, role: 'admin', roles: ['admin'], name: 'Dana Admin' };
const MEMBER = { id: 6, organizationId: 42, role: 'member', roles: ['member'] };
const REASON = 'Our CMC group follows its own stability SOP.';
const LIBRARY_KEY = 'therapeutic-area';

const SKILL = {
  name: 'Batch record review',
  description: 'How our QA group reviews an executed batch record before release.',
  instructions: 'Check each step against the master record, then list every deviation with its reference.',
  disciplines: ['quality-systems'],
  useCases: ['review'],
  triggers: ['Batch Record Review', 'executed batch record'],
  tools: ['lookup_fda_guidance'],
  status: 'active',
};

const STORED_ROW = {
  id: 77,
  bundle_id: 'bundle_77',
  name: SKILL.name,
  description: SKILL.description,
  bundle_type: 'review',
  prompt_fragments: [{ role: 'instruction', content: SKILL.instructions, priority: 5 }],
  module_types: SKILL.disciplines,
  work_types: SKILL.useCases,
  submission_types: [],
  regulatory_regions: [],
  segments: [],
  therapeutic_areas: [],
  surfaces: [],
  document_types: [],
  triggers: ['batch record review', 'executed batch record'],
  tool_names: SKILL.tools,
  extends_skill_key: null,
  extension_mode: null,
  status: 'active',
  version: 1,
  updated_at: '2026-10-22T12:00:00Z',
};

beforeEach(() => {
  auditRows.length = 0;
  auditFails.value = false;
});

const writes = (c: ReturnType<typeof fakeClient>) => c.seen.filter(q => /^\s*(INSERT|UPDATE)/i.test(q.sql));

describe('turning a library skill on or off', () => {
  it('refuses a member', async () => {
    const client = fakeClient();
    const res = await request(appAs(MEMBER, client)).put(`/api/ana-skills/library/${LIBRARY_KEY}/enabled`).send({ enabled: false, reason: REASON });
    expect(res.status).toBe(403);
    expect(writes(client)).toEqual([]);
  });

  it('refuses an administrator who states no reason', async () => {
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client)).put(`/api/ana-skills/library/${LIBRARY_KEY}/enabled`).send({ enabled: false, reason: 'ok' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(writes(client)).toEqual([]);
  });

  it('refuses a skill the library does not hold', async () => {
    const res = await request(appAs(ADMIN, fakeClient())).put('/api/ana-skills/library/no.such.skill/enabled').send({ enabled: false, reason: REASON });
    expect(res.status).toBe(404);
  });

  it('writes the caller’s organization, with the reason, and its audit row, in one transaction', async () => {
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client))
      .put(`/api/ana-skills/library/${LIBRARY_KEY}/enabled`)
      .send({ enabled: false, reason: REASON, organizationId: 999 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: LIBRARY_KEY, changed: true, enabled: false, audited: true });
    const sqls = client.seen.map(q => q.sql.trim().split(/\s+/)[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    const upsert = writes(client)[0];
    expect(upsert.sql).toContain('INSERT INTO organization_skill_settings');
    expect(upsert.params.slice(0, 5)).toEqual([42, LIBRARY_KEY, false, REASON, 5]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      tenantId: 42,
      userId: 5,
      action: 'ana_skill.library_disabled',
      resourceId: LIBRARY_KEY,
      reason: REASON,
      details: { skillKey: LIBRARY_KEY, previousEnabled: true, enabled: false, reason: REASON },
    });
  });

  it('records nothing when the skill already has that value', async () => {
    const client = fakeClient(sql => (sql.includes('SELECT enabled FROM organization_skill_settings') ? [{ enabled: false }] : []));
    const res = await request(appAs(ADMIN, client)).put(`/api/ana-skills/library/${LIBRARY_KEY}/enabled`).send({ enabled: false, reason: REASON });
    expect(res.body).toMatchObject({ changed: false, audited: false });
    expect(writes(client)).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it('rolls the change back when its audit row is refused', async () => {
    auditFails.value = true;
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client)).put(`/api/ana-skills/library/${LIBRARY_KEY}/enabled`).send({ enabled: false, reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('The skill was not changed.');
    const sqls = client.seen.map(q => q.sql.trim().split(/\s+/)[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});

describe('an organization’s own skills', () => {
  it('refuses a member who tries to create one', async () => {
    const client = fakeClient();
    const res = await request(appAs(MEMBER, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON });
    expect(res.status).toBe(403);
    expect(writes(client)).toEqual([]);
  });

  it('refuses a tool AnA does not have at launch, naming the field', async () => {
    const res = await request(appAs(ADMIN, fakeClient()))
      .post('/api/ana-skills/organization')
      .send({ ...SKILL, tools: ['make_up_a_number'], reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('tools');
  });

  it('accepts an active skill with no trigger phrase: it loads when someone picks it or deploys it', async () => {
    const client = fakeClient(sql => (sql.includes('INSERT INTO account_skill_bundles') ? [{ ...STORED_ROW, triggers: [] }] : []));
    const res = await request(appAs(ADMIN, client))
      .post('/api/ana-skills/organization')
      .send({ ...SKILL, triggers: [], reason: REASON });
    expect(res.status).toBe(201);
  });

  it('writes an organization skill for the whole organization, whatever project the body names', async () => {
    const client = fakeClient(sql => (sql.includes('INSERT INTO account_skill_bundles') ? [STORED_ROW] : []));
    const res = await request(appAs(ADMIN, client))
      .post('/api/ana-skills/organization')
      .send({ ...SKILL, projectId: 9, reason: REASON });
    expect(res.status).toBe(201);
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO account_skill_bundles'))!;
    expect(insert.params[20]).toBeNull();
  });

  it('refuses an extension that does not say whether it adds or replaces', async () => {
    const res = await request(appAs(ADMIN, fakeClient()))
      .post('/api/ana-skills/organization')
      .send({ ...SKILL, extendsSkillKey: LIBRARY_KEY, reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('extensionMode');
  });

  it('creates one in the caller’s organization, with its audit row and ledger event on the same transaction', async () => {
    const client = fakeClient(sql => (sql.includes('INSERT INTO account_skill_bundles') ? [STORED_ROW] : []));
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON });
    expect(res.status).toBe(201);
    expect(res.body.skill).toMatchObject({ key: 'org:bundle_77', name: SKILL.name, status: 'active', version: 1 });
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO account_skill_bundles'))!;
    expect(insert.params[1]).toBe(42);
    // Triggers are stored as the selector matches them: lowercase, single-spaced.
    expect(JSON.parse(insert.params[13] as string)).toEqual(['batch record review', 'executed batch record']);
    expect(writes(client).some(q => q.sql.includes('INSERT INTO account_events'))).toBe(true);
    expect(auditRows[0]).toMatchObject({ tenantId: 42, action: 'ana_skill.created', reason: REASON, resourceId: 'bundle_77' });
    expect((auditRows[0].details as Record<string, unknown>).previous).toBeNull();
  });

  it('refuses to change a locked skill and writes nothing', async () => {
    const client = fakeClient(sql => (sql.includes('FOR UPDATE') ? [{ ...STORED_ROW, status: 'locked' }] : []));
    const res = await request(appAs(ADMIN, client)).put('/api/ana-skills/organization/77').send({ ...SKILL, reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOCKED');
    expect(writes(client)).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it('records the skill before and after a change', async () => {
    const client = fakeClient(sql => {
      if (sql.includes('FOR UPDATE')) return [STORED_ROW];
      if (sql.includes('UPDATE account_skill_bundles')) return [{ ...STORED_ROW, name: 'Batch record review v2', version: 2 }];
      return [];
    });
    const res = await request(appAs(ADMIN, client))
      .put('/api/ana-skills/organization/77')
      .send({ ...SKILL, name: 'Batch record review v2', reason: REASON });
    expect(res.status).toBe(200);
    const details = auditRows[0].details as { previous: { name: string; version: number }; next: { name: string; version: number } };
    expect(details.previous).toMatchObject({ name: SKILL.name, version: 1 });
    expect(details.next).toMatchObject({ name: 'Batch record review v2', version: 2 });
  });
});

describe('reading and testing', () => {
  it('lets a member read the library as the organization set it', async () => {
    const client = fakeClient(sql =>
      sql.includes('FROM organization_skill_settings')
        ? [{ skill_key: LIBRARY_KEY, enabled: false, reason: REASON, updated_by_id: 5, updated_at: '2026-10-22T12:00:00Z' }]
        : [],
    );
    const res = await request(appAs(MEMBER, client)).get('/api/ana-skills/library');
    expect(res.status).toBe(200);
    const root = res.body.skills.find((s: { key: string }) => s.key === LIBRARY_KEY);
    expect(root.enabled).toBe(false);
    expect(client.seen.every(q => q.params[0] === 42)).toBe(true);
  });

  it('explains which skills a question would load, recording nothing', async () => {
    const client = fakeClient();
    const res = await request(appAs(MEMBER, client))
      .post('/api/ana-skills/test')
      .send({ message: 'What do reviewers expect for HbA1c endpoints in type 2 diabetes?' });
    expect(res.status).toBe(200);
    expect(res.body.selection.selected[0].key).toBe('therapeutic-area.metabolic');
    expect(res.body.selection.selected[0].reasons[0]).toContain('asked about');
    expect(writes(client)).toEqual([]);
  });
});
