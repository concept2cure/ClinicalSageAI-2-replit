/**
 * assess_biomarker_clinical_validation computes its 2x2 on the one 2x2 engine,
 * computeDiagnosticAccuracy (stats/clinical-performance), so a table that
 * cannot give a metric goes back to the user instead of becoming a 0% metric
 * (Rule 2 audit S3, 2026-10-26).
 *
 * Until then assessBiomarkerClinicalValidation kept a second 2x2 of its own:
 * a table with no diseased subjects came back status 'computed' with
 * clinicalSensitivity 0 and "Clinical sensitivity (0%) ... below a typical 80%
 * threshold"; no non-diseased subjects gave specificity 0; an empty table gave
 * every metric as 0; a negative count was clamped to 0; an intended-use
 * prevalence of 1.5 was clamped to 1, and a null one was read as 0 (with a
 * "low intended-use prevalence supplied" caution); no test-positives gave PPV
 * 0; and no metric carried an interval. runStatsTool relays the engine's
 * "... are required" / "... must be ..." refusals as needs_parameters; an
 * all-zero table ("Confusion matrix is empty.") comes back as an error.
 */
import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { assessBiomarkerClinicalValidation } from '../../biomarkers/biomarker-knowledge';
import { computeDiagnosticAccuracy } from '../../stats/clinical-performance';

const VALIDATED = { cutoffPrespecified: true, independentValidationSet: true };
const NO_DISEASED = { biomarkerName: 'HER2', truePositives: 0, falseNegatives: 0, trueNegatives: 45, falsePositives: 5, ...VALIDATED };
const NO_NON_DISEASED = { biomarkerName: 'HER2', truePositives: 45, falseNegatives: 5, trueNegatives: 0, falsePositives: 0, ...VALIDATED };
const EMPTY = { biomarkerName: 'HER2', truePositives: 0, falseNegatives: 0, trueNegatives: 0, falsePositives: 0 };
const COMPLETE = { biomarkerName: 'HER2', truePositives: 45, falseNegatives: 5, trueNegatives: 90, falsePositives: 10, ...VALIDATED };

/** The engine's own rounding (4 dp), so the comparison is exact. */
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

async function call(input: Record<string, unknown>): Promise<Record<string, any>> {
  const handler = getToolHandler('assess_biomarker_clinical_validation');
  expect(handler, 'assess_biomarker_clinical_validation has a handler').toBeTypeOf('function');
  return JSON.parse(await handler!(input, {} as any)) as Record<string, any>;
}

