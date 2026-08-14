/**
 * CRL trigger patterns move to the database WITHOUT ever being able to go empty.
 *
 * ── The property this exists to guarantee ────────────────────────────────────
 * ADR 0013 made `precedent-engine` authoritative on one fact: `regulatory_intel`
 * shipped zero rows, so the better-factored module answered `[]` for every
 * tenant — and "no CRL triggers found" reads as "low risk", which is the most
 * dangerous direction for a regulatory tool to be wrong in.
 *
 * The seed (migrations/20260814n) fixes the empty store. This file guards the
 * thing that makes the cutover safe REGARDLESS of whether the seed ran:
 *
 *   store has rows        → the store wins
 *   store is empty        → the curated inline patterns stand
 *   store does not exist  → the curated inline patterns stand
 *   the query throws      → the curated inline patterns stand
 *
 * Only the first case may override the shipped knowledge. Every other case
 * falls back, because an empty result and an unprovisioned environment are
 * indistinguishable at this layer, and treating either as "no risk" is the
 * failure the ADR was written about.
 *
 * These are the tests that let the seed be deployed to some environments and
 * not others without anybody having to check which.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({ pool: { query } }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { precedentEngine } from '../precedent-engine';

const INPUT = { submissionType: 'NDA', therapeuticArea: 'Oncology' } as any;

beforeEach(() => { query.mockReset(); });

/** Only the CRL-pattern SELECT; the engine may issue others. */
function crlQueryCalls() {
  return query.mock.calls.filter(c => String(c[0]).includes('crl_trigger_patterns'));
}

describe('CRL patterns fall back rather than ever reporting no risk', () => {
  it('an UNPROVISIONED store (42P01) still returns the curated patterns', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation "regulatory_intel.crl_trigger_patterns" does not exist'), { code: '42P01' }));
    const result = await precedentEngine.analyzeCRLTriggers(INPUT);
    // The exact number is not the point; "more than none" is the whole point.
    expect(result.totalPatterns ?? result.triggers?.length ?? 0).toBeGreaterThan(0);
  });

  it('an EMPTY store still returns the curated patterns', async () => {
    // The case that would otherwise silently zero out the risk assessment the
    // day the table is created and before it is seeded.
    query.mockResolvedValue({ rows: [] });
    const result = await precedentEngine.analyzeCRLTriggers(INPUT);
    expect(result.totalPatterns ?? result.triggers?.length ?? 0).toBeGreaterThan(0);
  });

  it('a THROWING store still returns the curated patterns', async () => {
    query.mockRejectedValue(new Error('connection terminated'));
    const result = await precedentEngine.analyzeCRLTriggers(INPUT);
    expect(result.totalPatterns ?? result.triggers?.length ?? 0).toBeGreaterThan(0);
  });

  it('a POPULATED store overrides the curated patterns', async () => {
    query.mockImplementation(async (sql: string) =>
      String(sql).includes('crl_trigger_patterns')
        ? {
            rows: [{
              pattern_name: 'Tenant-specific dissolution failure',
              category: 'cmc_quality',
              trigger_description: 'Dissolution profile diverged from the reference product',
              frequency_rate: '0.4200',
              resolution_difficulty: 'high',
              submission_types: ['NDA'],
            }],
          }
        : { rows: [] });
    const result = await precedentEngine.analyzeCRLTriggers(INPUT);
    const names = JSON.stringify(result);
    expect(names).toContain('Tenant-specific dissolution failure');
    // And the curated set is no longer in play — the store is authoritative
    // once it can actually answer.
    expect(names).not.toContain('Efficacy Endpoint Failure');
  });

  it('reads the platform tier and the tenant together, never another tenant', async () => {
    query.mockResolvedValue({ rows: [] });
    await precedentEngine.analyzeCRLTriggers({ ...INPUT, organizationId: 'aaaaaaaa-0000-0000-0000-000000000001' });
    const call = crlQueryCalls()[0];
    expect(call).toBeTruthy();
    const params = call![1] as unknown[];
    const orgs = params[0] as string[];
    expect(orgs).toContain('00000000-0000-0000-0000-000000000000'); // platform
    expect(orgs).toContain('aaaaaaaa-0000-0000-0000-000000000001'); // this tenant
    expect(orgs).toHaveLength(2);
  });

  it('asks for the platform tier ALONE when there is no organization', async () => {
    // A caller with no org must not accidentally widen to every row.
    query.mockResolvedValue({ rows: [] });
    await precedentEngine.analyzeCRLTriggers(INPUT);
    const call = crlQueryCalls()[0];
    expect(call).toBeTruthy();
    expect(call![1] as unknown[]).toEqual([['00000000-0000-0000-0000-000000000000']]);
  });

  it('scopes by organization in the SQL, not after the fact', async () => {
    query.mockResolvedValue({ rows: [] });
    await precedentEngine.analyzeCRLTriggers(INPUT);
    const sql = String(crlQueryCalls()[0]?.[0] ?? '');
    expect(sql).toMatch(/WHERE\s+organization_id\s*=\s*ANY/i);
  });
});
