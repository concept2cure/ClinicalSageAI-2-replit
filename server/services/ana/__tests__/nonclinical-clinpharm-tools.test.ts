/**
 * Smoke tests for the nonclinical & clinical-pharmacology ANA tool handlers:
 *   - compute_fih_dose                (NOAEL→HED→MRSD vs MABEL)
 *   - classify_tox_findings           (toxicologic-pathology adversity)
 *   - select_exposure_response_dose   (Project Optimus dose selection)
 *
 * The underlying engines are pure (no DB, no network), so these exercise the
 * full wiring offline: registration, needs-parameters behaviour, and a real
 * computed result through the handler.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const NEW_TOOLS = ['compute_fih_dose', 'classify_tox_findings', 'select_exposure_response_dose'] as const;

describe('nonclinical & clin-pharm tools — registration + exposure', () => {
  for (const name of NEW_TOOLS) {
    it(`registers a handler and exposes ${name} in ALL_ANA_TOOLS`, () => {
      expect(getToolHandler(name)).toBeDefined();
      expect(ALL_ANA_TOOLS.some(t => t.name === name)).toBe(true);
    });
  }
});

describe('compute_fih_dose handler', () => {
  it('returns needs_parameters when no species are supplied', async () => {
    const handler = getToolHandler('compute_fih_dose')!;
    const out = JSON.parse(await handler({ speciesNoaels: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('computes the MABEL-limited worked example', async () => {
    const handler = getToolHandler('compute_fih_dose')!;
    const out = JSON.parse(
      await handler({
        speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }],
        mabel: { minAnticipatedEffectiveExposure: 10, exposurePerMgDose: 1 },
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.limitedBy).toBe('MABEL');
    expect(out.recommendedStartingDoseMg).toBe(10);
  });
});

describe('classify_tox_findings handler', () => {
  it('returns needs_parameters without findings', async () => {
    const handler = getToolHandler('classify_tox_findings')!;
    const out = JSON.parse(await handler({ findings: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('classifies hepatocellular hypertrophy as adaptive', async () => {
    const handler = getToolHandler('classify_tox_findings')!;
    const out = JSON.parse(
      await handler({ findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }] }),
    );
    expect(out.status).toBe('classified');
    expect(out.adaptiveFindings).toHaveLength(1);
    expect(out.overviewParagraph).toMatch(/adaptive|non-adverse/i);
  });
});

describe('select_exposure_response_dose handler', () => {
  it('returns needs_parameters without an exposure mapping', async () => {
    const handler = getToolHandler('select_exposure_response_dose')!;
    const out = JSON.parse(
      await handler({ dosesMg: [100], efficacy: { ec50: 50 }, safety: { thresholdExposure: 300 } }),
    );
    expect(out.status).toBe('needs_parameters');
  });

  it('accepts an array-form exposuresByDose and computes a result', async () => {
    const handler = getToolHandler('select_exposure_response_dose')!;
    const out = JSON.parse(
      await handler({
        dosesMg: [100, 200],
        exposuresByDose: [
          { doseMg: 100, exposure: 50 },
          { doseMg: 200, exposure: 400 },
        ],
        efficacy: { ec50: 60 },
        safety: { thresholdExposure: 300 },
        targetEfficacyFraction: 0.5,
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.predictions.find((p: { doseMg: number }) => p.doseMg === 200)?.exposure).toBe(400);
  });
});
