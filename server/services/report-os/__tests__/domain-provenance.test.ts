import { beforeEach, describe, expect, it, vi } from 'vitest';
const q = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: q.query }, db: {} }));
import { computeDomainReport } from '../research-compliance-report-providers';

beforeEach(() => q.query.mockReset().mockResolvedValue({ rows: [{ k: 'signed', n: 2 }] }));
describe('domain report evidence and client scope', () => {
  it('retains the exact aggregate input, query criteria and source atoms', async () => {
    const report = await computeDomainReport('fcoi.disclosure_register', 7);
    expect(report?.computedScope).toBe('organization');
    expect(report?.provider.atoms).toContainEqual(expect.objectContaining({ sourceTable: 'financial_disclosures', transformation: 'aggregation' }));
    expect(report?.provenance.queries[0]).toMatchObject({ parameters: [7], rows: [{ k: 'signed', n: 2 }] });
  });
  it('refuses unsupported client filtering before reading any domain rows', async () => {
    await expect(computeDomainReport('fcoi.disclosure_register', 7, { clientWorkspaceId: 3 })).rejects.toMatchObject({ code: 'REPORT_CLIENT_SCOPE_UNSUPPORTED' });
    expect(q.query).not.toHaveBeenCalled();
  });
  it('filters award children and proposals to the project for a grants report', async () => {
    q.query.mockResolvedValue({ rows: [{ k: 'active', n: 2, s: 0 }] });
    const report = await computeDomainReport('grants.portfolio_register', 7, { scopeType: 'project', scopeId: '11' });
    expect(report?.computedScope).toBe('project');
    for (const [query, params] of q.query.mock.calls) {
      expect(params).toEqual([7, 11]);
      expect(query).toMatch(/project_id\s*=\s*\$2/);
      expect(query).toMatch(/organization_id\s*=\s*\$1/);
    }
  });
  it('keeps the scorecard source aggregates and fails when a contributing domain cannot be read', async () => {
    q.query.mockResolvedValue({ rows: [{ k: 'active', n: 0, s: 0 }] });
    const report = await computeDomainReport('research_admin.scorecard', 7);
    expect(report?.provenance.queries.length).toBeGreaterThan(20);
    expect(report?.provider.atoms).toContainEqual(expect.objectContaining({ sourceTable: 'financial_disclosures' }));
    q.query.mockRejectedValueOnce(new Error('domain table unavailable'));
    await expect(computeDomainReport('research_admin.scorecard', 7)).rejects.toThrow('domain table unavailable');
  });
});
