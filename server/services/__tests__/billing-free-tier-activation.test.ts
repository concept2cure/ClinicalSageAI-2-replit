/**
 * Activating the free tier is an activation, never a downgrade.
 *
 * ── The defect this closes, and the one it must not open ─────────────────────
 * The onboarding wizard's free "Researcher" tier provisioned nothing: its
 * "Activate workspace" button skipped checkout (there is nothing to charge) and
 * nothing replaced it. The SERVICE could always do it — the free branch of
 * `createDTCCheckoutSession` sets `organizations.tier='free'`, invalidates the
 * tenant posture and runs `provisionModulesForTier(org,'free')` — only the
 * route's zod enum refused the word 'free'.
 *
 * Widening that enum is one line, and on its own it is a hole:
 * POST /api/billing/dtc-checkout carries `authenticateToken` and NO role check,
 * so any member of a paying organization could have posted `{ tier: 'free' }`
 * and rewritten their tenant's tier and payment_status — a silent downgrade of
 * a paid plan, by one request, with no decision recorded anywhere.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * Both halves, because either alone is wrong: a tenant with nothing to lose IS
 * provisioned (the defect), and a tenant on a live paid plan is REFUSED with a
 * reason and, critically, with no UPDATE issued (the hole). Stripe is never
 * constructed on this path — a plan with nothing to charge must not need a
 * payment processor to be configured.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({ pool: { query } }));
vi.mock('../tenant/tenant-lifecycle', () => ({ invalidateTenantPosture: vi.fn() }));

import { createDTCCheckoutSession, FreeTierNotAvailableError } from '../billing';

const ORG = 4242;
const PARAMS = {
  organizationId: ORG,
  tier: 'free',
  billingCycle: 'monthly' as const,
  successUrl: 'https://app.test/billing?checkout=success',
  cancelUrl: 'https://app.test/signup',
};

/** Rows the org lookup returns, then an empty result for every write. */
function orgRow(row: Record<string, unknown> | null) {
  query.mockImplementation((sql: string) => {
    if (/^\s*SELECT tier, payment_status, stripe_subscription_id/.test(sql)) {
      return Promise.resolve({ rows: row ? [row] : [] });
    }
    if (/available_modules/.test(sql)) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

const updates = () =>
  query.mock.calls.map((c) => String(c[0])).filter((s) => /UPDATE organizations/.test(s));

beforeEach(() => {
  query.mockReset();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_API_KEY;
});

describe('createDTCCheckoutSession — free tier', () => {
  it('provisions a tenant that holds no plan, without a Stripe key configured', async () => {
    orgRow({ tier: null, payment_status: null, stripe_subscription_id: null });

    const result = await createDTCCheckoutSession(PARAMS);

    expect(result).toEqual({ url: PARAMS.successUrl, sessionId: 'free' });
    expect(updates()).toHaveLength(1);
    expect(updates()[0]).toMatch(/tier = 'free'/);
    expect(updates()[0]).toMatch(/payment_status = 'active'/);
  });

  it('provisions a tenant already on free (re-activation is idempotent, not a downgrade)', async () => {
    orgRow({ tier: 'free', payment_status: 'active', stripe_subscription_id: null });
    await expect(createDTCCheckoutSession(PARAMS)).resolves.toMatchObject({ sessionId: 'free' });
    expect(updates()).toHaveLength(1);
  });

  it('REFUSES a tenant on a live paid tier, and writes nothing', async () => {
    orgRow({ tier: 'professional', payment_status: 'active', stripe_subscription_id: null });

    await expect(createDTCCheckoutSession(PARAMS)).rejects.toBeInstanceOf(
      FreeTierNotAvailableError,
    );
    await expect(createDTCCheckoutSession(PARAMS)).rejects.toThrow(
      /already on the professional plan/,
    );
    // The point of the guard: the tenant's plan is untouched.
    expect(updates()).toEqual([]);
  });

  it('REFUSES a tenant with a Stripe subscription even if its tier column lags', async () => {
    // The subscription is the fact; `tier` can be stale between a webhook and
    // the row it updates. Reading only the tier column would have let a paying
    // customer downgrade themselves through the gap.
    orgRow({ tier: 'free', payment_status: 'active', stripe_subscription_id: 'sub_123' });

    await expect(createDTCCheckoutSession(PARAMS)).rejects.toBeInstanceOf(
      FreeTierNotAvailableError,
    );
    expect(updates()).toEqual([]);
  });

  it('refuses an organization that does not exist rather than inventing one', async () => {
    orgRow(null);
    await expect(createDTCCheckoutSession(PARAMS)).rejects.toThrow(/not found/);
    expect(updates()).toEqual([]);
  });
});
