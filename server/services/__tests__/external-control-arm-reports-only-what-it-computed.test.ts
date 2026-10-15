/**
 * The external control arm service reports only what it computed, under the
 * name of what it computed.
 *
 * Until 2026-10-15 (fabrication sweep report_e #10-#13, #26):
 *  - validateControl turned the synthesized CONTROL arm's own mean and SD into
 *    an "E-value" (no treatment effect exists anywhere in the service), with a
 *    "lower bound" of eValue - 0.5. Three arms under 'ipw' gave 29,342.7.
 *  - Covariate "balance" labelled the first ceil(k/2) historical arms, in row
 *    order, "treatment" and the rest "control".
 *  - With no propensity model, "overlap" was a sample-size ratio reported as 0%
 *    trimmed, propensity range 0-1, overlapping: true (Infinity > 0.2 when no
 *    arm reported n). An empty balance list gave maxSmd 0 and
 *    allCovariatesBalanced: true, so the verdict read "good" with nothing assessed,
 *    and the package reused whatever diagnostics were persisted.
 *  - 'naive_pooling' was described as pooling "individual patient-level"
 *    statistics (the service holds arm summaries only).
 *  - 'ipw' was described as inverse probability weighting that adjusted for
 *    observed differences; it is inverse-variance pooling of arm means, it echoed
 *    the requested covariates as covariatesUsed, it pooled an arm with no mean as
 *    mean 0, and its effectiveN (the Kish effective number of ARMS) was printed
 *    as "an effective sample size of 3 patients".
 *  - 'bayesian_borrowing' was described as borrowing set by commensurability with
 *    the current trial (no prior, posterior or current trial exists); an in-place
 *    sort gave each arm another arm's random-effects weight; Q was taken about
 *    the n-weighted mean; one arm reported tau-squared 0; effectiveN was
 *    totalN x an ad hoc index.
 *  - fitPropensityModel simulated patients from arm means plus RNG jitter, and
 *    'propensity_score' counted a covariate an arm did not report as 0.
 *
 * The database is a double that serves fixed rows by table name and records
 * writes; every figure asserted below is computed by the service from them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const S = vi.hoisted(() => ({
  arms: [] as Array<Record<string, unknown>>,
  control: null as Record<string, unknown> | null,
  models: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  type Table = Parameters<typeof getTableName>[0];
  const rowsOf = (t: Table): Array<Record<string, unknown>> => {
    const name = getTableName(t);
    if (name === 'arm_level_data') return S.arms;
    if (name === 'synthetic_controls') return S.control ? [S.control] : [];
    if (name === 'propensity_models') return S.models;
    throw new Error(`unexpected table ${name}`);
  };
  return {
    db: {
      select: () => ({ from: (t: Table) => ({ where: async () => rowsOf(t) }) }),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          returning: async () => {
            S.inserted.push(v);
            return [{ id: 9, ...v }];
          },
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            S.updated.push(v);
            if (S.control) Object.assign(S.control, v);
          },
        }),
      }),
    },
  };
});

import {
  ExternalControlArmService,
  describeSynthesisMethod,
  type SynthesisMethod,
} from '../external-control-arm-service';

const arm = (id: number, n: number | null, mean: number | null, sd: number | null, demographics: Row | null = null): Row => ({
  id, trialId: `T-${id}`, armName: `Arm ${id}`, armType: 'control', indication: 'NSCLC', phase: '3',
  n, mean, sd, proportion: null, dropoutRate: null, demographics,
});

/** The audit's probe: three historical arms of 100, 200 and 300 patients. */
const THREE_ARMS = (): Row[] => [arm(1, 100, -3.0, 10), arm(2, 200, -2.5, 10), arm(3, 300, -3.4, 10)];
/** Inverse-variance weights n/SD² of THREE_ARMS are 1, 2 and 3. */
const IV_MEAN = (-3.0 * 1 + -2.5 * 2 + -3.4 * 3) / 6;

const svc = new ExternalControlArmService();

async function synthesize(method: SynthesisMethod, covariates?: string[]): Promise<Row> {
  const control = await svc.synthesizeControl(
    { name: 'NSCLC control', indication: 'NSCLC', endpoint: 'ORR', method, sourceArmIds: S.arms.map(a => a.id as number), covariates },
    7,
    1,
  );
  S.control = { ...control, diagnostics: null };
  return S.inserted[S.inserted.length - 1].synthesizedData as Row;
}