describe('assessBiomarkerClinicalValidation — an empty stratum is refused, not reported as 0%', () => {
  it('does not establish validity or presume a cutoff when prespecification is unstated', () => {
    const out = assessBiomarkerClinicalValidation({ ...COMPLETE, cutoffPrespecified: undefined });
    expect(out.validityEstablished).toBe(false);
    expect(out.cutoffNote).toMatch(/not stated/i);
    expect(out.findings.some(f => /cutoff.*not stated/i.test(f.message))).toBe(true);
  });

  it('refuses a table with no diseased subjects instead of returning sensitivity 0', () => {
    expect(() => assessBiomarkerClinicalValidation(NO_DISEASED)).toThrow(
      /reference-positive and reference-negative cases are required/,
    );
  });

  it('refuses a table with no non-diseased subjects instead of returning specificity 0', () => {
    expect(() => assessBiomarkerClinicalValidation(NO_NON_DISEASED)).toThrow(
      /reference-positive and reference-negative cases are required/,
    );
  });

  it('refuses an empty table instead of reporting every metric as 0', () => {
    expect(() => assessBiomarkerClinicalValidation(EMPTY)).toThrow(/empty/);
  });

  it('reports the sensitivity, specificity and exact intervals computeDiagnosticAccuracy gives', () => {
    const r = assessBiomarkerClinicalValidation(COMPLETE);
    const canonical = computeDiagnosticAccuracy({ tp: 45, fp: 10, fn: 5, tn: 90 });
    expect(r.clinicalSensitivity).toBe(r4(canonical.sensitivity));
    expect(r.clinicalSpecificity).toBe(r4(canonical.specificity));
    expect(r.clinicalSensitivityCi).toEqual({
      lower: r4(canonical.sensitivityCi.lower),
      upper: r4(canonical.sensitivityCi.upper),
    });
    expect(r.clinicalSpecificityCi).toEqual({
      lower: r4(canonical.specificityCi.lower),
      upper: r4(canonical.specificityCi.upper),
    });
    expect(r.validityEstablished).toBe(true);
  });

  it('reports PPV as undefined (null), not 0, when no subject tested positive', () => {
    const r = assessBiomarkerClinicalValidation({
      biomarkerName: 'HER2',
      truePositives: 0,
      falseNegatives: 10,
      trueNegatives: 40,
      falsePositives: 0,
    });
    expect(r.ppvApparent).toBeNull();
    expect(r.npvApparent).toBe(0.8);
    expect(r.validityEstablished).toBe(false);
  });

  it('a null intended-use prevalence is not stated, not 0: no re-projection and no low-prevalence caution', () => {
    const r = assessBiomarkerClinicalValidation({
      ...COMPLETE,
      intendedUsePrevalence: null as unknown as number,
    });
    expect(r.ppvAtIntendedPrevalence).toBeUndefined();
    expect(r.npvAtIntendedPrevalence).toBeUndefined();
    expect(r.intendedUsePrevalence).toBeUndefined();
    expect(r.findings.some((f) => /low intended-use prevalence/.test(f.message))).toBe(false);
  });
});

describe('assess_biomarker_clinical_validation — the tool asks for what the table lacks', () => {
  it('no diseased subjects: needs_parameters, never a computed 0% sensitivity', async () => {
    const out = await call(NO_DISEASED);
    expect(out.status).toBe('needs_parameters');
    expect(String(out.message)).toMatch(/reference-positive and reference-negative cases are required/);
    expect(out.result).toBeUndefined();
  });

  it('no non-diseased subjects: needs_parameters, never a computed 0% specificity', async () => {
    const out = await call(NO_NON_DISEASED);
    expect(out.status).toBe('needs_parameters');
    expect(out.result).toBeUndefined();
  });

  it('an all-zero table: no computed metrics, and the reply names the empty table', async () => {
    const out = await call(EMPTY);
    expect(out.status).not.toBe('computed');
    expect(out.result).toBeUndefined();
    expect(JSON.stringify(out)).toMatch(/Confusion matrix is empty/);
  });

  it('a negative count: needs_parameters, not clamped to 0', async () => {
    const out = await call({ ...COMPLETE, truePositives: -3 });
    expect(out.status).toBe('needs_parameters');
    expect(String(out.message)).toMatch(/must be a non-negative safe integer/);
  });

  it('an intended-use prevalence outside [0, 1]: needs_parameters, not clamped', async () => {
    const out = await call({ ...COMPLETE, intendedUsePrevalence: 1.5 });
    expect(out.status).toBe('needs_parameters');
    expect(String(out.message)).toMatch(/prevalence must be in \[0, 1\]/);
  });

  it('a complete table is computed, with exact intervals on both metrics', async () => {
    const out = await call(COMPLETE);
    expect(out.status).toBe('computed');
    expect(out.result.clinicalSensitivity).toBe(0.9);
    expect(out.result.clinicalSpecificity).toBe(0.9);
    expect(out.result.clinicalSensitivityCi.lower).toBeLessThan(0.9);
    expect(out.result.clinicalSensitivityCi.upper).toBeGreaterThan(0.9);
    expect(out.result.clinicalSpecificityCi.lower).toBeLessThan(0.9);
    expect(out.result.clinicalSpecificityCi.upper).toBeGreaterThan(0.9);
  });
});
