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

});

describe('sourced organization rules', () => {
  it('records an existing tenant correction source with the human skill change on one transaction', async () => {
    const sourceAuditEventId = '741e0191-6844-4f0c-a6f1-948914ba474a';
    const client = fakeClient(sql => {
      if (sql.includes('FROM audit_logs')) return [{ id: sourceAuditEventId, table_name: 'organization_skill_settings', action: 'ana_skill.library_disabled', record_id: 'labeling', user_id: 5 }];
      if (sql.includes('INSERT INTO account_skill_bundles')) return [{ ...STORED_ROW, metadata: { standingRule: { sourceAuditEventId } } }];
      return [];
    });
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization')
      .send({ ...SKILL, sourceAuditEventId: sourceAuditEventId.toUpperCase(), reason: REASON, createdById: 999, organizationId: 999 });
    expect(res.status).toBe(201);
    expect(res.body.skill.sourceAuditEventId).toBe(sourceAuditEventId);
    const source = client.seen.find(q => q.sql.includes('FROM audit_logs'))!;
    expect(source.params).toEqual([sourceAuditEventId, 42]);
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO account_skill_bundles'))!;
    expect(JSON.parse(insert.params[22] as string)).toEqual({ standingRule: { sourceAuditEventId } });
    expect(auditRows[0]).toMatchObject({ userId: 5, tenantId: 42 });
    expect(client.seen[0].sql).toBe('BEGIN');
    expect(client.seen.at(-1)?.sql).toBe('COMMIT');
  });

  it('persists a typed sourced approval binding and records the actual human actor', async () => {
    const sourceAuditEventId = '741e0191-6844-4f0c-a6f1-948914ba474a';
    const binding = { policyType: 'requires_approval', enforcement: 'mandatory', toolName: 'lookup_fda_guidance', description: 'Ask the regulatory lead before external guidance lookup.' };
    const row = { ...STORED_ROW, policy_bindings: [binding], metadata: { standingRule: { sourceAuditEventId } } };
    const client = fakeClient(sql => {
      if (sql.includes('FROM audit_logs')) return [{ id: sourceAuditEventId, table_name: 'organization_skill_settings', action: 'ana_skill.library_disabled', record_id: 'labeling', user_id: 5 }];
      if (sql.includes('INSERT INTO account_skill_bundles')) return [row];
      return [];
    });
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON,
      sourceAuditEventId, policyBindings: [binding], approvedBy: 'model does not choose actor', userId: 999,
    });
    expect(res.status).toBe(201);
    expect(res.body.skill.policyBindings).toEqual([binding]);
    const insert = writes(client).find(q => q.sql.includes('INSERT INTO account_skill_bundles'))!;
    expect(JSON.parse(insert.params[21] as string)).toEqual([binding]);
    expect(insert.params[19]).toBe(5);
    expect(auditRows[0]).toMatchObject({ userId: 5, action: 'ana_skill.created' });
    expect((auditRows[0].details as any).next.policyBindings).toEqual([binding]);
  });

  it('rolls a sourced rule back when its chained audit cannot be recorded', async () => {
    const sourceAuditEventId = '741e0191-6844-4f0c-a6f1-948914ba474a';
    const client = fakeClient(sql => {
      if (sql.includes('FROM audit_logs')) return [{ id: sourceAuditEventId, table_name: 'organization_skill_settings', action: 'ana_skill.library_disabled', record_id: 'labeling', user_id: 5 }];
      if (sql.includes('INSERT INTO account_skill_bundles')) return [{ ...STORED_ROW, metadata: { standingRule: { sourceAuditEventId } } }];
      return [];
    });
    auditFails.value = true;
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON, sourceAuditEventId });
    expect(res.status).toBe(500);
    expect(client.seen.at(-1)?.sql).toBe('ROLLBACK');
    expect(client.seen.some(q => q.sql === 'COMMIT')).toBe(false);
    expect(client.seen.some(q => q.sql.includes('INSERT INTO account_events'))).toBe(false);
  });

  it('refuses an unknown or foreign correction source without changing the skill', async () => {
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization')
      .send({ ...SKILL, sourceAuditEventId: '741e0191-6844-4f0c-a6f1-948914ba474a', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RULE_SOURCE_NOT_FOUND');
    expect(writes(client)).toEqual([]);
    expect(auditRows).toEqual([]);
    expect(client.seen.at(-1)?.sql).toBe('ROLLBACK');
  });

});

