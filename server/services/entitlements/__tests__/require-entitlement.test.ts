/**
 * requireEntitlement — the enforcement seam over the tested tier matrix.
 *
 * Covers: mode resolution (off default / warn / on), zero-cost off mode,
 * warn = log + X-Entitlement-Warning header + allow, on = 403 with the exact
 * { error:'NOT_ENTITLED', requiredTier, capability } shape, unknown-tier
 * behavior (allowed in warn, blocked with the reason in on), monotonic allow
 * at and above the minimum tier, and a feature_toggles pilot grant below tier
 * still passing in on mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import {
  requireEntitlement,
  resolveEntitlementsEnforceMode,
  lookupOrgTier,
  ENTITLEMENT_WARNING_HEADER,
} from '../require-entitlement';
import type { FeatureKey } from '../types';

const FEATURE: FeatureKey = 'device_assembly_readiness'; // min tier: standard

/** App with the gate on POST /gated and an org injected upstream (like auth). */
function appWith(orgId: number | null, feature: FeatureKey = FEATURE) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (orgId !== null) (req as unknown as { user: { organizationId: number } }).user = { organizationId: orgId };
    next();
  });
  app.post('/gated', requireEntitlement(feature), (_req, res) => res.json({ ok: true }));
  return app;
}

/** Route pool.query by statement: organizations / feature_toggles / module_subscriptions. */
function primeDb(opts: {
  orgRows?: Array<{ tier: string | null }>;
  toggleRows?: Array<{ feature_key: string; enabled: boolean; enabled_for_organization_ids: number[] | null }>;
  orgFails?: boolean;
}) {
  query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('FROM organizations')) {
      if (opts.orgFails) throw new Error('relation "organizations" does not exist');
      return { rows: opts.orgRows ?? [] };
    }
    if (s.includes('feature_toggles')) return { rows: opts.toggleRows ?? [] };
    if (s.includes('module_subscriptions')) return { rows: [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  query.mockReset();
  delete process.env.ENTITLEMENTS_ENFORCE;
});
afterEach(() => {
  delete process.env.ENTITLEMENTS_ENFORCE;
});

describe('resolveEntitlementsEnforceMode', () => {
  it("defaults to 'off' — enforcement is an explicit operator decision", () => {
    expect(resolveEntitlementsEnforceMode({})).toBe('off');
    expect(resolveEntitlementsEnforceMode({ ENTITLEMENTS_ENFORCE: '' })).toBe('off');
    expect(resolveEntitlementsEnforceMode({ ENTITLEMENTS_ENFORCE: 'bogus' })).toBe('off');
  });

  it('accepts the three modes, trimmed and case-insensitive', () => {
    expect(resolveEntitlementsEnforceMode({ ENTITLEMENTS_ENFORCE: 'on' })).toBe('on');
    expect(resolveEntitlementsEnforceMode({ ENTITLEMENTS_ENFORCE: ' WARN ' })).toBe('warn');
    expect(resolveEntitlementsEnforceMode({ ENTITLEMENTS_ENFORCE: 'Off' })).toBe('off');
  });
});

