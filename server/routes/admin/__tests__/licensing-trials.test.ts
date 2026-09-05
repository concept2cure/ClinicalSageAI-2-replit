/**
 * Time-limited grants — the write side.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 *
 * Ending a trial must LAPSE the grant, never revoke it.
 *
 * A revocation (`enabled = false`) is a denial that outranks tier: the customer
 * loses the module even when their plan includes it, and the entitlement layer
 * tells them an administrator switched it off. A lapse removes the override and
 * lets tier + industry answer, so an organization on a covering plan keeps the
 * module. The two are one boolean apart in the write and look identical in a
 * success response — which is exactly why they are asserted here on the
 * parameters that reach the grant writer, not on the HTTP status.
 *
 * The second defect is a trial with an end date already in the past: a success
 * response for a change that gives the customer nothing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbQuery = vi.hoisted(() => vi.fn());
const writeModuleGrant = vi.hoisted(() => vi.fn());
const logAction = vi.hoisted(() => vi.fn());

vi.mock('../../../db', () => ({ query: dbQuery }));
vi.mock('../../../services/entitlements/module-grants', () => ({ writeModuleGrant }));
vi.mock('../../../services/auditService', () => ({ default: { logAction } }));

import router, { coveredByTier, parseTrialEnd } from '../licensing-trials';

const NOW = new Date('2026-08-24T12:00:00.000Z');
const FUTURE = '2026-09-23T00:00:00.000Z';

/** Pull a handler off the router so it can be called without a live server. */
function handler(method: string, path: string) {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`no ${method} ${path}`);
  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

function res() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  return r;
}

const req = (body: unknown) => ({ body, userId: 9, userEmail: 'owner@example.test', headers: {} });

/** Tenant exists, module exists, then the previous-row read. */
function targetsResolve(previousExpiry: string | null = null) {
  dbQuery
    .mockResolvedValueOnce({ rows: [{ id: 1 }] })
    .mockResolvedValueOnce({ rows: [{ module_id: 'pv-cockpit' }] })
    .mockResolvedValueOnce({ rows: [{ enabled: true, expires_at: previousExpiry }] });
}

