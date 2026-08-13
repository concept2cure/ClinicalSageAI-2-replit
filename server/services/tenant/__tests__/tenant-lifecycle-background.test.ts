import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  backgroundWorkPermitted,
  filterTenantsForBackgroundWork,
  shouldProcessTenantInBackground,
  type TenantAccessPosture,
} from '../tenant-lifecycle';

// The posture resolver is INJECTED rather than module-mocked.
//
// An earlier revision of this file used vi.mock on '../tenant-lifecycle' and
// then imported the functions under test from it. That does not intercept:
// `shouldProcessTenantInBackground` calls `getTenantAccessPosture` through an
// intra-module reference, so the real implementation ran and four of these tests
// passed for the wrong reason — false, because there is no database in a unit
// test, rather than false because the policy said so. Injection makes the
// dependency explicit and the assertions real.
const posture = (decision: string, state = 'active'): TenantAccessPosture =>
  ({ organizationId: 1, state, decision, code: 'X', reason: 'r' }) as TenantAccessPosture;

type PostureResolver = (id: number) => Promise<TenantAccessPosture | null>;

// Typed explicitly: a bare `vi.fn()` widens to Mock<Procedure | Constructable>,
// which does not satisfy the resolver parameter — tsc catches it, and an
// `as any` here would hide a genuine signature mismatch.
let resolve: ReturnType<typeof vi.fn<PostureResolver>>;

beforeEach(() => {
  resolve = vi.fn<PostureResolver>();
});

describe('shouldProcessTenantInBackground', () => {
  it('acts on an active tenant', async () => {
    resolve.mockResolvedValue(posture('allow'));
    await expect(shouldProcessTenantInBackground(1, resolve)).resolves.toBe(true);
  });

  it('does NOT act on a denied tenant', async () => {
    resolve.mockResolvedValue(posture('deny', 'suspended'));
    await expect(shouldProcessTenantInBackground(1, resolve)).resolves.toBe(false);
  });

  it('does NOT act on a read_only tenant — the divergence from the HTTP rule', async () => {
    // On HTTP, read_only lets a GET through. There is no equivalent here: a
    // sweep that "reads" still notifies, writes a marker, or spends budget.
    resolve.mockResolvedValue(posture('read_only', 'past_due'));
    await expect(shouldProcessTenantInBackground(1, resolve)).resolves.toBe(false);
  });

  it('does NOT act on a pending-deletion tenant', async () => {
    resolve.mockResolvedValue(posture('read_only', 'pending_deletion'));
    await expect(shouldProcessTenantInBackground(1, resolve)).resolves.toBe(false);
  });

  it('SKIPS rather than throws when the posture is unreadable', async () => {
    // The other divergence. A sweep has no caller; returning false lets the
    // tenant be picked up next tick once the posture is readable again.
    resolve.mockResolvedValue(null);
    await expect(shouldProcessTenantInBackground(1, resolve)).resolves.toBe(false);
  });
});

describe('filterTenantsForBackgroundWork', () => {
  it('returns only the entitled organizations', async () => {
    resolve.mockImplementation(async (id: number) =>
      id === 2 ? posture('deny', 'suspended') : posture('allow')
    );
    const allowed = await filterTenantsForBackgroundWork([1, 2, 3], resolve);
    expect([...allowed].sort()).toEqual([1, 3]);
  });

  it('resolves each distinct organization ONCE, however many rows it has', async () => {
    // A 500-row sweep dominated by one tenant must not issue 500 lookups.
    resolve.mockResolvedValue(posture('allow'));
    await filterTenantsForBackgroundWork([7, 7, 7, 7, 8, 8], resolve);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('returns an empty set for no input, without querying', async () => {
    const allowed = await filterTenantsForBackgroundWork([], resolve);
    expect(allowed.size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('excludes a tenant whose posture cannot be read', async () => {
    resolve.mockImplementation(async (id: number) => (id === 5 ? null : posture('allow')));
    const allowed = await filterTenantsForBackgroundWork([4, 5], resolve);
    expect(allowed.has(4)).toBe(true);
    expect(allowed.has(5)).toBe(false);
  });
});

describe('backgroundWorkPermitted — the pure decision', () => {
  it('permits only `allow`', () => {
    expect(backgroundWorkPermitted(posture('allow'))).toBe(true);
    expect(backgroundWorkPermitted(posture('read_only'))).toBe(false);
    expect(backgroundWorkPermitted(posture('deny'))).toBe(false);
  });

  it('refuses a null posture', () => {
    expect(backgroundWorkPermitted(null)).toBe(false);
  });
});