beforeEach(() => {
  S.arms = THREE_ARMS();
  S.control = null;
  S.models = [];
  S.inserted.length = 0;
  S.updated.length = 0;
});

describe('#10 the E-value needs a treatment effect, and none is recorded', () => {
  it('is null with the reason, not a figure derived from the control arm alone', async () => {
    await synthesize('ipw');
    const d = await svc.validateControl(9, 7);
    expect(d.eValue, "an E-value was derived from the synthesized control arm's own mean and SD").toBeNull();
    expect(d.eValueLowerBound, 'the "lower bound" was eValue - 0.5').toBeNull();
    expect(d.notAssessed.eValue).toMatch(/treatment-effect estimate/);
    expect(S.updated[0].sensitivityResults).toMatchObject({ eValue: null, eValueLowerBound: null });
  });

  it('the package says the E-value was not assessed rather than interpreting a number', async () => {
    await synthesize('naive_pooling');
    const pkg = await svc.generateRegulatoryPackage(9, 7);
    expect(pkg.diagnosticsSummary.eValue).toBeNull();
    expect(pkg.diagnosticsSummary.eValueInterpretation).toMatch(/^Not assessed: No treatment-effect estimate/);
  });
});

describe('#11 balance is against the treatment arm, which the service is never given', () => {
  it('does not present one half of the historical arms as the treatment arm', async () => {
    S.arms = [arm(1, 100, -3, 10, { age: 50 }), arm(2, 100, -3, 10, { age: 54 }), arm(3, 100, -3, 10, { age: 60 }), arm(4, 100, -3, 10, { age: 64 })];
    await synthesize('naive_pooling');
    const d = await svc.validateControl(9, 7);
    expect(d.covariateBalance, 'arms 1-2 were labelled "treatment" and arms 3-4 "control"').toBeNull();
    expect(d.notAssessed.covariateBalance).toMatch(/treatment arm/);
    const pkg = await svc.generateRegulatoryPackage(9, 7);
    expect(JSON.stringify(pkg)).not.toMatch(/treatmentMean|controlMean/);
    expect(pkg.diagnosticsSummary.covariateBalance).toBeNull();
  });
});

describe('#12 nothing assessed is reported as not assessed', () => {
  it('reports no overlap without a propensity model, and no verdict', async () => {
    await synthesize('ipw');
    const d = await svc.validateControl(9, 7);
    expect(d.overlapAssessment, 'a sample-size ratio was reported as propensity overlap: 0% trimmed, range 0-1').toBeNull();
    expect(d.notAssessed.overlapAssessment).toMatch(/No propensity model has been fitted/);
    expect(d.overallQuality, 'the verdict was "good" with no covariate compared').toBe('not_assessed');
  });

  it('does not read "overlapping" off arms that report no n', async () => {
    S.arms = [arm(1, null, -3, 10), arm(2, null, -2.5, 10)];
    await synthesize('naive_pooling');
    const d = await svc.validateControl(9, 7);
    expect(d.overlapAssessment, 'Math.min() of no sizes is Infinity, and Infinity > 0.2 read as overlapping').toBeNull();
  });

  it('reports a recorded propensity model as recorded, with null for what it does not record', async () => {
    S.models = [{ id: 5, syntheticControlId: 9, balanceMetrics: {}, trimmingBounds: {}, organizationId: 7 }];
    await synthesize('propensity_score');
    const d = await svc.validateControl(9, 7);
    expect(d.overlapAssessment, 'unrecorded metrics read 0% trimmed, range 0-1, the arms\' total n').toEqual({
      trimmedPercent: null, effectiveSampleSize: null, minPropensity: null, maxPropensity: null, overlapping: null,
    });
    expect(d.notAssessed.overlapAssessment).toMatch(/records no trimmed percentage/);

    S.models = [{ id: 5, syntheticControlId: 9, balanceMetrics: { trimmedPercent: 4, effectiveSampleSize: 410 }, trimmingBounds: { lower: 0.05, upper: 0.93 }, organizationId: 7 }];
    const recorded = await svc.validateControl(9, 7);
    expect(recorded.overlapAssessment).toEqual({
      trimmedPercent: 4, effectiveSampleSize: 410, minPropensity: 0.05, maxPropensity: 0.93, overlapping: true,
    });
    expect(recorded.notAssessed.overlapAssessment).toBeUndefined();
  });

  it('the package affirms no balance and states what was not assessed', async () => {
    await synthesize('ipw');
    const pkg = await svc.generateRegulatoryPackage(9, 7);
    expect(pkg.diagnosticsSummary.allCovariatesBalanced, '[].every() affirmed every covariate balanced with none compared').toBeNull();
    expect(pkg.diagnosticsSummary.maxStandardizedDifference).toBeNull();
    expect(pkg.diagnosticsSummary.overallQuality).toBe('not_assessed');
    expect(pkg.executiveSummary).not.toMatch(/Diagnostics indicate (good|moderate|poor)/);
    expect(pkg.executiveSummary).toMatch(/Diagnostics were not assessed/);
    expect(pkg.limitationsDisclosure.join(' ')).toMatch(/comparability of this external control with the target population has not been assessed/);
  });

  it('recomputes diagnostics rather than reusing ones persisted by the earlier code', async () => {
    await synthesize('ipw');
    S.control!.diagnostics = {
      covariateBalance: [], eValue: 29342.66, eValueLowerBound: 29342.16, overallQuality: 'good',
      overlapAssessment: { trimmedPercent: 0, effectiveSampleSize: 600, minPropensity: 0, maxPropensity: 1, overlapping: true },
    };
    const pkg = await svc.generateRegulatoryPackage(9, 7);
    expect(pkg.diagnosticsSummary.eValue, 'a persisted E-value from the earlier code reached the package').toBeNull();
    expect(pkg.diagnosticsSummary.overallQuality).toBe('not_assessed');
  });
});

