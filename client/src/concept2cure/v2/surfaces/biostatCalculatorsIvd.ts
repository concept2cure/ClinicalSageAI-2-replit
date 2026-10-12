/**
 * The CLSI analytical and clinical-performance calculators.
 *
 * Their own module since 2026-10-12, when the registry crossed its 500-line
 * budget: eleven entries is a third of the catalog, and they are the only ones
 * on a second router. The shared contract (`Calculator`, the field kinds, the
 * endpoint helpers) lives in `biostatCalculatorContract.ts`, so this module
 * and `biostatCalculators.ts` can both use it without an import cycle.
 *
 * The engines behind these eleven were mounted at
 * /api/diagnostics-performance, Zod-validated, role-gated and reference-tested
 * against the CLSI methods (EP05 one-way ANOVA, EP17 LoB/LoD with the EP17-A2
 * bias correction, EP06 linearity by polynomial fit, EP09 with Bland-Altman
 * limits, EP07, EP25, EP28 type-7 percentiles, and DeLong for the AUC
 * interval) — and reached by no client code and no AnA tool. For an IVD
 * sponsor this IS the analytical performance section of a 510(k) or a PMA: the
 * bench data the submission is mostly made of.
 *
 * That router answers `{result}` where /api/biostat answers `{success, data}`,
 * which is why every entry here declares `resultKey`. Reading the wrong key
 * renders a refusal where a result was returned, and
 * server/routes/__tests__/biostat-calculator-contract.test.ts pins it.
 */
import { IVD_CALCULATOR_BASE as IVD_BASE, type Calculator } from './biostatCalculatorContract';

