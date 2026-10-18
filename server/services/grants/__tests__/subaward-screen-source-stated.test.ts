/**
 * A subaward screen records the source it was run against, as stated.
 *
 * screenSubawardTx defaulted the source to 'sam_exclusions' (and AnA's
 * screen_subaward did the same), so recording "cleared" stamped the row
 * "screened against SAM.gov exclusions today" whether or not any lookup ran —
 * a 2 CFR 200.214 attestation with invented provenance. COALESCE also kept an
 * earlier screen's source under a new result. Only the database is replaced.
 */
import { describe, expect, it } from 'vitest';

import { screenSubawardTx } from '../grants-service';

function client() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
}

describe('screenSubawardTx', () => {
  it('refuses a screen that names no source, and writes nothing', async () => {
    const c = client();
    await expect(screenSubawardTx(c as never, 5, 9, { screenStatus: 'cleared' })).rejects.toThrow(/source/i);
    await expect(screenSubawardTx(c as never, 5, 9, { screenStatus: 'cleared', screenSource: '  ' })).rejects.toThrow(/source/i);
    expect(c.calls).toEqual([]);
  });

  it('records the stated source for this screen, not an earlier one', async () => {
    const c = client();
    await screenSubawardTx(c as never, 5, 9, { screenStatus: 'cleared', screenSource: 'sam_exclusions:receipt-4471' });
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].params).toContain('sam_exclusions:receipt-4471');
    expect(c.calls[0].sql).not.toMatch(/COALESCE\(\$4/);
  });
});