describe('standing rule input authority', () => {
  it.each(['optional', 'recommended'])('refuses %s enforcement and model-provided approval claims', async enforcement => {
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON,
      policyBindings: [{ policyType: 'requires_approval', enforcement, toolName: 'lookup_fda_guidance', description: 'Never query external guidance without approval.', approvedBy: 'model' }],
    });
    expect(res.status).toBe(422);
    expect(writes(client)).toEqual([]);
  });

  it.each(['execute_platform_command', 'run_agent', 'made_up_tool'])('refuses unsupported approval binding %s without creating a promise it cannot enforce', async toolName => {
    const client = fakeClient();
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, reason: REASON,
      sourceAuditEventId: '741e0191-6844-4f0c-a6f1-948914ba474a',
      policyBindings: [{ policyType: 'requires_approval', enforcement: 'mandatory', toolName, description: 'Never run this action without approval.' }],
    });
    expect(res.status).toBe(422);
    expect(writes(client)).toEqual([]);
  });

  it('does not turn a private project correction into an organization-wide source', async () => {
    const sourceAuditEventId = '741e0191-6844-4f0c-a6f1-948914ba474a';
    const client = fakeClient(sql => sql.includes('FROM audit_logs') ? [{ id: sourceAuditEventId,
      table_name: 'project_skill_settings', action: 'ana_skill.project_turned_off', record_id: '19:labeling',
      user_id: 6, new_values: { projectId: 19 } }] : []);
    const res = await request(appAs(ADMIN, client)).post('/api/ana-skills/organization').send({ ...SKILL, sourceAuditEventId, reason: REASON });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RULE_SOURCE_SCOPE_MISMATCH');
    expect(writes(client)).toEqual([]);
    expect(auditRows).toEqual([]);
  });

});

describe('changing sourced organization skills', () => {
  it('preserves a recorded correction source during an ordinary edit that omits provenance', async () => {
    const sourceAuditEventId = '741e0191-6844-4f0c-a6f1-948914ba474a';
    const row = { ...STORED_ROW, metadata: { unrelated: 'keep', standingRule: { sourceAuditEventId } } };
    const client = fakeClient(sql => {
      if (sql.includes('FOR UPDATE')) return [row];
      if (sql.includes('FROM audit_logs')) return [{ id: sourceAuditEventId, table_name: 'organization_skill_settings', action: 'ana_skill.library_disabled', record_id: 'labeling', user_id: 5 }];
      if (sql.includes('UPDATE account_skill_bundles')) return [{ ...row, version: 2 }];
      return [];
    });
    const res = await request(appAs(ADMIN, client)).put('/api/ana-skills/organization/77').send({ ...SKILL, reason: REASON });
    expect(res.status).toBe(200);
    const update = writes(client).find(q => q.sql.includes('UPDATE account_skill_bundles'))!;
    expect(JSON.parse(update.params[20] as string)).toEqual(row.metadata);
    expect(res.body.skill.sourceAuditEventId).toBe(sourceAuditEventId);
    expect((auditRows[0].details as any).next.sourceAuditEventId).toBe(sourceAuditEventId);
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

describe('how often AnA used each skill', () => {
  it('is for administrators: it describes the organization\u2019s activity', async () => {
    const client = fakeClient();
    const res = await request(appAs(MEMBER, client)).get('/api/ana-skills/usage');
    expect(res.status).toBe(403);
    expect(client.seen).toEqual([]);
  });

  it('counts the caller\u2019s own turn records, bounded, and says what it read', async () => {
    const client = fakeClient(sql => {
      if (sql.includes('AS in_window')) return [{ in_window: 41, turns_read: 41, turns_with_skills: 9 }];
      if (sql.includes('jsonb_array_elements')) return [{ key: 'cmc.stability', turns: 4, picked: 1, deployed: 2, last_used_at: '2026-10-22T09:00:00Z' }];
      return [];
    });
    const res = await request(appAs(ADMIN, client)).get('/api/ana-skills/usage?days=30');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ days: 30, turnsRead: 41, turnsWithSkills: 9, capped: false });
    expect(res.body.skills[0]).toEqual({ key: 'cmc.stability', turns: 4, picked: 1, deployed: 2, lastUsedAt: '2026-10-22T09:00:00Z' });
    expect(client.seen.every(q => q.params[0] === 42 && q.params[1] === 30)).toBe(true);
  });

  it('says when the window held more records than one read counts', async () => {
    const client = fakeClient(sql => (sql.includes('AS in_window') ? [{ in_window: 5001, turns_read: 5000, turns_with_skills: 4000 }] : []));
    const res = await request(appAs(ADMIN, client)).get('/api/ana-skills/usage?days=365');
    expect(res.body.capped).toBe(true);
  });

  it('refuses a window that is not a whole number of days', async () => {
    const res = await request(appAs(ADMIN, fakeClient())).get('/api/ana-skills/usage?days=a%20week');
    expect(res.status).toBe(400);
  });
});
