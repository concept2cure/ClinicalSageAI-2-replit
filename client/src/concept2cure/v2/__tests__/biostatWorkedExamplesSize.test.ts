/**
 * Every worked example Biostatistics offers is sized by the engine (F1, 2026-11-10).
 *
 * A device or diagnostics project opens Biostatistics on the diagnostic-accuracy example. Since 2026-10-05 the
 * engine refuses that design without the margin to its performance goal (none is assumed), and the example gave
 * none: the page opened on a red "No document — the design was not sized". Each example here goes to the real
 * engine; one the engine refuses is a broken first screen.
 */
import { describe, expect, it } from 'vitest';
import { BIOSTAT_WORKED_EXAMPLES } from '../surfaces/biostatWorkedExamples';
import { computationEngine } from '../../../../../server/services/ana-biostats/computation-engine';
import { inputNormalizer } from '../../../../../server/services/ana-biostats/input-normalizer';

describe('Biostatistics worked examples', () => {
  it.each(Object.entries(BIOSTAT_WORKED_EXAMPLES))('%s is sized by the engine', (_key, preset) => {
    const result = computationEngine.compute(preset.input as never);
    expect(result.sampleSize.total).toBeGreaterThan(0);
  });

  /* The case above goes straight to the computation engine. The SCREEN does not: POST /api/ana-biostats/compute
     runs the input normalizer first and stops at `validation.valid === false`. So this suite passed while two of
     the six chips answered a red "The statistical engine did not size this design" in the running app
     (2026-11-12, found walking the page): "Non-inferiority" and "ROC / AUC" both state an effect size of 0 — the
     true difference a non-inferiority design assumes, and a figure an AUC design does not use — and the normalizer
     refused every design whose effect size is not positive. Each example now goes the way the screen sends it. */
  it.each(Object.entries(BIOSTAT_WORKED_EXAMPLES))('%s is admitted by the validator the route runs, and sized from what it normalises to', (_key, preset) => {
    const validation = inputNormalizer.normalize(preset.input as never);
    expect(validation.errors.map((e) => e.message)).toEqual([]);
    expect(validation.valid).toBe(true);
    const result = computationEngine.compute(validation.normalizedInput as never);
    expect(result.sampleSize.total).toBe(computationEngine.compute(preset.input as never).sampleSize.total);
  });
});
