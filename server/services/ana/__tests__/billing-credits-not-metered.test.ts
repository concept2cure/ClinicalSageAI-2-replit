/**
 * get_billing_credits says the credits are not metered (app audit 2026-10-17).
 *
 * The credit ledger has a balance and no spender: debitCredits
 * (services/credit-ledger.ts) has no caller, so nothing the platform does
 * draws the balance down. The billing screen stopped showing the balance on
 * 2026-10-17; AnA's tool still reported it as a live usage balance, so a client
 * asking "how many credits have I used" was answered from a number nothing moves.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../credit-ledger.js', () => ({
  getCreditBalance: async () => 5000,
  getCreditLedger: async () => [],
  getAutoReload: async () => ({ enabled: false }),
}));

import { getToolHandler } from '../AnaToolExecutor';
import { GET_BILLING_CREDITS } from '../document-surface-tool-defs';

describe('get_billing_credits', () => {
  it('reports the balance as not metered, with nothing spending it', async () => {
    const out = JSON.parse(await getToolHandler('get_billing_credits')!({}, { organizationId: 7, userId: 1 } as never));
    expect(out.ok).toBe(true);
    expect(out.metered).toBe(false);
    expect(out.note).toMatch(/not metered/i);
  });

  it('its definition does not offer the balance as usage', () => {
    expect(GET_BILLING_CREDITS.description).toMatch(/not metered/i);
  });
});