describe('#13 each method is described and labelled as what it computes', () => {
  const NOT_FITTED = { propensityModelFitted: false };

  it('describes ipw as the inverse-variance pooling it is', () => {
    const text = describeSynthesisMethod('ipw', NOT_FITTED);
    expect(text, 'the methods statement said probability weighting adjusted for observed differences').not.toMatch(/Inverse probability weighting was applied/);
    expect(text).toMatch(/NO probability weights were estimated/);
    expect(text).toMatch(/inverse-variance \(fixed-effect\) pooling/);
  });

  it('describes the data as the arm-level summaries the service holds', () => {
    expect(describeSynthesisMethod('naive_pooling', NOT_FITTED), 'naive pooling claimed "individual patient-level" statistics').not.toMatch(/patient-level summary/);
    expect(describeSynthesisMethod('naive_pooling', NOT_FITTED)).toMatch(/^Arm-level summary statistics/);
    expect(describeSynthesisMethod('propensity_score', NOT_FITTED), 'covariate means were said to serve a balance assessment no one makes').not.toMatch(/for balance assessment/);
  });

  it('describes bayesian_borrowing as the random-effects pooling it is', () => {
    const text = describeSynthesisMethod('bayesian_borrowing', NOT_FITTED);
    expect(text, 'the methods statement claimed borrowing set by commensurability with the current trial').not.toMatch(/framework was employed/);
    expect(text).toMatch(/NO prior or posterior/);
    expect(text).toMatch(/random-effects pooling/);
  });

  it('ipw labels its Kish figure as effective arms, reports a standard error, and uses no covariate', async () => {
    const data = await synthesize('ipw', ['age', 'sex']);
    expect(data.effectiveN, 'the Kish effective number of ARMS was reported as effectiveN').toBeUndefined();
    expect(data.effectiveArms).toBe(Math.round((36 / 14) * 100) / 100);
    expect(data.covariatesUsed, 'requested covariates were echoed as used').toEqual([]);
    expect(data.note).toMatch(/age, sex.*were not used/);
    expect(data.pooledSd, 'pooledSd was √(spread of arm means + 1/Σw), the SD of no outcome').toBeUndefined();
    expect(data.pooledSe).toBeCloseTo(Math.sqrt(1 / 6), 10);
    expect(data.pooledMean).toBeCloseTo(IV_MEAN, 10);
  });

  it('ipw leaves out an arm with no mean instead of pooling it as mean 0', async () => {
    S.arms = [...THREE_ARMS(), arm(4, 400, null, 10)];
    const data = await synthesize('ipw');
    expect(data.pooledMean, 'arm 4 (n=400, no mean) was pooled as mean 0 with weight 4').toBeCloseTo(IV_MEAN, 10);
    expect(data.totalSourceN).toBe(600);
  });

  it('bayesian_borrowing gives each arm its own random-effects weight', async () => {
    const data = await synthesize('bayesian_borrowing');
    expect(data.pooledMean, "the in-place sort gave the 100-patient arm the 300-patient arm's weight").toBeCloseTo(IV_MEAN, 10);
    const weights = (data.armContributions as Row[]).map(c => [c.id, c.weight]);
    expect(weights).toEqual([[1, 1 / 6], [2, 2 / 6], [3, 3 / 6]].map(([id, w]) => [id, expect.closeTo(w, 10)]));
    expect(data.effectiveN, 'totalN x an ad hoc index was reported as an effective sample size').toBeUndefined();
    expect(data.borrowingWeight, 'no borrowing against a current trial is computed').toBeUndefined();
    expect(data.pooledSd).toBeUndefined();
  });

  it('bayesian_borrowing estimates tau-squared by DerSimonian-Laird, about the inverse-variance mean', async () => {
    S.arms = [arm(1, 100, 0, 10), arm(2, 100, 2, 5), arm(3, 100, 5, 20)];
    const w = [100 / 100, 100 / 25, 100 / 400];
    const y = [0, 2, 5];
    const sw = w.reduce((s, v) => s + v, 0);
    const yIv = w.reduce((s, v, i) => s + v * y[i], 0) / sw;
    const q = w.reduce((s, v, i) => s + v * (y[i] - yIv) ** 2, 0);
    const tau2 = Math.max(0, (q - 2) / (sw - w.reduce((s, v) => s + v * v, 0) / sw));
    const data = await synthesize('bayesian_borrowing');
    expect(data.tau2, 'Q was taken about the n-weighted mean, which is not DerSimonian-Laird when SDs differ').toBeCloseTo(tau2, 10);
    expect(data.heterogeneityQ).toBeCloseTo(q, 10);
  });

  it('bayesian_borrowing reports no tau-squared from a single arm', async () => {
    S.arms = [arm(1, 100, -3, 10)];
    const data = await synthesize('bayesian_borrowing');
    expect(data.tau2, 'one arm reported between-study heterogeneity 0').toBeNull();
    expect(data.note).toMatch(/single arm/);
    expect(data.pooledMean).toBe(-3);
  });

  it('the executive summary counts patients, not an effective sample size of arms', async () => {
    await synthesize('ipw');
    const pkg = await svc.generateRegulatoryPackage(9, 7);
    expect(pkg.executiveSummary, '"an effective sample size of 3 patients" was the effective number of arms').not.toMatch(/effective sample size of 3 patients/);
    expect(pkg.executiveSummary).toMatch(/report 600 patients in total; no effective sample size was computed/);
  });
});

