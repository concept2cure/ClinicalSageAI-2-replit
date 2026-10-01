/**
 * P1-41 (DP-57): every tenant configuration write — PATCH /:tenantId/settings,
 * PATCH /:tenantId/settings/:section and POST /:tenantId/settings/reset —
 * writes one chained audit row in the same transaction as the write, on the
 * request's own connection. The row names the section(s) written and the
 * fields that changed; it carries values before and after only for the
 * security settings (second-factor requirement, password policy, session
 * timeout, IP restrictions) and the audit-trail retention period. Never a
 * webhook address or any other value. A failed audit write rolls the write back.
 *
 * The request's connection and its Drizzle handle are recorders sharing one
 * ordered log. tests/db/admin-change-audit.dbtest.ts proves the same on
 * PostgreSQL, as app_service with RLS enforcing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { ADMINISTRATIVE_ACTIONS } from '../../services/audit/compliance-reports/queries/administrative-changes';

const h = vi.hoisted(() => ({
  log: [] as string[],
  tenant: null as null | { id: number; tier: string; settings: Record<string, unknown> },
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
  auditFails: false,
}));

const client = {
  query: vi.fn(async (sql: string) => {
    h.log.push(sql.trim().split(/\s+/)[0].toUpperCase());
    return { rows: [] };
  }),
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The two Drizzle chains the router uses on `organizations`, recorded. */
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
    (req as any).userId = 5;
    (req as any).user = { id: 5 };
    (req as any).userRole = 'admin';
    (req as any).tenantId = 900;
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
const SECRET_WEBHOOK = 'https://hooks.example.invalid/services/T000/B000/s3cr3t-webhook-token';
let app: express.Express;

beforeEach(async () => {
  h.log = [];
  h.auditCalls = [];
  h.auditFails = false;
  h.tenant = {
    id: ORG,
    tier: 'enterprise',
    settings: {
      security: { mfaRequired: false, sessionTimeoutMinutes: 60, passwordPolicy: { minLength: 8 } },
      notifications: { slackEnabled: false },
      qmp: { auditTrailRetentionDays: 365, requireQmpForAllProjects: false },
    },
  };
  const mod = await import('../tenant-config');
  app = express();
  app.use(express.json());
  app.use('/api/tenant-config', mod.default);
});

const flow = () => h.log.filter(s => s !== 'SELECT');
const auditText = () => JSON.stringify(h.auditCalls.map(c => c.entry));

describe('a security settings change is recorded with its values before and after', () => {
  it('PATCH /settings/security: one chained row inside the write transaction, before COMMIT', async () => {
    const res = await request(app)
      .patch(`/api/tenant-config/${ORG}/settings/security`)
      .send({ mfaRequired: true, sessionTimeoutMinutes: 15, ipRestrictions: ['203.0.113.0/24'] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(flow()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].client).toBe(client);
    expect(h.auditCalls[0].entry).toMatchObject({
      tenantId: ORG,
      userId: 5,
      action: 'tenant_settings_changed',
      resourceType: 'organization_settings',
      resourceId: String(ORG),
      details: {
        sections: ['security'],
        changedFields: { security: ['ipRestrictions', 'mfaRequired', 'sessionTimeoutMinutes'] },
        values: {
          security: {
            before: { mfaRequired: false, passwordPolicy: { minLength: 8 }, sessionTimeoutMinutes: 60, ipRestrictions: null },
            after: { mfaRequired: true, passwordPolicy: { minLength: 8 }, sessionTimeoutMinutes: 15, ipRestrictions: ['203.0.113.0/24'] },
          },
        },
      },
    });
    expect(ADMINISTRATIVE_ACTIONS).toContain(h.auditCalls[0].entry.action);
  });

  it('PATCH /settings: names every section written; values only for security and audit retention', async () => {
    const res = await request(app)
      .patch(`/api/tenant-config/${ORG}/settings`)
      .send({
        notifications: { slackEnabled: true, slackWebhook: SECRET_WEBHOOK },
        qmp: { auditTrailRetentionDays: 3650 },
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.auditCalls).toHaveLength(1);
    const details = h.auditCalls[0].entry.details as Record<string, any>;
    expect(details.sections).toEqual(['notifications', 'qmp']);
    expect(details.changedFields).toEqual({
      notifications: ['slackEnabled', 'slackWebhook'],
      qmp: ['auditTrailRetentionDays', 'requireQmpForAllProjects'],
    });
    expect(details.values).toEqual({
      qmp: { before: { auditTrailRetentionDays: 365 }, after: { auditTrailRetentionDays: 3650 } },
    });
    // The webhook is a credential: its name is recorded, its value never.
    expect(auditText()).not.toContain('hooks.example.invalid');
    expect(auditText()).not.toContain('s3cr3t');
  });

  it('a stored secret in a section that is value-audited is still not carried', async () => {
    (h.tenant!.settings.security as Record<string, unknown>).samlSigningKey = 'stored-signing-secret';
    await request(app).patch(`/api/tenant-config/${ORG}/settings/security`).send({ mfaRequired: true });
    expect(auditText()).not.toContain('stored-signing-secret');
  });
});

describe('a reset to defaults is recorded', () => {
  it('POST /settings/reset: one tenant_settings_reset row naming every section, with the security and retention values', async () => {
    const res = await request(app).post(`/api/tenant-config/${ORG}/settings/reset`).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(flow()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    const { entry } = h.auditCalls[0];
    expect(entry.action).toBe('tenant_settings_reset');
    expect(ADMINISTRATIVE_ACTIONS).toContain(entry.action);
    const details = entry.details as Record<string, any>;
    expect(details.sections).toEqual(['branding', 'cer', 'integration', 'notifications', 'qmp', 'security', 'workflow']);
    expect(details.values.security.before).toMatchObject({ mfaRequired: false, sessionTimeoutMinutes: 60 });
    expect(details.values.security.after).toMatchObject({ mfaRequired: true, sessionTimeoutMinutes: 30 });
    expect(details.values.qmp).toEqual({ before: { auditTrailRetentionDays: 365 }, after: { auditTrailRetentionDays: 3650 } });
  });
});

describe('a failed audit write is a failed settings write', () => {
  it.each([
    ['PATCH /settings/security', () => request(app).patch(`/api/tenant-config/${ORG}/settings/security`).send({ mfaRequired: true })],
    ['PATCH /settings', () => request(app).patch(`/api/tenant-config/${ORG}/settings`).send({ security: { mfaRequired: true } })],
    ['POST /settings/reset', () => request(app).post(`/api/tenant-config/${ORG}/settings/reset`).send({})],
  ])('%s: ROLLBACK, no COMMIT, 500 without the error text', async (_label, send) => {
    h.auditFails = true;
    const res = await send();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/serialize|audit_logs|probe/);
    expect(flow()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'ROLLBACK']);
  });

  it('an unknown tenant is 404, rolled back, and nothing is recorded', async () => {
    h.tenant = null;
    const res = await request(app).patch(`/api/tenant-config/${ORG}/settings/security`).send({ mfaRequired: true });
    expect(res.status).toBe(404);
    expect(h.auditCalls).toHaveLength(0);
    expect(flow()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'ROLLBACK']);
  });
});
