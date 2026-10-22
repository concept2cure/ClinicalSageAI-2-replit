/**
 * A generated report attests to what the system did, and to no compliance
 * nothing assessed.
 *
 * Every report the Intelligent Report Engine generated (POST
 * /api/intelligent-reports, and AnA's generate_report) wrote attestation rows
 * 'compliant' with constant scores — 21 CFR 11.10(e) 95, ALCOA+ 90,
 * methodology 85, AI transparency 100 — and each named framework
 * 'partially_compliant' 75, all verifiedBySystem, over no assessment at all;
 * and the report's own complianceScore was 60 x the share of sections with
 * content plus 10 per framework named.
 *
 * The database is the only thing replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));
vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        H.inserted.push(v);
        return { returning: async () => [{ id: H.inserted.length, ...v }] };
      },
    }),
  },
}));

import { intelligentReportEngine } from '../intelligent-report-engine';

const RECORD = { id: 41, contentHash: 'a'.repeat(64), merkleRoot: 'b'.repeat(64) };
const REQUEST = { organizationId: 7, domain: 'regulatory_submission', targetRegulatory: 'FDA', title: 'T' };

beforeEach(() => {
  H.inserted.length = 0;
});

describe('report attestations', () => {
  it('assert no compliance status or score that nothing assessed', async () => {
    const attest = (intelligentReportEngine as unknown as {
      generateAttestations: (r: unknown, q: unknown, f: string[], b: unknown[]) => Promise<unknown[]>;
    }).generateAttestations.bind(intelligentReportEngine);
    await attest(RECORD, REQUEST, ['ICH E6(R3)', '21 CFR Part 312'], []);

    expect(H.inserted.length).toBe(6);
    for (const row of H.inserted) {
      expect(row.complianceStatus).toBe('not_assessed');
      expect(row.complianceScore).toBeNull();
    }
    const statements = H.inserted.map((r) => String(r.attestationStatement)).join(' ');
    expect(statements).not.toMatch(/verified through|fully disclosed|validated "|aligned with|chain established/);
    const requirements = H.inserted.map((r) => String(r.requirementDescription)).join(' ');
    expect(requirements).not.toMatch(/assessed at time of report generation/);
  });
});
