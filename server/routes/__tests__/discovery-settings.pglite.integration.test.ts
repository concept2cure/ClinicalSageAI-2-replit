/**
 * Real SQL for the new discovery door and canonical writeTenantSettings:
 * tenant RLS, persisted readback, revision checks under SELECT FOR UPDATE,
 * unrelated settings preservation, and rollback when audit insertion fails.
 * Authentication is a test session; audit chain cryptography is covered by
 * the canonical audit service's own database suite, not simulated here.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '@shared/schema';
import { emptyDiscoveryAnswers } from '@shared/types/onboarding-discovery';
import { DiscoverySettingRefusedError, overlaySettings, writeTenantSettings } from '../../services/tenant/tenant-settings-writer';

let database: PGlite;
let orm: ReturnType<typeof drizzle>;
const state = vi.hoisted(() => ({ auditFails: false, sql: [] as string[] }));
const sessionClient = {
  query: async (sql: string, params?: unknown[]) => {
    state.sql.push(sql);
    return database.query(sql, params);
  },
};
vi.mock('../../db/requestDb', () => ({ requestDb: () => orm, requestPgClient: () => sessionClient }));
vi.mock('express-rate-limit', () => ({ default: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: 7, organizationId: 2, role: 'admin' }, userRole: 'admin' });
    next();
  },
}));
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: async (client: typeof sessionClient, entry: { tenantId: number; details: unknown; reason?: string }) => {
    // A real rejected statement aborts the transaction, as an audit insert
    // refusal would. Never return a pretend persisted outcome.
    if (state.auditFails) await client.query('INSERT INTO discovery_audit_probe (missing_column) VALUES (1)');
    await client.query('INSERT INTO discovery_audit_probe (organization_id, details, reason) VALUES ($1, $2, $3)', [entry.tenantId, JSON.stringify(entry.details), entry.reason]);
  },
}));

let app: express.Express;
beforeAll(async () => {
  database = await PGlite.create();
  const columns = getTableConfig(organizations).columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(', ');
  await database.exec(`
    CREATE TABLE organizations (${columns});
    CREATE TABLE discovery_audit_probe (organization_id INTEGER NOT NULL, details JSONB, reason TEXT);
    CREATE ROLE discovery_runtime NOSUPERUSER NOBYPASSRLS;
    GRANT SELECT, UPDATE ON organizations TO discovery_runtime;
    GRANT SELECT, INSERT, DELETE ON discovery_audit_probe TO discovery_runtime;
    ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
    CREATE POLICY discovery_own_org ON organizations TO discovery_runtime
      USING (id = current_setting('app.current_tenant_id')::integer)
      WITH CHECK (id = current_setting('app.current_tenant_id')::integer);
    INSERT INTO organizations (id, name, slug, tier, settings) VALUES
      (2, 'Our company', 'ours', 'standard', '{}'),
      (3, 'Other company', 'other', 'standard', '{"onboardingDiscovery":{"private":"other org"}}');
    SET ROLE discovery_runtime;
    SELECT set_config('app.current_tenant_id', '2', false);
  `);
  orm = drizzle(database, { logger: { logQuery: query => state.sql.push(query) } });
  app = express(); app.use(express.json());
  app.use('/api/onboarding/discovery', (await import('../onboarding-discovery-routes')).default);
}, 60_000);

beforeEach(async () => {
  state.auditFails = false; state.sql = [];
  await database.query('UPDATE organizations SET settings = $1 WHERE id = 2', [JSON.stringify({
    security: { mfaRequired: true, maxConcurrentSessions: 3 },
    notifications: { weeklyReports: true },
    claudeConnector: { enabled: false },
  })]);
  await database.query('DELETE FROM discovery_audit_probe');
});
afterAll(async () => { await database?.close(); });

const path = '/api/onboarding/discovery';
const payload = () => ({ answers: { ...emptyDiscoveryAnswers(), companyGoal: 'A private company strategy' }, expectedRevision: 0, complete: false, reason: 'Captured in a discovery meeting.' });
const savedSettings = async () => (await database.query<{ settings: Record<string, unknown> }>('SELECT settings FROM organizations WHERE id = 2')).rows[0].settings;

describe('discovery with real SQL and tenant enforcement', () => {
  it('persists the same record GET returns without changing security or connector policy', async () => {
    const res = await request(app).patch(path).send(payload());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const saved = await savedSettings();
    expect(saved).toMatchObject({ security: { mfaRequired: true, maxConcurrentSessions: 3 }, notifications: { weeklyReports: true }, claudeConnector: { enabled: false } });
    expect(saved.onboardingDiscovery).toEqual(res.body.data.discovery);
    expect((await request(app).get(path)).body.data.discovery).toEqual(saved.onboardingDiscovery);
    expect(state.sql.some(sql => /for update/i.test(sql))).toBe(true);
    expect(state.sql).toContain('BEGIN');
    expect(state.sql).toContain('COMMIT');
    const audit = await database.query<{ details: { sections: string[] }; reason: string }>('SELECT details, reason FROM discovery_audit_probe');
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].details.sections).toEqual(['onboardingDiscovery']);
    expect(audit.rows[0].reason).toBe(payload().reason);
    expect(JSON.stringify(audit.rows[0].details)).not.toContain('A private company strategy');
  });

  it('rolls back the discovery and leaves no audit row if audit insertion is rejected', async () => {
    const before = await savedSettings();
    state.auditFails = true;
    const res = await request(app).patch(path).send(payload());
    expect(res.status).toBe(503);
    expect(await savedSettings()).toEqual(before);
    expect((await database.query('SELECT * FROM discovery_audit_probe')).rows).toHaveLength(0);
    expect(state.sql).toContain('ROLLBACK');
    expect(state.sql).not.toContain('COMMIT');
  });

  it('does not overwrite a newer saved revision or add an audit row for a refused write', async () => {
    expect((await request(app).patch(path).send(payload())).status).toBe(200);
    const before = await savedSettings();
    const res = await request(app).patch(path).send({ ...payload(), answers: { ...payload().answers, companyGoal: 'A stale edit' } });
    expect(res.status).toBe(409);
    expect(await savedSettings()).toEqual(before);
    expect((await database.query('SELECT * FROM discovery_audit_probe')).rows).toHaveLength(1);
  });

  it('the non-superuser database refuses another tenant even if the application predicate is absent', async () => {
    const identity = await database.query<{ rolsuper: boolean; rolbypassrls: boolean }>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    expect(identity.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect((await database.query('SELECT settings FROM organizations WHERE id = 3')).rows).toHaveLength(0);
    expect((await database.query('SELECT id FROM organizations')).rows).toEqual([{ id: 2 }]);
    expect((await database.query("UPDATE organizations SET settings = '{}' WHERE id = 3 RETURNING id")).rows).toHaveLength(0);
  });

  it('the tenant-isolation assertion fails when its policy is widened (negative control)', async () => {
    await database.exec('RESET ROLE; BEGIN; ALTER POLICY discovery_own_org ON organizations USING (true) WITH CHECK (true); SET ROLE discovery_runtime;');
    try {
      const leaked = await database.query('SELECT id FROM organizations WHERE id = 3');
      expect(() => expect(leaked.rows).toHaveLength(0)).toThrow();
    } finally {
      await database.exec('ROLLBACK; SET ROLE discovery_runtime;');
    }
    expect((await database.query('SELECT id FROM organizations WHERE id = 3')).rows).toHaveLength(0);
  });

  it('the canonical writer refuses generic discovery creation, replacement, removal and null', async () => {
    const req = { user: { id: 7 }, get: () => undefined } as unknown as Request;
    await expect(writeTenantSettings(req, 2, {
      action: 'tenant_settings_changed', next: current => ({ ...current, onboardingDiscovery: payload().answers }), sections: () => ['onboardingDiscovery'],
    })).rejects.toBeInstanceOf(DiscoverySettingRefusedError);
    expect((await request(app).patch(path).send(payload())).status).toBe(200);
    const before = await savedSettings();
    for (const next of [
      (current: Record<string, unknown>) => ({ ...current, onboardingDiscovery: null }),
      (current: Record<string, unknown>) => ({ ...current, onboardingDiscovery: { completedAt: '2026-10-14T00:00:00.000Z' } }),
      (current: Record<string, unknown>) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'onboardingDiscovery')),
      (current: Record<string, unknown>) => overlaySettings(current, { onboardingDiscovery: { revision: 999 } }),
      (current: Record<string, unknown>) => {
        (current.onboardingDiscovery as Record<string, unknown>).revision = 999;
        return current;
      },
    ]) {
      await expect(writeTenantSettings(req, 2, { action: 'tenant_settings_changed', next, sections: () => ['onboardingDiscovery'] })).rejects.toBeInstanceOf(DiscoverySettingRefusedError);
      expect(await savedSettings()).toEqual(before);
    }
    expect((await database.query('SELECT * FROM discovery_audit_probe')).rows).toHaveLength(1);
    const unchangedDiscovery = before.onboardingDiscovery;
    const result = await writeTenantSettings(req, 2, {
      action: 'tenant_settings_changed', next: current => overlaySettings(current, { notifications: { weeklyReports: false } }), sections: () => ['notifications'],
    });
    expect(result?.onboardingDiscovery).toEqual(unchangedDiscovery);
    expect(result?.notifications).toEqual({ weeklyReports: false });
  });
});
