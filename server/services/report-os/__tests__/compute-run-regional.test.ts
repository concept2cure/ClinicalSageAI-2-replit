import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../orchestrator', () => ({ computeInitialRun: vi.fn() }));

// Exercise the real dispatch AND regional engine; only the storage boundary is
// substituted. Mocking the regional computation hid the scheduled declaration bug.
import { computeRunForType, ReportTypeNotComputed } from '../compute-run';
import { computeInitialRun } from '../orchestrator';

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (statement: string) => {
    if (statement.includes('report_type_registry')) return { rows: [{ label: 'FDA NDA / BLA filing readiness', governance_requirements: { region: 'USA_FDA' }, data_dependencies: ['module_completeness'] }] };
    if (statement.includes('FROM projects')) return { rows: [{ metadata: { registryId: 'US_NDA' } }] };
    if (statement.includes('FROM sections')) return { rows: [{ section_id: '1.1', metadata: {} }] };
    if (statement.includes('concept2cure_artifacts')) return { rows: [] };
    if (statement.includes('c2c_rule_packs')) return { rows: [{ doc_type: 'nda', agency: 'fda', version: '1', label: 'FDA NDA pack' }] };
    throw new Error(`Unexpected statement: ${statement}`);
  });
});

const input = { engine: 'regional' as const, typeId: 'usa_fda.nda_bla_filing_readiness', organizationId: 3, scopeType: 'project', scopeId: '11' };

describe('shared regional dispatch', () => {
  it('reads the deployed type when a scheduled caller omits its declaration', async () => {
    const { computed } = await computeRunForType(input);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('report_type_registry'))).toBe(true);
    expect(computed.summary.market).toMatchObject({ jurisdiction: 'US', registryId: 'US_NDA' });
    expect(computed.confidence).toBeNull();
    expect(computed.providers).toContainEqual(expect.objectContaining({ provider: 'module_completeness', status: 'partial' }));
  });

  it('retains a supplied declaration and refuses its wrong region', async () => {
    await expect(computeRunForType({ ...input, declared: { region: 'EU_EMA' } })).rejects.toBeInstanceOf(ReportTypeNotComputed);
    expect(query).not.toHaveBeenCalled();
  });

  it('binds program output to a copy of the actual resolved project set', async () => {
    vi.mocked(computeInitialRun).mockResolvedValue({ providers: [], blockers: [], criticalBlockers: [], summary: {}, confidence: null });
    const projectIds = [11, 12];
    const result = await computeRunForType({ ...input, engine: 'readiness', scopeType: 'program', programProjectIds: projectIds });
    projectIds.push(99);
    expect(result.computed.summary.accessProjectIds).toEqual([11, 12]);
  });
});


it('retains contributing source projects as well as the selected program-group context', async () => {
  vi.mocked(computeInitialRun).mockResolvedValue({ providers: [], blockers: [], criticalBlockers: [], summary: { accessProjectIds: [12,21] }, confidence: null });
  const result = await computeRunForType({ ...input, engine: 'readiness', scopeType: 'program', programProjectIds: [11,12] });
  expect(result.computed.summary.accessProjectIds).toEqual([11,12,21]);
});
