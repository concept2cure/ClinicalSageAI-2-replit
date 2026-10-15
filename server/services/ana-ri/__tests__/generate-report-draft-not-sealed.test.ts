/**
 * AnA says a report it generated is a draft, not "cryptographically sealed".
 *
 * The ana-ri generate_report command answered every generation with "Report …
 * generated … Cryptographically sealed with verification code." The engine
 * creates the record with sealStatus 'draft'; sealing is a separate step
 * (POST /api/intelligent-reports/:id/seal). Only the engine is replaced.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../intelligent-report-engine.js', () => ({
  intelligentReportEngine: {
    generateReport: vi.fn(async () => ({ record: { id: 12, sealStatus: 'draft' }, verificationCode: 'C2C-ABCD' })),
  },
}));

import { generateReport } from '../command-executor';

describe('ana-ri generate_report', () => {
  it('reports a draft, and says it is not sealed', async () => {
    const r = await generateReport(
      { organizationId: 7, userId: 3 } as never,
      { domain: 'clinical_study', title: 'Phase 2 CSR' },
    );
    expect(r.success).toBe(true);
    expect(r.message).toMatch(/generated as a draft/);
    expect(r.message).toMatch(/not sealed/);
    expect(r.message).not.toMatch(/Cryptographically sealed/);
  });
});