/**
 * parseTrialEnd takes `now` and the unit case passes NOW, but the route
 * handlers fall through to its `new Date()` default — so the handler cases were
 * graded against the real clock, with FUTURE hardcoded three weeks out. They
 * would have started failing on 2026-09-23 with nothing changed in the code:
 * a trial end date that is no longer in the future is correctly a 400.
 *
 * Freezing Date (only Date) pins NOW as the present for the handlers too, so
 * FUTURE stays future.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  dbQuery.mockReset();
  writeModuleGrant.mockReset();
  logAction.mockReset();
  writeModuleGrant.mockResolvedValue({
    organization_id: 1,
    module_id: 'pv-cockpit',
    enabled: true,
    expires_at: FUTURE,
    updated_at: NOW.toISOString(),
  });
  logAction.mockResolvedValue({ persisted: true });
});

describe('parseTrialEnd', () => {
  it('accepts a future instant', () => {
    expect(parseTrialEnd(FUTURE, NOW)).toEqual({ at: new Date(FUTURE) });
  });

  it('refuses a past date, and says what to do instead', () => {
    const out = parseTrialEnd('2026-01-01T00:00:00.000Z', NOW) as { error: string };
    // An expiry already behind us is an immediate lapse dressed as a grant.
    expect(out.error).toMatch(/in the past/i);
    expect(out.error).toMatch(/end it instead/i);
  });

  it('refuses an unreadable or missing date rather than guessing', () => {
    expect(parseTrialEnd('next tuesday', NOW)).toHaveProperty('error');
    expect(parseTrialEnd('', NOW)).toHaveProperty('error');
    expect(parseTrialEnd(undefined, NOW)).toHaveProperty('error');
  });
});

describe('coveredByTier — what the customer keeps when it lapses', () => {
  it('the ladder is inclusive upward', () => {
    expect(coveredByTier({ tiers: ['standard'] }, 'professional')).toBe(true);
    expect(coveredByTier({ tiers: ['professional'] }, 'standard')).toBe(false);
  });

  it('a module with no tier list is unrestricted', () => {
    expect(coveredByTier({ tiers: [] }, 'free')).toBe(true);
    expect(coveredByTier(null, 'free')).toBe(true);
  });
});

describe('POST /licensing/trials', () => {
  it('will not write without a reason', async () => {
    const r = res();
    await handler('post', '/licensing/trials')(req({ organizationId: 1, moduleId: 'pv-cockpit', until: FUTURE }), r);
    expect(r.statusCode).toBe(400);
    expect(writeModuleGrant).not.toHaveBeenCalled();
  });

  it('will not write a past end date', async () => {
    const r = res();
    await handler('post', '/licensing/trials')(
      req({ organizationId: 1, moduleId: 'pv-cockpit', until: '2020-01-01', reason: 'evaluation' }),
      r,
    );
    expect(r.statusCode).toBe(400);
    expect(writeModuleGrant).not.toHaveBeenCalled();
  });

  it('grants with the end date and audits the change', async () => {
    targetsResolve(null);
    const r = res();
    await handler('post', '/licensing/trials')(
      req({ organizationId: 1, moduleId: 'pv-cockpit', until: FUTURE, reason: '30-day evaluation' }),
      r,
    );

    expect(r.statusCode).toBe(200);
    expect(writeModuleGrant).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1, moduleId: 'pv-cockpit', enabled: true, expiresAt: new Date(FUTURE) }),
    );
    const audited = logAction.mock.calls[0][0];
    expect(audited.details.masterAdminAction).toBe('tenant.trial_set');
    expect(audited.details.reason).toBe('30-day evaluation');
  });
});

describe('POST /licensing/trials/end — lapse, never revoke', () => {
  it('THE DISTINCTION: keeps the grant enabled and moves the expiry to now', async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ module_id: 'pv-cockpit' }] });
    const r = res();
    await handler('post', '/licensing/trials/end')(
      req({ organizationId: 1, moduleId: 'pv-cockpit', reason: 'customer declined' }),
      r,
    );

    const sent = writeModuleGrant.mock.calls[0][0];
    // `enabled: false` here would be a revocation — it outranks tier and would
    // take the module from a customer whose plan includes it.
    expect(sent.enabled).toBe(true);
    expect(sent.expiresAt).toBeInstanceOf(Date);
    expect(logAction.mock.calls[0][0].details.masterAdminAction).toBe('tenant.trial_ended');
  });

  it('says the plan is unaffected, so nobody reads it as a revocation', async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ module_id: 'pv-cockpit' }] });
    const r = res();
    await handler('post', '/licensing/trials/end')(
      req({ organizationId: 1, moduleId: 'pv-cockpit', reason: 'customer declined' }),
      r,
    );
    expect(r.body.note).toMatch(/plan itself includes is unchanged/i);
  });
});

describe('POST /licensing/trials/convert', () => {
  it('clears the end date and records it as a conversion', async () => {
    targetsResolve(FUTURE);
    writeModuleGrant.mockResolvedValue({
      organization_id: 1, module_id: 'pv-cockpit', enabled: true, expires_at: null, updated_at: NOW.toISOString(),
    });
    const r = res();
    await handler('post', '/licensing/trials/convert')(
      req({ organizationId: 1, moduleId: 'pv-cockpit', reason: 'purchase order received' }),
      r,
    );

    expect(writeModuleGrant.mock.calls[0][0].expiresAt).toBeNull();
    expect(r.body.expiresAt).toBeNull();
    // The action name is what tells a later reader this was a renewal rather
    // than somebody switching a module on.
    expect(logAction.mock.calls[0][0].details.masterAdminAction).toBe('tenant.trial_converted');
    expect(logAction.mock.calls[0][0].details.previousExpiry).toBe(FUTURE);
  });
});

describe('GET /licensing/trials', () => {
  it('lists lapsed grants alongside live ones', async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        { organization_id: 1, module_id: 'a', enabled: true, expires_at: '2026-01-01T00:00:00.000Z',
          organization_name: 'Org A', organization_slug: 'a', tier: 'standard',
          module_name: 'A', metadata: { tiers: ['professional'] }, expiry_set_by: null, expiry_set_at: null },
        { organization_id: 2, module_id: 'b', enabled: true, expires_at: '2099-01-01T00:00:00.000Z',
          organization_name: 'Org B', organization_slug: 'b', tier: 'standard',
          module_name: 'B', metadata: { tiers: ['standard'] }, expiry_set_by: null, expiry_set_at: null },
      ],
    });
    const r = res();
    await handler('get', '/licensing/trials')({ body: {} }, r);

    // A list that hid lapsed rows would show "nothing expiring" to an operator
    // whose customers had already lost access.
    expect(r.body.trials).toHaveLength(2);
    expect(r.body.lapsed).toBe(1);
    expect(r.body.live).toBe(1);
    // Org B's plan covers its module, so its lapse costs the customer nothing.
    expect(r.body.trials[1].coveredByPlan).toBe(true);
    expect(r.body.trials[0].coveredByPlan).toBe(false);
  });

  it('surfaces a failed read as an error, never as an empty list', async () => {
    dbQuery.mockRejectedValueOnce(new Error('relation missing'));
    const r = res();
    await handler('get', '/licensing/trials')({ body: {} }, r);
    expect(r.statusCode).toBe(500);
    expect(r.body.trials).toBeUndefined();
  });
});
