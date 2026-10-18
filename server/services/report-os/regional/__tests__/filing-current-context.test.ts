/** Actual regional engine consumes current metadata before reading metrics.
 * SQL doubles qualify computation order, not native persistence or RLS. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('../../../../db', () => ({ pool: { query } }));
import { computeRegionalRun, RegionalNotComputed } from '../filing-readiness';
const NDA = 'usa_fda.nda_bla_filing_readiness';
const metricSql = /FROM sections|concept2cure_artifacts|c2c_rule_packs/;
let metadata: unknown;
beforeEach(() => {
  metadata = { registryId: 'US_NDA', submissionType: 'NDA' };
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('report_type_registry')) return { rows: [{ label: 'FDA NDA / BLA', governance_requirements: { region: 'USA_FDA' }, data_dependencies: [] }] };
    if (sql.includes('FROM projects')) return { rows: [{ metadata }] };
    if (metricSql.test(sql)) return { rows: [] };
    throw new Error('Unexpected query in regional engine contract');
  });
});
describe('regional execution shares strict recorded identity admission', () => {
  it.each([
    { registryId: 'US_NDA', submissionType: 'MAA' },
    { registryId: 'US_NDA', submissionType: 'unknown type' },
    { registryId: null, submissionType: 'NDA' },
    { registryId: '', submissionType: 'NDA' },
    { registryId: ['US_NDA'], submissionType: 'NDA' },
    '{"registryId":"US_NDA","submissionType":"MAA"}',
    { registryId: 'US_NDA', applicationNumber: true },
  ])('refuses invalid/conflicting current context without reading metrics (%j)', async invalid => {
    metadata = invalid;
    await expect(computeRegionalRun(NDA, 7, 'project', '11')).rejects.toThrow(RegionalNotComputed);
    expect(query.mock.calls.some(([sql]) => metricSql.test(sql))).toBe(false);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM projects'))).toHaveLength(1);
    expect(query.mock.calls.find(([sql]) => sql.includes('FROM projects'))?.[1]).toEqual([11, 7]);
  });
  it.each([{ registryId: 'US_NDA', submissionType: 'NDA' }, { submissionType: 'NDA' }, '{"registryId":"US_NDA"}'])('retains genuine recorded matching inputs (%j)', async valid => {
    metadata = valid;
    const run = await computeRegionalRun(NDA, 7, 'project', '11');
    expect(run.summary.market).toMatchObject({ applicationKind: 'nda', jurisdiction: 'US' });
  });
  it('reads the newly recorded filing each time rather than reusing the earlier matching result', async () => {
    await computeRegionalRun(NDA, 7, 'project', '11');
    const initialQueryCount = query.mock.calls.length;
    metadata = { registryId: 'EU_MAA' };
    await expect(computeRegionalRun(NDA, 7, 'project', '11')).rejects.toThrow(/assesses a US filing/);
    const secondRead = query.mock.calls.slice(initialQueryCount);
    expect(secondRead.filter(([sql]) => sql.includes('FROM projects'))).toHaveLength(1);
    expect(secondRead.some(([sql]) => metricSql.test(sql))).toBe(false);
  });
});
