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

describe('evidence assessment input integrity', () => {
  it.each([
    { query: { regions: 'JP' }, evidence: [] },
    { query: { regions: ['US', 7] }, evidence: [{ region: 'US' }] },
    { query: { population: 7 }, evidence: [{ population: 'adult' }] },
    { query: { regions: ['JP'], markets: ['US'] }, evidence: [{ region: 'JP' }] },
    { query: [], evidence: [] },
    { query: { regions: ['US'] }, evidence: [{ region: 'US' }, null] },
    { query: { regions: ['US'] }, evidence: [{ region: 7 }] },
    { query: { regions: ['US'] }, evidence: 'unavailable' },
    { query: { outcomeTypes: ['approval'] }, evidence: [{ outcomeType: 'approval' }] },
    { query: null, evidence: [] },
    { evidence: [] },
    { query: { regions: ['US'] } },
  ])('reports invalid coverage input as unassessed rather than a partial coverage verdict: %j', async input => {
    const report = await call('detect_evidence_gaps', input);
    expect(report).toMatchObject({ assessed: false, complete: false, gaps: [] });
    expect(report.inputIssues.length).toBeGreaterThan(0);
    expect(report.notes.join(' ')).toMatch(/not assessed/i);
  });
  it.each([
    { claims: 'unavailable' },
    {},
    { claims: [{ subject: 'product', metric: 'dose', value: 1 }, { subject: 'product', metric: 7, value: 10 }] },
    { claims: [{ subject: 'product', polarity: 'positive' }, { subject: 'product', polarity: 'POSITIVE' }] },
    { claims: [{ subject: 'product', metric: 'dose', value: '1' }, { subject: 'product', metric: 'dose', value: 10 }] },
    { claims: [{ subject: 'product', metric: 'dose', value: 1 }, null] },
    { claims: [{ subject: 'product', metric: 'dose', value: 1 }, { subject: 'product', metric: 'dose', value: 10 }], relativeTolerance: -1 },
    { claims: [{ subject: 'product', metric: 'dose', value: 1 }, { subject: 'product', metric: 'dose', value: 10 }], relativeTolerance: '0.1' },
  ])('does not assess malformed claims or silently replace an invalid tolerance: %j', async input => {
    const report = await call('detect_evidence_contradictions', input);
    expect(report).toMatchObject({ assessed: false, contradictions: [], checkedClaims: 0 });
    expect(report.inputIssues.length).toBeGreaterThan(0);
    expect(report.notes.join(' ')).toMatch(/not assessed/i);
  });
  it.each([
    [],
    [{ subject: 'product', metric: 'dose', value: 1 }],
    [{ subject: 'product', metric: 'dose', value: 1, unit: 'mg' }, { subject: 'product', metric: 'dose', value: 1000, unit: 'micrograms' }],
    [{ subject: 'product', metric: 'efficacy', polarity: 'positive' }, { subject: 'product', metric: 'safety', polarity: 'negative' }],
  ].map(claims => ({ claims })))('marks a lack of comparable pairs as unassessed: %j', async ({ claims }) => {
    const report = await call('detect_evidence_contradictions', { claims });
    expect(report).toMatchObject({ assessed: false, comparedPairs: 0, contradictions: [] });
    expect(report.notes.join(' ')).toMatch(/not assessed/i);
    expect(report.inputIssues).toEqual([]);
  });
  it('counts a real structural comparison without claiming scientific consistency', async () => {
    const report = await call('detect_evidence_contradictions', { claims: [
      { subject: 'product', metric: 'dose', value: 1, unit: 'mg' },
      { subject: 'product', metric: 'dose', value: 1, unit: 'mg' },
    ] });
    expect(report).toMatchObject({ assessed: true, comparedPairs: 1, contradictions: [], inputIssues: [] });
    expect(report.notes.join(' ')).toMatch(/not that the evidence is necessarily consistent/);
  });
});

it('distinguishes a valid empty evidence search from unavailable input', async () => {
  const report = await call('detect_evidence_gaps', { query: { regions: ['US'] }, evidence: [] });
  expect(report).toMatchObject({ assessed: true, complete: false, inputIssues: [], evidenceCount: 0 });
  expect(report.gaps[0].missing).toEqual(['US']);
});

it.each([NaN, Infinity])('rejects a non-finite numerical tolerance instead of using the default: %s', async relativeTolerance => {
  const report = await call('detect_evidence_contradictions', { claims: [], relativeTolerance });
  expect(report).toMatchObject({ assessed: false, comparedPairs: 0 });
  expect(report.inputIssues).toContain('relativeTolerance must be a finite non-negative number when supplied.');
});

it('retains explicit zero tolerance as a valid assessment parameter', async () => {
  const report = await call('detect_evidence_contradictions', { relativeTolerance: 0, claims: [
    { subject: 'product', metric: 'dose', value: 1, unit: 'mg' },
    { subject: 'product', metric: 'dose', value: 1.01, unit: 'mg' },
  ] });
  expect(report).toMatchObject({ assessed: true, comparedPairs: 1, inputIssues: [] });
  expect(report.contradictions[0].type).toBe('numerical_mismatch');
});