export const IVD_CALCULATORS: Calculator[] = [
  {
    id: 'clsi-imprecision',
    title: 'Imprecision (CLSI EP05)',
    subtitle: 'Repeatability, between-run and within-laboratory SD and CV',
    path: '/analytical/imprecision',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'One-way ANOVA over a balanced run design: each line is one run, and every run must hold the same number of replicates. Returns the grand mean, repeatability (within-run) SD, between-run SD and within-laboratory SD, each with its CV. A negative between-run variance estimate — which ANOVA can produce when the true between-run component is near zero — is clamped to zero and reported as such rather than returned as a negative SD.',
    fields: [
      { key: 'runs', label: 'Runs (one line per run)', kind: 'rows', placeholder: '10.2 10.4 10.1 10.3\n10.5 10.3 10.6 10.4\n10.1 10.2 10.0 10.3', hint: 'Replicate measurements, whitespace- or comma-separated. At least 2 runs, and every run the same length (EP05 assumes a balanced design).' },
    ],
  },
  {
    id: 'clsi-detection-capability',
    title: 'Detection capability — LoB, LoD (CLSI EP17)',
    subtitle: 'Limit of blank and limit of detection from blank and low-level replicates',
    path: '/analytical/detection-capability',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'LoB is the blank mean plus c_p·SD(blank); LoD is LoB plus c_beta·SD of the pooled low-level samples, with the EP17-A2 bias-correction factor K applied when supplied. Alpha is the false-positive rate at the blank and beta the false-negative rate at the low level; the defaults are the EP17 conventions. The low-level samples are given one per line because the pooled SD is computed across samples, not across all replicates as one group.',
    fields: [
      { key: 'blankReplicates', label: 'Blank replicates', kind: 'numlist', placeholder: '0.01, 0.02, 0.00, 0.03, 0.01', hint: 'At least 2 measurements of the blank.' },
      { key: 'lowSamples', label: 'Low-level samples (one line per sample)', kind: 'rows', placeholder: '0.21 0.19 0.22 0.20\n0.18 0.20 0.17 0.19', hint: 'At least 2 replicates per sample; the SD is pooled across samples.' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.05', hint: 'False-positive rate at the blank. EP17 default 0.05.' },
      { key: 'beta', label: 'Beta', kind: 'number', optional: true, placeholder: '0.05', hint: 'False-negative rate at the low level. EP17 default 0.05.' },
      { key: 'biasCorrectionK', label: 'Bias-correction K', kind: 'number', optional: true, placeholder: '1.0', hint: 'EP17-A2 correction for the SD estimate. Omitted means no correction.' },
    ],
    parseRows: { lowSamples: (rows) => rows },
  },
  {
    id: 'clsi-linearity',
    title: 'Linearity (CLSI EP06)',
    subtitle: 'Deviation from linearity across concentration levels',
    path: '/analytical/linearity',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Fits first-, second- and third-order polynomials across the levels and reports the deviation from linearity as the difference between the best-fitting nonlinear fit and the straight line, so curvature is quantified rather than judged by eye. At least three levels are required. The first number on each line is the assigned concentration; the rest are that level’s measurements.',
    fields: [
      { key: 'levels', label: 'Levels (concentration, then measurements)', kind: 'rows', placeholder: '1.0 1.02 0.98 1.01\n2.0 2.05 1.97 2.02\n4.0 4.10 3.95 4.05\n8.0 7.90 8.05 7.98', hint: 'One line per level, at least 3 levels. First number is the concentration.' },
    ],
    parseRows: {
      levels: (rows) => rows.map(([concentration, ...measurements]) => ({ concentration, measurements })),
    },
  },
  {
    id: 'clsi-method-comparison',
    title: 'Method comparison (CLSI EP09)',
    subtitle: 'Slope, intercept, bias and Bland–Altman limits against a comparator',
    path: '/analytical/method-comparison',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Paired measurements of one set of samples by the candidate method and the comparator. Returns the regression slope and intercept, the mean bias with its Bland–Altman limits of agreement (mean bias ± 1.96·SD of the differences), and — when a decision level is given — the systematic bias at that level, which is the figure a submission is judged on rather than the average bias across the range.',
    fields: [
      { key: 'reference', label: 'Comparator values', kind: 'numlist', placeholder: '1.0, 2.1, 3.9, 8.2, 15.4', hint: 'Must be the same length as the candidate values, in the same sample order.' },
      { key: 'test', label: 'Candidate values', kind: 'numlist', placeholder: '1.1, 2.0, 4.1, 8.0, 15.9' },
      { key: 'decisionLevel', label: 'Medical decision level', kind: 'number', optional: true, placeholder: '5.0', hint: 'The concentration the clinical decision turns on. Omitted means no decision-level bias is reported — it is not assumed.' },
    ],
  },
  {
    id: 'clsi-interference',
    title: 'Interference (CLSI EP07)',
    subtitle: 'Percent bias from an interferent against an allowable limit',
    path: '/analytical/interference',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Paired baseline and spiked measurements of the same samples. Returns the percent bias the interferent causes and, against the allowable limit, whether it counts as interference. The limit is the sponsor’s claim, so it is an input: with none supplied the bias is reported and no verdict is reached, because “interference” is a claim about an allowance nobody has stated yet.',
    fields: [
      { key: 'baseline', label: 'Baseline values', kind: 'numlist', placeholder: '10.0, 10.2, 9.9, 10.1' },
      { key: 'withInterferent', label: 'With interferent', kind: 'numlist', placeholder: '10.8, 11.0, 10.6, 10.9', hint: 'Same samples, same order, with the interferent present.' },
      { key: 'allowableBiasPct', label: 'Allowable bias (%)', kind: 'number', optional: true, placeholder: '10', hint: 'The sponsor’s claim. Omitted means the bias is reported without a pass/fail verdict.' },
    ],
  },
  {
    id: 'clsi-reference-interval',
    title: 'Reference interval (CLSI EP28)',
    subtitle: 'Non-parametric reference limits with their confidence intervals',
    path: '/analytical/reference-interval',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Type-7 percentile limits over the reference population, with a confidence interval on each limit. The default 2.5th and 97.5th percentiles are the EP28 central 95% interval; other quantiles can be requested. At least 3 values are required to compute anything, though EP28 asks for 120 for a non-parametric interval — the result says how many were used so a reader can judge it against that.',
    fields: [
      { key: 'values', label: 'Reference population values', kind: 'numlist', placeholder: '3.1, 3.4, 3.8, 4.0, 4.2, 4.5, 4.9, 5.2, 5.6, 6.0', hint: 'At least 3. EP28 asks for 120 for a non-parametric interval.' },
      { key: 'lowerQuantile', label: 'Lower quantile', kind: 'number', optional: true, placeholder: '0.025', hint: 'Strictly between 0 and 1. Default 0.025.' },
      { key: 'upperQuantile', label: 'Upper quantile', kind: 'number', optional: true, placeholder: '0.975', hint: 'Strictly between 0 and 1. Default 0.975.' },
    ],
  },
  {
    id: 'clsi-stability',
    title: 'Stability / shelf life (CLSI EP25)',
    subtitle: 'When the regression bound crosses the specification limit',
    path: '/analytical/stability',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Regresses the measurand on time and reports the shelf life as the time at which the one-sided confidence bound — not the fitted line — reaches the specification limit, which is the criterion a reviewer applies. The direction says whether the limit is approached from above or below. At least 3 time points are required.',
    fields: [
      { key: 'points', label: 'Time points (time, value)', kind: 'rows', placeholder: '0 100.2\n3 99.1\n6 98.4\n9 97.2\n12 96.5', hint: 'One line per point: the time, then the measured value. At least 3 points.' },
      { key: 'specLimit', label: 'Specification limit', kind: 'number', placeholder: '95', hint: 'The value the product must stay on the right side of.' },
      { key: 'direction', label: 'Limit is a', kind: 'select', options: [{ value: 'lower', label: 'Lower limit (value must stay above)' }, { value: 'upper', label: 'Upper limit (value must stay below)' }] },
      { key: 'confidence', label: 'Confidence', kind: 'number', optional: true, placeholder: '0.95', hint: 'One-sided bound confidence, strictly between 0 and 1. Default 0.95.' },
    ],
    parseRows: {
      points: (rows) => rows.map(([time, value]) => ({ time, value })),
    },
  },
  {
    id: 'clsi-qualitative-dose-response',
    title: 'Qualitative dose response (C50 / C95)',
    subtitle: 'The concentration at which a qualitative assay turns positive',
    path: '/analytical/qualitative-dose-response',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Fits the proportion positive against concentration and reports the concentration at which the assay is positive 50% and 95% of the time — the C50 and the C95, which is the limit of detection claim for a qualitative assay. Each line is one concentration level: the concentration, the number tested, and the number positive.',
    fields: [
      { key: 'levels', label: 'Levels (concentration, n tested, n positive)', kind: 'rows', placeholder: '0.1 20 1\n0.2 20 6\n0.4 20 14\n0.8 20 19\n1.6 20 20', hint: 'One line per level, at least 2 levels. Positives cannot exceed n.' },
    ],
    parseRows: {
      levels: (rows) => rows.map(([concentration, n, positives]) => ({ concentration, n, positives })),
    },
  },
  {
    id: 'ivd-clinical-accuracy',
    title: 'Clinical accuracy (2×2)',
    subtitle: 'Sensitivity, specificity, PPV and NPV with confidence intervals',
    path: '/clinical/accuracy',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'The 2×2 table against the reference standard. Returns sensitivity and specificity with their exact confidence intervals, and — when a prevalence is supplied — the predictive values at THAT prevalence rather than at the study’s own, which is the distinction a reviewer looks for: PPV computed from a case-enriched study overstates what a clinician will see.',
    fields: [
      { key: 'tp', label: 'True positives', kind: 'int', placeholder: '90' },
      { key: 'fp', label: 'False positives', kind: 'int', placeholder: '8' },
      { key: 'fn', label: 'False negatives', kind: 'int', placeholder: '10' },
      { key: 'tn', label: 'True negatives', kind: 'int', placeholder: '92' },
      { key: 'prevalence', label: 'Intended-use prevalence', kind: 'number', optional: true, placeholder: '0.05', hint: 'Between 0 and 1. Omitted means the predictive values come from the study’s own prevalence — state which you mean.' },
      { key: 'conf', label: 'Confidence', kind: 'number', optional: true, placeholder: '0.95', hint: 'Default 0.95.' },
    ],
  },
  {
    id: 'ivd-roc',
    title: 'ROC / AUC with a confidence interval',
    subtitle: 'The empirical AUC and its DeLong interval from scored observations',
    path: '/clinical/roc',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'The empirical ROC over scored observations, with the AUC and its DeLong confidence interval — the interval a submission is expected to carry, and the one a sample-size calculation is checked against. Each line is one observation: the score, then 1 if the reference standard calls it positive and 0 if negative.',
    fields: [
      { key: 'observations', label: 'Observations (score, 1 = positive)', kind: 'rows', placeholder: '0.92 1\n0.81 1\n0.76 0\n0.65 1\n0.44 0\n0.21 0', hint: 'One line per observation, at least 2. The second number must be 1 or 0.' },
    ],
    parseRows: {
      observations: (rows) => rows.map(([score, positive]) => ({ score, positive: positive === 1 })),
    },
  },
  {
    id: 'ivd-weighted-kappa',
    title: 'Weighted kappa',
    subtitle: 'Agreement between two ordinal raters or methods',
    path: '/clinical/weighted-kappa',
    base: IVD_BASE,
    resultKey: 'result',
    about:
      'Weighted kappa over the full agreement matrix, which is the right measure for an ordinal rating because it credits a near-miss differently from a far one. Quadratic weights penalise distant disagreements more steeply than linear; quadratic is the usual choice and the default. Each line is one row of the matrix.',
    fields: [
      { key: 'matrix', label: 'Agreement matrix (one line per row)', kind: 'rows', placeholder: '20 5 1\n4 25 6\n1 3 18', hint: 'Square, at least 2×2. Rows are rater A’s categories, columns rater B’s, in the same order.' },
      { key: 'weights', label: 'Weights', kind: 'select', optional: true, options: [{ value: 'quadratic', label: 'Quadratic (default)' }, { value: 'linear', label: 'Linear' }] },
    ],
    parseRows: { matrix: (rows) => rows },
  },
];
