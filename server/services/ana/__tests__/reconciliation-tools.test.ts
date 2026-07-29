/**
 * Verifies the reconcile_extracted_figures tool is (a) registered as an AnA tool
 * handler and (b) wired to the deterministic dossier-number reconciler with
 * correct argument mapping, by exercising it through the public getToolHandler()
 * seam and checking the deterministic envelope. This is the cross-module
 * reconciliation check_numerical_integrity (within one document) and
 * check_dossier_consistency (pairwise) lack.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { RECONCILIATION_TOOLS } from '../reconciliationTools';

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name} must be registered`).toBeTruthy();
  const raw = await handler!(input, ctx);
  return JSON.parse(raw as string);
}

describe('reconciliation tools — registration', () => {
  it('every defined tool has a registered handler', () => {
    for (const tool of RECONCILIATION_TOOLS) {
      expect(getToolHandler(tool.name), `${tool.name} handler`).toBeTruthy();
    }
    expect(RECONCILIATION_TOOLS).toHaveLength(1);
    expect(RECONCILIATION_TOOLS[0].name).toBe('reconcile_extracted_figures');
  });
});

describe('reconcile_extracted_figures — cross-document reconciliation', () => {
  it('a clean dossier (all sources agree) yields zero conflicts', async () => {
    const out = await call('reconcile_extracted_figures', {
      figures: [
        { quantityKey: 'enrolled_n', value: 648, source: { documentId: 'm25', module: '2.5' } },
        { quantityKey: 'enrolled_n', value: 648, source: { documentId: 'm273', module: '2.7.3' } },
        { quantityKey: 'enrolled_n', value: 648, source: { documentId: 'csr', module: '5.3.5.1' } },
        { quantityKey: 'primary_endpoint_effect', value: -1.2, unit: '%', source: { documentId: 'm25', module: '2.5' } },
        { quantityKey: 'primary_endpoint_effect', value: -1.2, unit: '%', source: { documentId: 'csr', module: '5.3.5.1' } },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.conflictCount).toBe(0);
    expect(out.result.verdict).toBe('clean');
    expect(out.result.quantityKeysExamined).toBe(2);
  });

  it('a divergent enrolled_n across 3 sources is one conflict with values, sources, and consensus', async () => {
    const out = await call('reconcile_extracted_figures', {
      figures: [
        { quantityKey: 'enrolled_n', value: 648, source: { documentId: 'm25', module: '2.5' } },
        { quantityKey: 'enrolled_n', value: 648, source: { documentId: 'm273', module: '2.7.3' } },
        { quantityKey: 'enrolled_n', value: 612, source: { documentId: 'csr', module: '5.3.5.1' } },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result.conflictCount).toBe(1);

    const conflict = out.result.conflicts[0];
    expect(conflict.quantityKey).toBe('enrolled_n');
    // enrolled_n is RTF territory ⇒ critical ⇒ blocker verdict.
    expect(conflict.severity).toBe('critical');
    expect(out.result.verdict).toBe('blocker');

    // Two distinct value clusters: 648 (two sources) and 612 (one source).
    const distinctValues = conflict.values.map((v: any) => v.value).sort((a: number, b: number) => a - b);
    expect(distinctValues).toEqual([612, 648]);

    const cluster648 = conflict.values.find((v: any) => v.value === 648);
    expect(cluster648.count).toBe(2);
    expect(cluster648.sources.map((s: any) => s.module).sort()).toEqual(['2.5', '2.7.3']);

    const cluster612 = conflict.values.find((v: any) => v.value === 612);
    expect(cluster612.count).toBe(1);
    expect(cluster612.sources[0].documentId).toBe('csr');

    // Consensus is the plurality value (648 has two sources vs 612's one).
    expect(conflict.consensus).toBe(648);
  });

  it('values within tolerance are not flagged', async () => {
    const out = await call('reconcile_extracted_figures', {
      figures: [
        { quantityKey: 'primary_endpoint_effect', value: 1.200, source: { documentId: 'm25', module: '2.5' } },
        { quantityKey: 'primary_endpoint_effect', value: 1.204, source: { documentId: 'csr', module: '5.3.5.1' } },
      ],
      tolerance: { absolute: 0.01 },
    });
    expect(out.status).toBe('computed');
    expect(out.result.conflictCount).toBe(0);
    expect(out.result.verdict).toBe('clean');
  });

  it('the same near-equal values ARE flagged when no tolerance is given (exact match)', async () => {
    const out = await call('reconcile_extracted_figures', {
      figures: [
        { quantityKey: 'primary_endpoint_effect', value: 1.200, source: { documentId: 'm25', module: '2.5' } },
        { quantityKey: 'primary_endpoint_effect', value: 1.204, source: { documentId: 'csr', module: '5.3.5.1' } },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result.conflictCount).toBe(1);
    expect(out.result.conflicts[0].severity).toBe('high');
    expect(out.result.verdict).toBe('needs_review');
  });

  it('relays missing figures as needs_parameters (does not throw)', async () => {
    const out = await call('reconcile_extracted_figures', { figures: [] });
    expect(out.status).toBe('needs_parameters');
    expect(typeof out.message).toBe('string');
  });

  it('relays a malformed figure (no source documentId) as needs_parameters', async () => {
    const out = await call('reconcile_extracted_figures', {
      figures: [{ quantityKey: 'enrolled_n', value: 648, source: {} }],
    });
    expect(out.status).toBe('needs_parameters');
  });
});
