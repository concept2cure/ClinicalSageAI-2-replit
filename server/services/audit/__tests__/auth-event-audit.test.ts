/**
 * The scope an authentication event's audit row is written in.
 *
 * Every /api/auth request runs in the pre-auth scope (tenant '0', no role), and
 * audit_logs admits a row only for the scope's own tenant. An event that names
 * the user's organisation must therefore be written in a scope for exactly that
 * organisation. With no role, so it bypasses nothing; and around the write alone,
 * so the request's own queries stay pre-auth. Written from the pre-auth scope,
 * every such row was refused under RLS_ENFORCE=on and a sign-in left no audit
 * record (VSR-001 §13, F-19). The policy itself is exercised on real PostgreSQL
 * by tests/db/sign-in-audit-trail.dbtest.ts; this file pins the scope rule
 * where no database is available.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantScope, runWithPreAuthScope, type TenantScope } from '../../../db/tenantStore';

const h = vi.hoisted(() => ({
  scopes: [] as Array<TenantScope | undefined>,
  persisted: true,
}));

vi.mock('../../auditService', () => {
  const logAction = vi.fn(async () => {
    h.scopes.push(getTenantScope() ? { ...getTenantScope()! } : undefined);
    return h.persisted ? { persisted: true } : { persisted: false, error: 'refused' };
  });
  return { default: { logAction }, logAction };
});

import { recordAuthEvent } from '../auth-event-audit';

const EVENT = { action: 'user_login_mfa_challenge', userId: 17, email: 'u@example.test', outcome: 'success' as const };

beforeEach(() => {
  h.scopes = [];
  h.persisted = true;
});

describe('an event that names the user organisation', () => {
  it.each([
    ['a number, from the user record', 1],
    ['a string, from the signed MFA challenge', '1'],
  ])('is written in a scope for exactly that organisation, with no role (%s)', async (_label, tenantId) => {
    await runWithPreAuthScope('auth:POST /login', () => recordAuthEvent({ ...EVENT, tenantId }));

    expect(h.scopes).toHaveLength(1);
    expect(h.scopes[0]).toMatchObject({ tenantId: '1', role: null });
  });

  it('leaves the request in the pre-auth scope it arrived in', async () => {
    await runWithPreAuthScope('auth:POST /login', async () => {
      const before = getTenantScope();
      await recordAuthEvent({ ...EVENT, tenantId: 1 });
      expect(getTenantScope()).toBe(before);
      expect(getTenantScope()).toMatchObject({ tenantId: '0', role: null });
    });
  });
});

describe('an event that names no organisation', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
    ['zero', 0],
    ['negative', -3],
    ['not an id', 'org-one'],
  ])('is written from the scope it arrives in (%s)', async (_label, tenantId) => {
    await runWithPreAuthScope('auth:POST /login', () =>
      recordAuthEvent({ action: 'user_login', email: 'nobody@example.test', outcome: 'failure', tenantId }),
    );

    expect(h.scopes[0]).toMatchObject({ tenantId: '0', role: null });
  });
});

describe('a write that is not persisted', () => {
  it('does not fail the request that caused it', async () => {
    h.persisted = false;
    await expect(
      runWithPreAuthScope('auth:POST /login', () => recordAuthEvent({ ...EVENT, tenantId: 1 })),
    ).resolves.toBeUndefined();
  });
});
