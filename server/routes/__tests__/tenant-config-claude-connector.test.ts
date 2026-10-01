/**
 * P1-47 (ADR-0014 §10): the connector for Claude is enabled or disabled for an
 * organization by that organization's owner or administrator, and by no one
 * else — not a manager, member or viewer, not platform staff, not the
 * administrator or owner of another organization. IAM-25 (product owner,
 * 2026-10-01): no product path writes `owner` to organization_users.role, and
 * the administrator is the customer's highest in-product role, so the
 * administrator opens it; `owner` stays admitted in case one is ever
 * provisioned. The change goes through tenant-config's one audited settings
 * writer, so the setting and its chained audit row (with the value before and
 * after) commit or roll back together. The settings doors that write arbitrary
 * sections refuse the connector's, whoever asks, so its own door is the only one.
 *
 *   GET  /:tenantId/claude-connector   { connector: { enabled, canChange } }, any member of the organization
 *   PUT  /:tenantId/claude-connector   { enabled }, the organization's owner or administrator only
 *
 * Absent means disabled. The request's connection and its Drizzle handle are
 * recorders sharing one ordered log, as in tenant-config-audit.test.ts;
 * server/mcp/__tests__/mcp-connector-enablement.dbtest.ts proves the same on
 * PostgreSQL through the production auth boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  log: [] as string[],
  tenant: null as null | { id: number; tier: string; settings: Record<string, unknown> | null },
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
  auditFails: false,
  caller: { userId: 5, role: 'admin', tenantId: 900 },
}));

const client = {
  query: vi.fn(async (sql: string) => {
    h.log.push(sql.trim().split(/\s+/)[0].toUpperCase());
    return { rows: [] };
  }),
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function selectChain() {
  const rows = async (lock: string) => {
    h.log.push(`SELECT${lock}`);
    return h.tenant ? [clone(h.tenant)] : [];
  };
  const limited = {
    for: (strength: string) => rows(` FOR ${strength.toUpperCase()}`),
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => rows('').then(ok, ko),
  };
  return { from: () => ({ where: () => ({ limit: () => limited }) }) };
}
const fakeDb = {
  select: () => selectChain(),
  update: () => ({
    set: (values: { settings: Record<string, unknown> }) => ({
      where: () => ({
        returning: async () => {
          h.log.push('UPDATE');
          if (!h.tenant) return [];
          h.tenant.settings = clone(values.settings);
          return [clone(h.tenant)];
        },
      }),
    }),
  }),
};

vi.mock('../../db/requestDb', () => ({
  requestDb: () => fakeDb,
  requestPgClient: () => client,
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = h.caller.userId;
    (req as any).user = { id: h.caller.userId };
    (req as any).userRole = h.caller.role;
    (req as any).tenantId = h.caller.tenantId;
    next();
  },
}));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/staffCrossOrgScope', () => ({
  staffCrossOrgScope: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  writeChainedAuditRow: vi.fn(async (c: unknown, entry: Record<string, unknown>) => {
    h.log.push('AUDIT');
    if (h.auditFails) throw new Error('could not serialize access to audit_logs (probe)');
    h.auditCalls.push({ client: c, entry });
  }),
}));

const ORG = 900;
const PATH = `/api/tenant-config/${ORG}/claude-connector`;
let app: express.Express;

beforeEach(async () => {
  h.log = [];
  h.auditCalls = [];
  h.auditFails = false;
  h.caller = { userId: 5, role: 'admin', tenantId: ORG };
  h.tenant = {
    id: ORG,
    tier: 'enterprise',
    settings: { security: { mfaRequired: true }, anaToolPolicy: { deny: ['x'] } },
  };
  const mod = await import('../tenant-config');
  app = express();
  app.use(express.json());
  app.use('/api/tenant-config', mod.default);
});

const writes = () => h.log.filter(s => s !== 'SELECT');
const as = (role: string, tenantId = ORG) => {
  h.caller = { userId: role === 'admin' ? 5 : 6, role, tenantId };
};

describe('reading the setting', () => {
  it('absent is disabled; the administrator is told they can change it', async () => {
    const res = await request(app).get(PATH);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ connector: { enabled: false, canChange: true } });
  });

  it.each([['the administrator', 'admin'], ['an owner', 'owner']])('%s of this organization is told they can change it', async (_label, role) => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    as(role);
    const res = await request(app).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connector: { enabled: true, canChange: true } });
  });

  it.each(['manager', 'member', 'viewer'])('a %s sees the state and that they cannot change it', async role => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    as(role);
    const res = await request(app).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connector: { enabled: true, canChange: false } });
  });

  it('a stored value that is not exactly true reads as disabled', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: 'true' } };
    expect((await request(app).get(PATH)).body.connector.enabled).toBe(false);
  });

  it("another organization's setting is not read", async () => {
    as('admin', 901);
    expect((await request(app).get(PATH)).status).toBe(403);
  });
});

describe("only this organization's owner or administrator changes it", () => {
  it.each([
    ['a manager', 'manager', ORG],
    ['a member', 'member', ORG],
    ['a viewer', 'viewer', ORG],
    ['platform staff (super_admin)', 'super_admin', ORG],
    ["another organization's administrator", 'admin', 901],
    ["another organization's owner", 'owner', 901],
  ])('%s is refused with 403, and nothing is written or recorded', async (_label, role, tenantId) => {
    as(role, tenantId);
    const res = await request(app).put(PATH).send({ enabled: true });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toMatch(/owner or administrator/i);
    expect(writes()).toEqual([]);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.tenant!.settings).not.toHaveProperty('claudeConnector');
  });

  it('an owner, if one is ever provisioned, changes it too', async () => {
    as('owner');
    const res = await request(app).put(PATH).send({ enabled: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.tenant!.settings).toMatchObject({ claudeConnector: { enabled: true } });
  });

  it('the administrator enables it: one transaction, the setting and its chained audit row with the value before and after', async () => {
    const res = await request(app).put(PATH).send({ enabled: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ connector: { enabled: true, canChange: true } });
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].client).toBe(client);
    expect(h.auditCalls[0].entry).toMatchObject({
      tenantId: ORG,
      userId: 5,
      action: 'tenant_settings_changed',
      resourceType: 'organization_settings',
      resourceId: String(ORG),
      details: {
        sections: ['claudeConnector'],
        changedFields: { claudeConnector: ['enabled'] },
        values: { claudeConnector: { before: { enabled: null }, after: { enabled: true } } },
      },
    });
    // Nothing else the organization stores is touched.
    expect(h.tenant!.settings).toEqual({
      security: { mfaRequired: true },
      anaToolPolicy: { deny: ['x'] },
      claudeConnector: { enabled: true },
    });
  });

  it('the administrator disables it, and the row records true → false', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    const res = await request(app).put(PATH).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connector: { enabled: false, canChange: true } });
    expect((h.auditCalls[0].entry.details as any).values).toEqual({
      claudeConnector: { before: { enabled: true }, after: { enabled: false } },
    });
  });

  it.each([[{}], [{ enabled: 'yes' }], [{ enabled: true, extra: 1 }], [null]])('a body of %j is refused with 400 and nothing is written', async body => {
    const res = await request(app).put(PATH).set('Content-Type', 'application/json').send(JSON.stringify(body));
    expect(res.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('a refused audit row is a refused change: rolled back, 500, not reported as saved', async () => {
    h.auditFails = true;
    const res = await request(app).put(PATH).send({ enabled: true });
    expect(res.status).toBe(500);
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'ROLLBACK']);
    expect(JSON.stringify(res.body)).not.toContain('serialize');
  });
});

describe('the general settings doors do not write it, whoever asks', () => {
  it.each(['admin', 'owner', 'super_admin', 'member'])('PATCH /settings naming claudeConnector, as role %s → 403, nothing written', async role => {
    as(role);
    const res = await request(app)
      .patch(`/api/tenant-config/${ORG}/settings`)
      .send({ claudeConnector: { enabled: true }, notifications: { emailEnabled: true } });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(writes()).toEqual([]);
  });

  it('control: PATCH /settings without it still writes', async () => {
    as('admin');
    const res = await request(app).patch(`/api/tenant-config/${ORG}/settings`).send({ notifications: { emailEnabled: true } });
    expect(res.status).toBe(200);
  });

  it('PATCH /settings/claudeConnector is not a section the section door writes', async () => {
    as('admin');
    const res = await request(app).patch(`/api/tenant-config/${ORG}/settings/claudeConnector`).send({ enabled: true });
    expect(res.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('a reset keeps the stored connector setting: it is not a default to restore', async () => {
    as('admin');
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    const res = await request(app).post(`/api/tenant-config/${ORG}/settings/reset`).send({});
    expect(res.status).toBe(200);
    expect(h.tenant!.settings).toMatchObject({ claudeConnector: { enabled: true } });
  });
});

/**
 * Fix round (IAM-24, 2026-10-01): the refusal sits in the one settings writer,
 * not only at each door. A door that writes general settings and forgets its
 * own check (the AnA controller's updateSettings, PATCH /settings, and any
 * door added later) cannot change the connector: the writer compares the
 * setting before and after and refuses, before anything is written or
 * recorded, unless the write is the connector's own door. The probe below is
 * such a door: it lays whatever it is sent over the stored settings.
 */
