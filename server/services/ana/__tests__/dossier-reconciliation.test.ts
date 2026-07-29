/**
 * Tests the dossier numerical reconciliation engine (cross-document figure
 * disagreement) and its AnA tool wiring.
 */
import { describe, it, expect } from 'vitest';

import { reconcileDossierNumbers } from '../dossierReconciliation';
import { getToolHandler } from '../AnaToolExecutor';

describe('reconcileDossierNumbers', () => {
  it('flags an enrolled-N disagreement across documents', () => {
    const out = reconcileDossierNumbers([
      { id: 'protocol', text: 'The study randomized 240 patients across 30 sites.' },
      { id: 'csr', title: 'CSR', text: 'A total of enrolled 238 subjects completed the trial at 30 centres.' },
    ]);
    const enrolled = out.discrepancies.find(d => d.label === 'enrolled_n');
    expect(enrolled).toBeTruthy();
    expect(enrolled!.distinctValues).toEqual([238, 240]);
    expect(enrolled!.occurrences.length).toBe(2);
    // sites agree (30 in both) → consistent, not a discrepancy.
    expect(out.discrepancies.find(d => d.label === 'sites')).toBeFalsy();
    expect(out.consistentLabels).toContain('sites');
  });

  it('flags alpha/power/HR drift between SAP and results', () => {
    const out = reconcileDossierNumbers([
      { id: 'sap', text: 'Two-sided alpha = 0.05 with power of 90%. Assumed hazard ratio of 0.70.' },
      { id: 'results', text: 'Significance level: 0.025. The study had power = 0.80, HR = 0.75.' },
    ]);
    const labels = out.discrepancies.map(d => d.label).sort();
    expect(labels).toEqual(['alpha', 'hazard_ratio', 'power']);
    const alpha = out.discrepancies.find(d => d.label === 'alpha')!;
    expect(alpha.distinctValues).toEqual([0.025, 0.05]);
    const power = out.discrepancies.find(d => d.label === 'power')!;
    expect(power.distinctValues).toEqual([0.8, 0.9]); // 90% normalized to fraction
  });

  it('reports no discrepancy when figures agree', () => {
    const out = reconcileDossierNumbers([
      { id: 'a', text: 'Enrolled 100 patients.' },
      { id: 'b', text: 'The trial randomized 100 participants.' },
    ]);
    expect(out.discrepancies).toHaveLength(0);
    expect(out.consistentLabels).toContain('enrolled_n');
  });

  it('throws a parameter error for malformed input', () => {
    expect(() => reconcileDossierNumbers([{ id: 'x' } as any])).toThrow(/string text|each document/);
  });
});

describe('reconcile_dossier_numbers tool', () => {
  it('is registered and returns discrepancies through the tool envelope', async () => {
    const handler = getToolHandler('reconcile_dossier_numbers');
    expect(handler).toBeTruthy();
    const raw = await handler!(
      {
        documents: [
          { id: 'm5', text: 'Randomized 500 subjects.' },
          { id: 'm2', text: 'Enrolled 480 patients.' },
        ],
      },
      {} as any,
    );
    const out = JSON.parse(raw as string);
    expect(out.status).toBe('computed');
    expect(out.result.discrepancies[0].label).toBe('enrolled_n');
    expect(out.result.discrepancies[0].distinctValues).toEqual([480, 500]);
  });

  it('relays malformed input as needs_parameters', async () => {
    const handler = getToolHandler('reconcile_dossier_numbers');
    const raw = await handler!({ documents: [{ id: 5 }] } as any, {} as any);
    const out = JSON.parse(raw as string);
    expect(out.status).toBe('needs_parameters');
  });
});
