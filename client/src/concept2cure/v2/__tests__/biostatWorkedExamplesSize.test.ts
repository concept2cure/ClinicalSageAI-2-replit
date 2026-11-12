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

describe('Biostatistics worked examples', () => {
  it.each(Object.entries(BIOSTAT_WORKED_EXAMPLES))('%s is sized by the engine', (_key, preset) => {
    const result = computationEngine.compute(preset.input as never);
    expect(result.sampleSize.total).toBeGreaterThan(0);
  });
});