describe('the one settings writer refuses a connector change from any door but its own', () => {
  type Writer = typeof import('../../services/tenant/tenant-settings-writer');
  let writer: Writer;

  beforeEach(async () => {
    writer = await import('../../services/tenant/tenant-settings-writer');
    app.patch('/probe/:door', async (req, res) => {
      try {
        const stored = await writer.writeTenantSettings(req, ORG, {
          action: 'tenant_settings_changed',
          next: current =>
            req.params.door === 'replace' ? (req.body.patch ?? {}) : writer.overlaySettings(current, req.body.patch ?? {}),
          sections: () => Object.keys(req.body.patch ?? {}),
          ...(req.params.door === 'connector' ? { connectorDoor: true as const } : {}),
        });
        res.json({ written: true, stored });
      } catch (err) {
        res.status(409).json({ refused: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  const probe = (door: 'general' | 'replace' | 'connector', patch: Record<string, unknown>) =>
    request(app).patch(`/probe/${door}`).send({ patch });

  it('turning it on is refused: rolled back before the UPDATE, nothing recorded', async () => {
    const res = await probe('general', { claudeConnector: { enabled: true } });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.refused).toMatch(/connector for Claude is not changed here/i);
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'ROLLBACK']);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.tenant!.settings).not.toHaveProperty('claudeConnector');
  });

  it('turning it off is refused too: only its own door changes it, either way', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    const res = await probe('general', { claudeConnector: { enabled: false } });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(h.tenant!.settings).toEqual({ claudeConnector: { enabled: true } });
  });

  it('nulling it is refused (a null reads as off, so it would turn it off)', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    const res = await probe('general', { claudeConnector: null });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(h.tenant!.settings).toEqual({ claudeConnector: { enabled: true } });
  });

  it('erasing it is refused (a door that replaces the settings whole and leaves the key out)', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: true }, notifications: { emailEnabled: false } };
    const res = await probe('replace', { notifications: { emailEnabled: true } });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(h.tenant!.settings).toEqual({ claudeConnector: { enabled: true }, notifications: { emailEnabled: false } });
  });

  it('control: a general write that leaves it as stored is written, and keeps it', async () => {
    h.tenant!.settings = { claudeConnector: { enabled: true } };
    const res = await probe('general', { notifications: { emailEnabled: true } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.tenant!.settings).toEqual({ claudeConnector: { enabled: true }, notifications: { emailEnabled: true } });
  });

  it("control: the connector's own door changes it", async () => {
    const res = await probe('connector', { claudeConnector: { enabled: true } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.tenant!.settings).toMatchObject({ claudeConnector: { enabled: true } });
  });
});
