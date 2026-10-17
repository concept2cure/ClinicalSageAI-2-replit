/**
 * The scheduled-reports gate names no plan it did not read (2026-10-15).
 *
 * What the code used to do: scheduledReportsEntitled read only `tier` from the
 * capability resolver, which turned a failed plan read into 'standard' without
 * throwing. So the gate's own catch — the one that marks `tierResolved: false`
 * — could never fire, and POST /api/insights/subscriptions answered an
 * enterprise organization whose plan read failed with 403 "Scheduled reports
 * require the professional plan.", body tier 'standard'. The verdict also let
 * any tier through `entitled` whether or not it had been read.
 *
 * The resolver here is the real one; only the pool answers are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../../db/runtime';
import { scheduledReportsEntitled, scheduledReportsRefusal, scheduledReportsVerdict } from '../entitlement';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

/** `null` makes the organizations.tier read fail. */
function stubTier(tier: string | null) {
  const route: QueryFn = async (text) => {
    if (text.includes('SELECT tier FROM organizations')) {
      if (tier === null) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      return { rows: [{ tier }] };
    }
    return { rows: [] };
  };
  return vi.spyOn(getPool() as unknown as { query: QueryFn }, 'query').mockImplementation(route);
}

afterEach(() => vi.restoreAllMocks());

describe('scheduledReportsEntitled', () => {
  it('says the plan could not be read, and names no plan, when the read fails', async () => {
    stubTier(null);
    const verdict = await scheduledReportsEntitled(7);
    expect(verdict.tierResolved, "the gate dropped the resolver's unread flag").toBe(false);
    expect(verdict.entitled).toBe(false);
    expect(verdict.tier).toBeNull();
    const body = scheduledReportsRefusal(verdict);
    expect(body.error).toBe('Your plan could not be read, so a scheduled report was not created.');
    expect(body.tier, 'the 403 named a plan nobody read').toBeNull();
  });

  it('control: a read standard plan is refused for the plan it is', async () => {
    stubTier('standard');
    const verdict = await scheduledReportsEntitled(7);
    expect(verdict).toMatchObject({ entitled: false, tierResolved: true, tier: 'standard' });
    expect(scheduledReportsRefusal(verdict)).toMatchObject({
      error: 'Scheduled reports require the professional plan.', tier: 'standard', requiredTier: 'professional',
    });
  });

  it('control: a read professional plan is entitled', async () => {
    stubTier('professional');
    expect(await scheduledReportsEntitled(7)).toMatchObject({ entitled: true, tierResolved: true, tier: 'professional' });
  });
});

describe('scheduledReportsVerdict', () => {
  it('entitles nothing on a tier that was not read, whatever tier it is handed', () => {
    expect(scheduledReportsVerdict('enterprise', false), 'an unread tier entitled scheduled reports')
      .toMatchObject({ entitled: false, tierResolved: false, tier: null });
  });

  it('control: a tier in hand defaults to read', () => {
    expect(scheduledReportsVerdict('enterprise')).toMatchObject({ entitled: true, tierResolved: true, tier: 'enterprise' });
  });
});
