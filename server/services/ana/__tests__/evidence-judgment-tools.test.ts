/** Registered tool boundaries must preserve scientific uncertainty for synthesis. */
import { describe, it, expect, type Mock } from 'vitest';
import { mockPool } from '../../../../tests/setup';
(mockPool.connect as unknown as Mock).mockResolvedValue({
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
  release: () => undefined,
});
const { ALL_ANA_TOOLS } = await import('../AnaToolDefinitions.js');
const { getToolHandler } = await import('../AnaToolExecutor.js');
const call = async (name: string, input: Record<string, unknown>) => {
  expect(ALL_ANA_TOOLS.some(tool => tool.name === name)).toBe(true);
  return JSON.parse(await getToolHandler(name)!(input));
};

describe('registered evidence judgment tools', () => {
  it('retains unresolved dated conflict and source provenance in the actual handler output', async () => {
    const report = await call('detect_evidence_contradictions', { claims: [
      { id: 'old', source: 'study-A', subject: 'product', metric: 'efficacy', polarity: 'positive', date: '2024-01-01' },
      { id: 'new', source: 'study-B', subject: 'product', metric: 'efficacy', polarity: 'negative', date: '2026-01-01' },
    ] });
    expect(report.contradictions).toHaveLength(1);
    expect(report.contradictions[0]).toMatchObject({ claimA: { id: 'old', source: 'study-A' }, claimB: { id: 'new', source: 'study-B' } });
    expect(report.contradictions[0].detail).toMatch(/dates alone do not establish which claim controls/);
    expect(report.contradictions[0].detail).not.toMatch(/supersedes/);
  });
  it('does not declare a numerical contradiction across incompatible measurement units', async () => {
    const report = await call('detect_evidence_contradictions', { claims: [
      { id: 'dose-mg', subject: 'product', metric: 'dose', value: 1, unit: 'mg' },
      { id: 'dose-ug', subject: 'product', metric: 'dose', value: 1000, unit: 'micrograms' },
    ] });
    expect(report.contradictions).toEqual([]);
    expect(report.notes.join(' ')).toMatch(/unit/i);
    expect(report.notes.join(' ')).toContain('dose-mg');
  });
  it('reports only metadata gaps across the five requested markets, preserving applicability limits', async () => {
    const report = await call('detect_evidence_gaps', {
      query: { regions: ['EU', 'US', 'JP', 'CA', 'CN'], population: 'pediatric', outcomeTypes: ['safety'] },
      evidence: [{ region: 'US', population: 'not pediatric', outcomeType: 'safety', year: 2025 }],
    });
    expect(report.assessed).toBe(true);
    expect(report.complete).toBe(false);
    expect(report.gaps[0].missing).toEqual(['EU', 'JP', 'CA', 'CN']);
    expect(report.gaps[1].type).toBe('population');
    expect(report.notes.join(' ')).toMatch(/does not prove.*jointly supported/);
    expect(report.gaps[0].description).toMatch(/structured fields do not confirm/);
  });
  it('does not report completeness when the caller supplies no assessment criteria', async () => {
    const report = await call('detect_evidence_gaps', { query: {}, evidence: [{ region: 'US' }] });
    expect(report).toMatchObject({ assessed: false, complete: false, gaps: [] });
    expect(report.notes.join(' ')).toMatch(/not assessed/);
  });
});
