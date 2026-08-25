/**
 * The AI provenance ledger invariant must fail production boots and only warn
 * elsewhere.
 *
 * The behaviour under test is the difference between the two environments. A
 * version that warned everywhere would be indistinguishable from the swallowed
 * `catch` that let this ledger record nothing for as long as it did; a version
 * that threw everywhere would block every developer whose local database has
 * not had the migration set applied.
 */

import { describe, it, expect, vi } from 'vitest';
import { assertAiProvenanceLedgerForProduction } from '../aiProvenanceLedgerInvariant';

const LEDGER_BROKEN = new Error('table ai.gateway_audit_log does not exist');

describe('assertAiProvenanceLedgerForProduction', () => {
  it('throws in production when the ledger is unwritable', async () => {
    await expect(
      assertAiProvenanceLedgerForProduction({
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
        assertReady: async () => { throw LEDGER_BROKEN; },
        logger: { warn: () => {} },
      }),
    ).rejects.toThrow(/FAIL-CLOSED.*gateway_audit_log/s);
  });

  it('warns rather than throwing outside production, and says AI calls are unrecorded', async () => {
    const warn = vi.fn();
    await expect(
      assertAiProvenanceLedgerForProduction({
        env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
        assertReady: async () => { throw LEDGER_BROKEN; },
        logger: { warn },
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/not being recorded/);
  });

  it('is silent when the ledger is healthy', async () => {
    const warn = vi.fn();
    await assertAiProvenanceLedgerForProduction({
      env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
      assertReady: async () => {},
      logger: { warn },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an unset NODE_ENV as non-production', async () => {
    const warn = vi.fn();
    await expect(
      assertAiProvenanceLedgerForProduction({
        env: {} as NodeJS.ProcessEnv,
        assertReady: async () => { throw LEDGER_BROKEN; },
        logger: { warn },
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
