/**
 * The `reconcile_dossier_numbers` tool envelope, over the one reconciler.
 *
 * 2026-10-19: this file replaces `dossier-reconciliation.test.ts`, which tested the engine
 * in `ana/dossierReconciliation.ts` — a second implementation of cross-document labelled-
 * figure reconciliation over a second copy of the lexicon. The engine's own cases moved to
 * `intelligence/__tests__/one-labelled-figure-extractor.test.ts`, which proves the
 * canonical extractor reads every label the deleted one had. What was only here is the tool
 * wiring, so that is what is here now.
 *
 * Two things changed with the fold, and both are improvements the tool now carries:
 *   - the labels are the canonical lexicon's (`sample_size`, not `enrolled_n`): one name
 *     per quantity is the point;
 *   - the report is `reconcileDossierNumbers`'s, the one cross-document grouping engine,
 *     so the tool gains its verdict — "nothing compared" is `not_assessed` with a reason
 *     and never 'clean'. The deleted implementation could not say that.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';

const call = async (input: unknown) => {
  const handler = getToolHandler('reconcile_dossier_numbers');
  expect(handler, 'reconcile_dossier_numbers is not registered').toBeTruthy();
  return JSON.parse((await handler!(input as never, {} as never)) as string);
};

describe('reconcile_dossier_numbers', () => {
  it('returns a cross-document discrepancy through the tool envelope', async () => {
    const out = await call({
      documents: [
        { id: 'm5', text: 'The study randomized 500 subjects across 30 sites.' },
        { id: 'm2', text: 'A total of enrolled 480 patients completed the trial.' },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    const n = out.result.conflicts.find((c: { quantityKey: string }) => c.quantityKey === 'sample_size');
    expect(n, JSON.stringify(out.result.conflicts)).toBeTruthy();
    expect(n.values.map((v: { value: number }) => v.value).sort((a: number, b: number) => a - b)).toEqual([480, 500]);
    expect(out.instruction).toMatch(/Surface each conflict/);
  });

  it('relays malformed input as needs_parameters, not as a result', async () => {
    const out = await call({ documents: [{ id: 5 }] });
    expect(out.status).toBe('needs_parameters');
  });

  it('a figure read in one document only is NOT reported as agreeing', async () => {
    // The deleted engine listed every label it saw once as `consistentLabels`, so a figure
    // nothing was compared against read as consistent. The canonical one separates them,
    // and the instruction tells the model to say so.
    const out = await call({
      documents: [
        { id: 'sap', text: 'A two-sided alpha = 0.05 was assumed throughout the study.' },
        { id: 'csr', text: 'The trial randomized 100 participants in all.' },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.result.notAssessedReason).toBe('no_shared_quantities');
    expect(out.result.quantitiesCompared).toBe(0);
    expect(out.instruction).toMatch(/NOTHING was compared/);
  });

  it('says plainly that nothing was compared when no figure is shared', async () => {
    const out = await call({
      documents: [
        { id: 'a', text: 'This section contains no labelled figure of any kind at all.' },
        { id: 'b', text: 'Neither does this one, which is also prose without numbers.' },
      ],
    });
    expect(out.result.conflictCount).toBe(0);
    expect(out.result.verdict).toBe('not_assessed');
    expect(out.result.notAssessedReason).toBe('no_figures');
    expect(out.instruction).toMatch(/NOTHING was compared/);
  });
});