describe('#26 the service does not simulate patients or invent covariate values', () => {
  it('has no method that builds pseudo-patients from arm summaries', () => {
    expect(
      Reflect.has(ExternalControlArmService.prototype, 'fitPropensityModel'),
      'fitPropensityModel built pseudo-patients from arm means plus RNG jitter and labelled half the arms "treatment"',
    ).toBe(false);
  });

  it('propensity_score does not count a covariate an arm does not report as 0', async () => {
    S.arms = [arm(1, 100, -3, 10, { age: 60, ecog: 1 }), arm(2, 200, -2.5, 10, { age: 70 })];
    const data = await synthesize('propensity_score', ['age', 'ecog', 'bmi']);
    expect(data.covariateMeans, 'arm 2 reports no ecog and counted as ecog 0; no arm reports bmi').toEqual({ age: 65, ecog: 1, bmi: null });
    expect(data.covariateNotReportedBy).toEqual({ ecog: [2], bmi: [1, 2] });
    expect(data.covariatesUsed).toEqual([]);
  });

  it('propensity_score points at no fitter the service does not have', async () => {
    for (const covariates of [undefined, ['age']]) {
      const data = await synthesize('propensity_score', covariates);
      expect(JSON.stringify(data)).not.toMatch(/fitPropensityModel/);
      expect(data.note).toMatch(/No propensity model is fitted by this service/);
    }
  });
});
