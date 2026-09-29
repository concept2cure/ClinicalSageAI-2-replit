/**
 * ADR-0014 §5 (gateway items): tenants are isolated in capacity as well as in
 * data.
 *
 * - A gateway call with no tenant at all — no organizationId and no tenant
 *   scope — is refused in production before it is charged to anything. Until
 *   this change it was counted against the shared '__global__' rate bucket
 *   first, and a public-provenance payload was then served.
 * - A call bound to its tenant through the ambient scope is charged to THAT
 *   tenant. Until this change the rate bucket keyed on `organizationId` alone,
 *   so every ambient-bound call of every tenant shared '__global__' (about 40
 *   of 65 call sites never pass organizationId; gateway.ts
 *   applyOrgPlacementDefaults).
 * - A rate-limit refusal writes a ledger row like any other refused call.
 *
 * Platform work in an explicit system scope carries no tenant by design and
 * is not refused (tenant-placement-boundary.test.ts pins that too).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { runWithSystemTenantScope, runWithTenantScope } from '../../../db/tenantStore';
import { governedGateway, ledgerRows, request, stubDispatch } from './support/governed-gateway';

const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  setOrgPlacementResolver({ resolve: async () => null });
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

const chat = (extra = {}) => request({ taskType: 'chat', ...extra });
const inTenant = <T>(tenantId: string, fn: () => T) => runWithTenantScope({ tenantId, role: null, source: 'request' }, fn);
const asPlatform = <T>(fn: () => T) => runWithSystemTenantScope('tenant-capacity.test', fn);

describe('§5 — a call with no tenant is refused in production, before any bucket', () => {
  it('is refused even for a public payload, and nothing is dispatched', async () => {
    process.env.NODE_ENV = 'production';
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(chat({ payloadProvenance: 'public' })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', reasonCode: 'DENY_NO_TENANT_BINDING', stage: 'admission' });
    expect(err.message).toContain('not made on behalf of any organization');
    expect(invoked).toEqual([]);
  });

  it('is not charged to the shared bucket: platform work after it still has the whole of it', async () => {
    process.env.NODE_ENV = 'production';
    const gw = governedGateway({ perOrgPerMinute: 1 });
    const invoked = stubDispatch(gw);
    await expect(gw.route(chat())).rejects.toMatchObject({ name: 'GatewayPolicyError' });
    await asPlatform(() => gw.route(chat()));
    expect(invoked).toHaveLength(1);
  });

  it('leaves one ledger row saying it was refused at admission for want of a tenant', async () => {
    process.env.NODE_ENV = 'production';
    const gw = governedGateway();
    stubDispatch(gw);
    await gw.route(chat({ callerModule: 'test:unbound' })).catch(() => undefined);
    const rows = ledgerRows(gw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'none',
      success: false,
      error: 'DENY_NO_TENANT_BINDING',
      callerModule: 'test:unbound',
      metadata: { tenantBinding: { stage: 'admission', boundFrom: 'none' } },
    });
  });

  it('control: platform work in the explicit system scope is served in production', async () => {
    process.env.NODE_ENV = 'production';
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await asPlatform(() => gw.route(chat()));
    expect(invoked).toHaveLength(1);
  });

  it('control: outside production an unbound call is served, as before', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(chat());
    expect(invoked).toHaveLength(1);
  });
});

describe('§5 — a tenant is charged for its own calls, however it was bound', () => {
  it("one tenant's ambient-bound calls do not spend another tenant's rate budget", async () => {
    const gw = governedGateway({ perOrgPerMinute: 1 });
    const invoked = stubDispatch(gw);
    await inTenant('7', () => gw.route(chat()));
    await inTenant('8', () => gw.route(chat()));
    expect(invoked).toHaveLength(2);
  });

  it('explicit and ambient binding to the same tenant draw from one bucket', async () => {
    const gw = governedGateway({ perOrgPerMinute: 1 });
    stubDispatch(gw);
    await gw.route(chat({ organizationId: 7 }));
    await expect(inTenant('7', () => gw.route(chat()))).rejects.toThrow(/Organization rate limit exceeded/);
  });
});

describe('§5 — a rate-limit refusal is ledgered like any other refused call', () => {
  it('the organization limit writes a row naming the limit', async () => {
    const gw = governedGateway({ perOrgPerMinute: 1 });
    stubDispatch(gw);
    await gw.route(chat({ organizationId: 7, callerModule: 'test:rate' }));
    await expect(gw.route(chat({ organizationId: 7, callerModule: 'test:rate' }))).rejects.toMatchObject({
      name: 'GatewayPolicyError',
    });
    const refused = ledgerRows(gw).filter((r) => !r.success);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({
      provider: 'none',
      model: 'none',
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      organizationId: 7,
      callerModule: 'test:rate',
      metadata: { rateLimit: { scope: 'organization', limit: 1, count: 2, windowMs: 60_000 } },
    });
  });

  it('the per-user limit writes a row with its scope', async () => {
    const gw = governedGateway();
    (gw as any).policyEngine.updateConfig({ maxRequestsPerMinutePerUser: 1 });
    stubDispatch(gw);
    await gw.route(chat({ organizationId: 7, userId: 3 }));
    await gw.route(chat({ organizationId: 7, userId: 3 })).catch(() => undefined);
    const refused = ledgerRows(gw).filter((r) => !r.success);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ error: 'RATE_LIMIT_EXCEEDED', metadata: { rateLimit: { scope: 'user', limit: 1 } } });
  });
});
