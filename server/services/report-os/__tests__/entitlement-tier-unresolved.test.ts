import { vi } from 'vitest';

/**
 * A plan the server could not read is not the Standard plan.
 *
 * HS-1008-4, honest-state review 2026-10-08. `requireReportEntitlement` wraps
 * `resolveCapabilities` in `catch { tier = 'standard' }`. Degrading to
 * `standard` is right for the GATE — it can never silently unlock a paid
 * feature. It was wrong for the SENTENCE: the error was discarded and the
 * assumption passed on unflagged, so an enterprise customer whose capability
 * lookup threw was shown "Plan: Standard" and a screen of locked tiles, with
 * nothing to say their plan had not been read.
 *
 * These cases pin both halves: the gate still fails closed, and the decision
 * now carries whether the tier was read or assumed.
 */
const caps = vi.hoisted(() => ({
  resolveCapabilities: vi.fn(
    async (_orgId: number): Promise<{ tier: 'free' | 'standard' | 'professional' | 'enterprise' }> => ({
      tier: 'enterprise',
    }),
  ),
}));
vi.mock('../../entitlements/resolver', () => caps);

import { beforeEach, describe, expect, it } from 'vitest';
import { decideReportEntitlement, requireReportEntitlement } from '../entitlement-map';

beforeEach(() => {
  caps.resolveCapabilities.mockReset();
  caps.resolveCapabilities.mockResolvedValue({ tier: 'enterprise' });
});

describe('requireReportEntitlement when the capability lookup throws', () => {
  it('still fails closed on an enterprise feature', async () => {
    caps.resolveCapabilities.mockRejectedValueOnce(new Error('capability store unreachable'));
    const d = await requireReportEntitlement(1, 'portfolio.board_pack', 'portfolio');
    expect(d.entitled, 'a failed lookup unlocked a paid feature').toBe(false);
    expect(d.tier).toBe('standard');
  });

  /* THE HALF THAT WAS MISSING. `standard` here is an assumption, and the
     surface has to be able to tell it apart from a read. */
  it('marks the tier as unresolved rather than passing the assumption on as a plan', async () => {
    caps.resolveCapabilities.mockRejectedValueOnce(new Error('capability store unreachable'));
    const d = await requireReportEntitlement(1, 'portfolio.board_pack', 'portfolio');
    expect(d.tierResolved).toBe(false);
  });

  it('control: a tier that was read is marked resolved, and entitles what it should', async () => {
    const d = await requireReportEntitlement(1, 'portfolio.board_pack', 'portfolio');
    expect(d.tierResolved).toBe(true);
    expect(d.tier).toBe('enterprise');
    expect(d.entitled).toBe(true);
  });

  it('a read that returns standard is resolved — a real plan, not an assumption', async () => {
    caps.resolveCapabilities.mockResolvedValueOnce({ tier: 'standard' });
    const d = await requireReportEntitlement(1, 'portfolio.board_pack', 'portfolio');
    expect(d.tierResolved, 'a plan that WAS read was reported as unread').toBe(true);
    expect(d.entitled).toBe(false);
  });
});

describe('decideReportEntitlement carries the flag through a whole catalog', () => {
  /* report-os.ts builds every type's decision from ONE awaited gate. Without
     the parameter the catalog would claim a plan the gate could not read. */
  it('defaults to resolved, because the caller handed us a tier', () => {
    expect(decideReportEntitlement('readiness.executive_digest', 'readiness', 'standard').tierResolved).toBe(true);
  });

  it('propagates an unresolved tier to each per-type decision', () => {
    for (const typeId of ['readiness.executive_digest', 'portfolio.board_pack', 'prediction.regulatory_forecast']) {
      const d = decideReportEntitlement(typeId, undefined, 'standard', false);
      expect(d.tierResolved, `${typeId} claimed a plan the gate could not read`).toBe(false);
      // The gate is unchanged by the flag: it still decides on the tier it has.
      expect(d.tier).toBe('standard');
    }
  });
});
