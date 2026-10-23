/**
 * The compliance briefing surfaces approved IACUC protocols whose expiry cannot
 * be determined.
 *
 * What it used to do (until 2026-10-15): the IACUC extractor read only
 * `expiringOrExpired`. The register counts an approval with neither an
 * expiration nor an approval date apart, as `approvedExpiryNotDetermined` — it
 * cannot be placed in the 90-day window either way — and the briefing dropped
 * it, so such a protocol never appeared as needing attention.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../report-os/research-compliance-report-providers', () => ({
  computeDomainReport: vi.fn(async (reportTypeId: string) =>
    reportTypeId === 'iacuc.protocol_register'
      ? { summary: { expiringOrExpired: 0, approvedExpiryNotDetermined: 2 } }
      : null,
  ),
}));

import { buildComplianceBriefing } from '../compliance-briefing';

describe('buildComplianceBriefing — IACUC', () => {
  it('lists approvals whose expiry is not determined as a warning', async () => {
    const b = await buildComplianceBriefing(7);
    expect(b.items).toEqual([
      expect.objectContaining({ domain: 'IACUC', count: 2, severity: 'warning', signal: expect.stringMatching(/expiry not determined/) }),
    ]);
  });
});
