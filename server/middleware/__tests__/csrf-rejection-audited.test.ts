/**
 * A request the CSRF guard refuses is recorded in the audit trail.
 *
 * The guard writes a `csrf_validation_failed` security event for every
 * refusal. It runs before authentication, so no tenant scope exists, and under
 * RLS_ENFORCE=on the audit service's pooled write was refused
 * ("[tenant-rls] FAIL-CLOSED: pool.connect requires an active tenant scope"):
 * in production every refused cross-site request lost its audit record and
 * logged two errors instead. Found by booting the production bundle against a
 * provisioned database (docs/evidence/W2/2026-09-24-multi-task/
 * u22-production-boot.md). A security event no tenant owns is written under
 * the audited system scope.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const seen = vi.hoisted(() => ({ scopes: [] as Array<unknown>, actions: [] as string[] }));

vi.mock('../../services/auditService', async () => {
  const { getTenantScope } = await import('../../db/tenantStore');
  return {
    default: {
      logAction: vi.fn(async (entry: { action: string }) => {
        seen.actions.push(entry.action);
        seen.scopes.push(getTenantScope() ?? null);
        return { persisted: true };
      }),
    },
  };
});

const priorEnv = process.env.NODE_ENV;
beforeEach(() => {
  seen.scopes.length = 0;
  seen.actions.length = 0;
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://app.example.com';
});
afterEach(() => {
  process.env.NODE_ENV = priorEnv;
  delete process.env.ALLOWED_ORIGINS;
});

describe('a CSRF refusal', () => {
  it('is audited under the system scope, the only scope that exists before sign-in', async () => {
    vi.resetModules();
    const { csrfProtection } = await import('../enterprise-security');
    const app = express();
    app.use(express.json());
    app.use(csrfProtection as express.RequestHandler);
    app.post('/api/projects', (_req, res) => res.json({ reached: true }));

    const res = await request(app).post('/api/projects').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
    await new Promise((r) => setTimeout(r, 50));

    expect(seen.actions).toEqual(['csrf_validation_failed']);
    expect(seen.scopes[0]).toMatchObject({ tenantId: '0', role: 'app_super_admin' });
  });
});
