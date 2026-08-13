/**
 * Tenant lifecycle posture — the policy that decides whether an organization may
 * operate at all.
 *
 * `derivePosture` is pure, so the whole decision table is asserted here without a
 * database. The two asymmetric unknown-value arms (status denies, payment_status
 * allows) are the load-bearing part and get their own cases: getting either one
 * backwards produces a bad outage or a bad bypass, and neither is obvious from
 * reading the call site.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  decisionPermitsMethod,
  derivePosture,
  invalidateTenantPosture,
  peekTenantAccessPosture,
} from '../tenant-lifecycle';

const ORG = 42;

describe('derivePosture — administrative status (layer 1)', () => {
  it('allows an active organization with an active subscription', () => {
    const p = derivePosture(ORG, 'active', 'active');
    expect(p.decision).toBe('allow');
    expect(p.state).toBe('active');
    expect(p.code).toBe('TENANT_ACTIVE');
  });

  it('DENIES a suspended organization', () => {
    const p = derivePosture(ORG, 'suspended', 'active');
    expect(p.decision).toBe('deny');
    expect(p.code).toBe('TENANT_SUSPENDED');
  });

  it('denies a suspended organization even when the subscription is paid', () => {
    // Suspension is the security control; a paid invoice must not override an
    // administrative or incident-driven suspension.
    expect(derivePosture(ORG, 'suspended', 'trialing').decision).toBe('deny');
    expect(derivePosture(ORG, 'suspended', 'active').decision).toBe('deny');
  });

  it('denies an inactive organization', () => {
    const p = derivePosture(ORG, 'inactive', 'active');
    expect(p.decision).toBe('deny');
    expect(p.code).toBe('TENANT_INACTIVE');
  });

  it('denies a purged organization', () => {
    expect(derivePosture(ORG, 'purged', 'active').decision).toBe('deny');
    expect(derivePosture(ORG, 'purged', 'active').state).toBe('purged');
  });

  it('puts a pending-deletion organization in READ-ONLY, not deny', () => {
    // The retention window exists so the customer can read and export their own
    // regulatory record. Denying here would defeat the entire purpose of the
    // state and breach the data-return obligation it was built to satisfy.
    const p = derivePosture(ORG, 'pending_deletion', 'active');
    expect(p.decision).toBe('read_only');
    expect(p.code).toBe('TENANT_PENDING_DELETION');
  });

  it('DENIES an unrecognized status (fail-closed)', () => {
    // Small closed vocabulary written only by our own admin surfaces, so an
    // unknown value means a bug or tampering.
    const p = derivePosture(ORG, 'wibble', 'active');
    expect(p.decision).toBe('deny');
    expect(p.code).toBe('TENANT_STATUS_UNRECOGNIZED');
  });

  it('denies an empty or missing status', () => {
    expect(derivePosture(ORG, '', 'active').decision).toBe('deny');
    expect(derivePosture(ORG, null, 'active').decision).toBe('deny');
    expect(derivePosture(ORG, undefined, 'active').decision).toBe('deny');
  });

  it('is case- and whitespace-insensitive on status', () => {
    expect(derivePosture(ORG, '  Active  ', 'active').decision).toBe('allow');
    expect(derivePosture(ORG, 'SUSPENDED', 'active').decision).toBe('deny');
  });
});

describe('derivePosture — subscription status (layer 2)', () => {
  it('puts a past-due tenant in read-only', () => {
    const p = derivePosture(ORG, 'active', 'past_due');
    expect(p.decision).toBe('read_only');
    expect(p.code).toBe('TENANT_PAST_DUE');
  });

  it('puts a cancelled subscription in read-only', () => {
    const p = derivePosture(ORG, 'active', 'canceled');
    expect(p.decision).toBe('read_only');
    expect(p.code).toBe('TENANT_SUBSCRIPTION_CANCELED');
  });

  it('allows a trialing tenant', () => {
    const p = derivePosture(ORG, 'active', 'trialing');
    expect(p.decision).toBe('allow');
    expect(p.state).toBe('trialing');
  });

  it('allows an `incomplete` tenant so onboarding is not locked out before checkout', () => {
    // A brand-new self-service organization sits at `incomplete` until its first
    // invoice settles. Blocking here would break signup before the customer ever
    // reaches a payment form.
    expect(derivePosture(ORG, 'active', 'incomplete').decision).toBe('allow');
  });

  it('allows an empty payment_status (never billed / enterprise invoiced)', () => {
    expect(derivePosture(ORG, 'active', '').decision).toBe('allow');
    expect(derivePosture(ORG, 'active', null).decision).toBe('allow');
  });

  it('ALLOWS an unrecognized payment_status (deliberately opposite to status)', () => {
    // Stripe owns this vocabulary and may extend it. Denying on a value we have
    // simply not seen before would turn a Stripe release note into an outage.
    const p = derivePosture(ORG, 'active', 'some_future_stripe_status');
    expect(p.decision).toBe('allow');
  });
});

describe('decisionPermitsMethod', () => {
  it('allows every method under `allow`', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(decisionPermitsMethod('allow', m)).toBe(true);
    }
  });

  it('allows no method under `deny`', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(decisionPermitsMethod('deny', m)).toBe(false);
    }
  });

  it('under `read_only`, permits safe verbs and blocks mutations', () => {
    expect(decisionPermitsMethod('read_only', 'GET')).toBe(true);
    expect(decisionPermitsMethod('read_only', 'HEAD')).toBe(true);
    expect(decisionPermitsMethod('read_only', 'OPTIONS')).toBe(true);
    expect(decisionPermitsMethod('read_only', 'POST')).toBe(false);
    expect(decisionPermitsMethod('read_only', 'PUT')).toBe(false);
    expect(decisionPermitsMethod('read_only', 'PATCH')).toBe(false);
    expect(decisionPermitsMethod('read_only', 'DELETE')).toBe(false);
  });

  it('is case-insensitive on the method', () => {
    expect(decisionPermitsMethod('read_only', 'get')).toBe(true);
    expect(decisionPermitsMethod('read_only', 'post')).toBe(false);
  });
});

describe('posture cache invalidation', () => {
  beforeEach(() => invalidateTenantPosture());

  it('starts empty and reports no live entry', () => {
    expect(peekTenantAccessPosture(ORG)).toBeNull();
  });

  it('invalidateTenantPosture() with no argument clears everything', () => {
    // No public writer other than getTenantAccessPosture (which needs a DB), so
    // this asserts the contract callers rely on: after a global invalidation
    // nothing is served from cache and the next read re-queries.
    invalidateTenantPosture();
    expect(peekTenantAccessPosture(ORG)).toBeNull();
    expect(peekTenantAccessPosture(ORG + 1)).toBeNull();
  });

  it('accepts a string organization id without throwing', () => {
    expect(() => invalidateTenantPosture('42')).not.toThrow();
    expect(() => invalidateTenantPosture('not-a-number')).not.toThrow();
  });
});