describe('off mode (today\'s default)', () => {
  it('allows without touching the database', async () => {
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('warn mode', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_ENFORCE = 'warn';
  });

  it('allows an unentitled org but stamps the warning header', async () => {
    primeDb({ orgRows: [{ tier: 'free' }] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(200);
    const header = res.headers[ENTITLEMENT_WARNING_HEADER.toLowerCase()];
    expect(header).toContain('device_assembly_readiness');
    expect(header).toContain("'standard'");
    expect(header).toContain('ENTITLEMENTS_ENFORCE=warn');
  });

  it('allows an UNKNOWN tier (org not found) with the warning header', async () => {
    primeDb({ orgRows: [] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(200);
    expect(res.headers[ENTITLEMENT_WARNING_HEADER.toLowerCase()]).toContain('tier unknown');
  });

  it('allows a missing org context with the warning header (auth owns that failure)', async () => {
    primeDb({});
    const res = await request(appWith(null)).post('/gated').send({});
    expect(res.status).toBe(200);
    expect(res.headers[ENTITLEMENT_WARNING_HEADER.toLowerCase()]).toContain(
      'organization context missing',
    );
  });

  it('entitled org passes with NO warning header', async () => {
    primeDb({ orgRows: [{ tier: 'standard' }] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(200);
    expect(res.headers[ENTITLEMENT_WARNING_HEADER.toLowerCase()]).toBeUndefined();
  });
});

describe('on mode', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
  });

  it('403s an unentitled org with the exact NOT_ENTITLED shape', async () => {
    primeDb({ orgRows: [{ tier: 'free' }] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ENTITLED');
    expect(res.body.capability).toBe('device_assembly_readiness');
    expect(res.body.requiredTier).toBe('standard');
    expect(res.body.message).toContain("'standard'");
  });

  it('allows at the minimum tier and every tier above it', async () => {
    for (const tier of ['standard', 'professional', 'enterprise']) {
      primeDb({ orgRows: [{ tier }] });
      const res = await request(appWith(7)).post('/gated').send({});
      expect(res.status, `tier ${tier} must be entitled`).toBe(200);
    }
  });

  it('blocks an UNKNOWN tier with the reason (fail closed, never a fabricated tier)', async () => {
    primeDb({ orgRows: [{ tier: 'platinum' }] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ENTITLED');
    expect(res.body.requiredTier).toBe('standard');
    expect(res.body.message).toContain('could not be verified');
    // The stored value is not one of the evaluator's fixed sentences, so it is
    // logged, not echoed.
    expect(res.body.message).not.toContain('platinum');
  });

  it('blocks when the tier lookup itself fails — the body carries NO driver text', async () => {
    primeDb({ orgFails: true });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ENTITLED');
    expect(res.body.capability).toBe('device_assembly_readiness');
    expect(res.body.requiredTier).toBe('standard');
    expect(res.body.message).toContain('could not be verified');
    // The evaluator's reason is `tier lookup failed: <driver message>`; none of
    // it may reach the client — the raw reason goes to the log only.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('tier lookup failed');
    expect(body).not.toContain('relation');
    expect(body).not.toContain('does not exist');
    expect(body).not.toContain('organizations');
  });

  it('forwards only the evaluator\'s fixed sentences (org not found) into the 403 message', async () => {
    primeDb({ orgRows: [] });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ENTITLED');
    expect(res.body.message).toContain('could not be verified');
    expect(res.body.message).toContain('organization not found');
  });

  it('blocks a missing org context (cannot verify an entitlement for nobody)', async () => {
    primeDb({});
    const res = await request(appWith(null)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('organization context missing');
  });

  it('honors a feature_toggles pilot grant below tier (resolver source=toggle)', async () => {
    primeDb({
      orgRows: [{ tier: 'free' }],
      toggleRows: [
        { feature_key: 'device_assembly_readiness', enabled: false, enabled_for_organization_ids: [7] },
      ],
    });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('does not let an unrelated toggle open the gate', async () => {
    primeDb({
      orgRows: [{ tier: 'free' }],
      toggleRows: [
        { feature_key: 'report_families', enabled: true, enabled_for_organization_ids: null },
      ],
    });
    const res = await request(appWith(7)).post('/gated').send({});
    expect(res.status).toBe(403);
  });

  it('a key outside the matrix is unverifiable — blocked, never guessed', async () => {
    primeDb({ orgRows: [{ tier: 'enterprise' }] });
    const res = await request(appWith(7, 'not_a_real_feature' as FeatureKey)).post('/gated').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ENTITLED');
    expect(res.body.requiredTier).toBeNull();
    expect(res.body.message).toContain('could not be verified');
    // A wiring-bug reason is not customer copy; the key is already in `capability`.
    expect(res.body.message).not.toContain('unknown capability key');
  });
});

describe('lookupOrgTier', () => {
  it('returns the real tier when recognized', async () => {
    primeDb({ orgRows: [{ tier: 'professional' }] });
    expect(await lookupOrgTier(7)).toEqual({ tier: 'professional', reason: null });
  });

  it('never invents a tier: missing row / bad value / query failure → null + reason', async () => {
    primeDb({ orgRows: [] });
    expect((await lookupOrgTier(7)).tier).toBeNull();
    primeDb({ orgRows: [{ tier: null }] });
    expect((await lookupOrgTier(7)).tier).toBeNull();
    primeDb({ orgFails: true });
    const failed = await lookupOrgTier(7);
    expect(failed.tier).toBeNull();
    expect(failed.reason).toContain('tier lookup failed');
  });
});
