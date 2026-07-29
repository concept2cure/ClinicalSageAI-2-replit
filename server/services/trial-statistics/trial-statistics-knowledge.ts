/**
 * Clinical Trial Statistics & Estimands — deterministic knowledge engine.
 *
 * Pure, closed-form, reproducible TypeScript. NO LLM, NO network, NO database,
 * NO imports from other services. Every recommendation, threshold and citation
 * is hard-coded from primary regulatory and statistical sources:
 *
 *   - ICH E9 (1998)        — Statistical Principles for Clinical Trials.
 *   - ICH E9(R1) (2019)    — Addendum on Estimands and Sensitivity Analysis.
 *   - ICH E10 (2000)       — Choice of Control Group and Related Issues.
 *   - ICH E17 (2017)       — General Principles for Multi-Regional Clinical Trials.
 *   - FDA Adaptive Designs for Clinical Trials of Drugs and Biologics (2019).
 *   - FDA Multiple Endpoints in Clinical Trials (2022).
 *   - FDA Non-Inferiority Clinical Trials to Establish Effectiveness (2016).
 *
 * Six exported functions, each a deterministic pure function:
 *   defineEstimand                    — assemble an ICH E9(R1) estimand (5 attributes).
 *   assessIntercurrentEventStrategy   — recommend ICH E9(R1) strategy per ICE.
 *   planMultiplicityControl           — FWER control strategy across a testing structure.
 *   designAdaptiveDesign              — adaptive design selection + type-I-error control.
 *   selectMissingDataStrategy         — primary estimator + sensitivity analyses.
 *   estimateSampleSize                — closed-form n for continuous/binary/TTE endpoints.
 *
 * Determinism contract: identical input always yields identical output. No
 * Date.now(), no Math.random(), no I/O. Numeric routines are closed-form
 * (normal-approximation sample sizing; inverse-CDF by rational approximation).
 *
 * @module server/services/trial-statistics/trial-statistics-knowledge
 */

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 0 — Shared numeric primitives (deterministic, closed-form)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Standard-normal quantile (inverse CDF, probit) via the Acklam rational
 * approximation. Deterministic; |abs error| < 1.15e-9 over (0,1). This avoids
 * any dependency and is reproducible bit-for-bit for a given input.
 */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Coefficients in rational approximations (Acklam, 2003).
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return x;
}

/** Standard-normal CDF via erf, used for power back-calculation. Deterministic. */
function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 erf approximation.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  const cdf = 0.5 * (1 + (x >= 0 ? y : -y));
  return cdf;
}

/** Round to a fixed number of decimals; deterministic banker-free rounding. */
function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/** Round a per-arm sample size up to an integer (always conservative). */
function ceilN(value: number): number {
  return Math.ceil(value - 1e-9);
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Estimand framework (ICH E9(R1))
// ═════════════════════════════════════════════════════════════════════════════

/** The five ICH E9(R1) strategies for handling intercurrent events. */
export type IntercurrentEventStrategy =
  | 'treatment-policy'
  | 'hypothetical'
  | 'composite'
  | 'while-on-treatment'
  | 'principal-stratum';

/** Population-level summary measures recognised in ICH E9(R1) §A.3.5. */
export type PopulationSummary =
  | 'difference-in-means'
  | 'ratio-of-means'
  | 'risk-difference'
  | 'risk-ratio'
  | 'odds-ratio'
  | 'hazard-ratio'
  | 'difference-in-proportion-responders'
  | 'win-ratio'
  | 'restricted-mean-survival-time-difference';

/** Categories of intercurrent event recognised in ICH E9(R1) §A.3.3. */
export type IntercurrentEventType =
  | 'treatment-discontinuation'
  | 'treatment-discontinuation-lack-of-efficacy'
  | 'treatment-discontinuation-adverse-event'
  | 'rescue-medication'
  | 'death'
  | 'treatment-switching'
  | 'dose-modification'
  | 'noncompliance'
  | 'terminal-event-non-death';

/** A single intercurrent event with the strategy chosen to address it. */
export interface IntercurrentEventHandling {
  event: IntercurrentEventType;
  strategy: IntercurrentEventStrategy;
  rationale?: string;
}

export interface DefineEstimandParams {
  /** Treatment condition(s) of interest, including dose/schedule/comparator. */
  treatment: string;
  /** Comparator / control arm (e.g. "placebo", "active control 10 mg QD"). */
  comparator?: string;
  /** Target population (the clinical question's denominator). */
  population: string;
  /** Endpoint / variable measured on each subject. */
  endpoint: string;
  /** When the endpoint is assessed (e.g. "Week 24", "time to first event"). */
  endpointTimepoint?: string;
  /** Intercurrent events and the strategy chosen for each. */
  intercurrentEvents: IntercurrentEventHandling[];
  /** Population-level summary measure. */
  populationSummary: PopulationSummary;
  /** Trial objective tier: 'primary' | 'key-secondary' | 'secondary'. */
  objectiveTier?: 'primary' | 'key-secondary' | 'secondary';
  /** Whether the trial objective is superiority, NI, or equivalence. */
  comparisonType?: 'superiority' | 'non-inferiority' | 'equivalence';
}

export interface EstimandAlignmentCheck {
  attribute: string;
  status: 'ok' | 'warning' | 'gap';
  message: string;
  citation: string;
}

export interface DefinedEstimand {
  /** One-sentence structured description per ICH E9(R1) Figure 1. */
  description: string;
  attributes: {
    treatment: string;
    comparator: string | null;
    population: string;
    endpoint: string;
    endpointTimepoint: string | null;
    intercurrentEventHandling: IntercurrentEventHandling[];
    populationSummary: PopulationSummary;
  };
  alignmentChecks: EstimandAlignmentCheck[];
  /** Sensitivity-analysis pointers tied to the chosen ICE strategies. */
  sensitivityConsiderations: string[];
  citations: string[];
}

interface StrategyMeta {
  strategy: IntercurrentEventStrategy;
  label: string;
  /** Plain-language description of the population-level effect targeted. */
  meaning: string;
  /** When this strategy is typically appropriate. */
  appropriateWhen: string;
  /** Known estimation / interpretation cautions. */
  cautions: string;
  /** Typical estimator family. */
  typicalEstimator: string;
  citation: string;
}

const STRATEGY_META: StrategyMeta[] = [
  {
    strategy: 'treatment-policy',
    label: 'Treatment-policy strategy',
    meaning:
      'The value of the variable is used regardless of whether the intercurrent ' +
      'event occurs; the occurrence of the ICE is considered irrelevant. Targets ' +
      'the effect of the treatment regimen as actually taken ("intention-to-treat" ' +
      'in spirit for that ICE).',
    appropriateWhen:
      'The clinical question concerns the effect of being assigned to and starting ' +
      'a treatment policy, irrespective of adherence, rescue, or switching. Common ' +
      'for symptomatic chronic conditions and pragmatic effectiveness questions.',
    cautions:
      'Requires that the variable remains measurable and meaningful after the ICE. ' +
      'NOT applicable to death (no post-death value exists) and generally not to ' +
      'situations where the endpoint cannot be observed after the ICE.',
    typicalEstimator:
      'Analysis of all observed data including post-ICE values (e.g. MMRM or ANCOVA ' +
      'on full observation period; the missing-data problem reduces to genuinely ' +
      'unobserved values only).',
    citation: 'ICH E9(R1) §A.3.4(1)',
  },
  {
    strategy: 'hypothetical',
    label: 'Hypothetical strategy',
    meaning:
      'A scenario is envisaged in which the intercurrent event would not occur; ' +
      'the variable value that would have been obtained under that hypothetical ' +
      'condition is targeted.',
    appropriateWhen:
      'The question is about the effect "if patients had not taken rescue medication" ' +
      'or "if they had stayed on randomized treatment". Common when rescue confounds ' +
      'the efficacy signal and the regulatory question is mechanistic efficacy.',
    cautions:
      'The hypothetical condition must be precisely specified (e.g. "no rescue used"). ' +
      'Estimation typically relies on untestable modelling assumptions (e.g. MAR after ' +
      'setting post-ICE data to missing). Requires explicit sensitivity analysis.',
    typicalEstimator:
      'Set post-ICE observations to missing and estimate under MAR (MMRM / multiple ' +
      'imputation), or use a model that targets the hypothetical mean directly.',
    citation: 'ICH E9(R1) §A.3.4(2)',
  },
  {
    strategy: 'composite',
    label: 'Composite (variable) strategy',
    meaning:
      'The intercurrent event is incorporated into the variable definition itself, ' +
      'i.e. the ICE is taken to be a component of the (often unfavourable) outcome.',
    appropriateWhen:
      'The occurrence of the ICE is itself clinically meaningful and undesirable ' +
      '(e.g. treatment discontinuation for lack of efficacy, or use of rescue, counts ' +
      'as non-response). Common for responder definitions and ordinal composites.',
    cautions:
      'Choice of how the ICE maps onto the variable (non-responder, worst category) ' +
      'must be pre-specified and clinically justified. Can dilute or inflate effects ' +
      'depending on how the ICE is scored.',
    typicalEstimator:
      'Binary/ordinal analysis on the composite variable (e.g. logistic regression on ' +
      'responder yes/no with ICE = non-responder).',
    citation: 'ICH E9(R1) §A.3.4(3)',
  },
  {
    strategy: 'while-on-treatment',
    label: 'While-on-treatment strategy',
    meaning:
      'Response is summarised only up to the time of the intercurrent event; values ' +
      'after the ICE are not relevant to the clinical question.',
    appropriateWhen:
      'The question concerns the effect of treatment while it is actually being taken ' +
      '(e.g. symptom control measured repeatedly; effect before discontinuation). Common ' +
      'in palliative settings and for safety/symptom endpoints.',
    cautions:
      'Differential exposure time across arms can bias the comparison; the summary must ' +
      'be defined to be comparable across arms (e.g. a rate per unit exposure). Care is ' +
      'needed when the ICE is informative.',
    typicalEstimator:
      'Analysis of the on-treatment period (e.g. rate models, time-to-first-event up to ' +
      'discontinuation, or last on-treatment value).',
    citation: 'ICH E9(R1) §A.3.4(4)',
  },
  {
    strategy: 'principal-stratum',
    label: 'Principal-stratum strategy',
    meaning:
      'The target population is restricted to the principal stratum: the subset of ' +
      'patients in whom the intercurrent event would (or would not) occur regardless ' +
      'of treatment assignment.',
    appropriateWhen:
      'The question concerns the effect in the subpopulation defined by potential ICE ' +
      'behaviour (e.g. "patients who would tolerate treatment" or "patients who would ' +
      'not require rescue under either arm").',
    cautions:
      'Membership in the principal stratum is generally unobserved (a latent ' +
      'subpopulation) — estimation needs strong, untestable assumptions and is sensitive ' +
      'to them. Considered the most technically demanding strategy.',
    typicalEstimator:
      'Principal-stratification / principal-score methods, or sensitivity-bounded ' +
      'estimators; results framed for the latent stratum only.',
    citation: 'ICH E9(R1) §A.3.4(5)',
  },
];

/** Lookup a strategy's metadata; deterministic. */
function strategyMeta(s: IntercurrentEventStrategy): StrategyMeta {
  const m = STRATEGY_META.find((x: StrategyMeta): boolean => x.strategy === s);
  // Every member of the union is present in STRATEGY_META, so this is total.
  return m as StrategyMeta;
}

/**
 * Construct an ICH E9(R1) estimand from its five attributes and run alignment
 * checks. Deterministic and pure.
 *
 * Citations: ICH E9(R1) (2019) §A.3 (estimand attributes), Figure 1
 * (structured description), §A.4 (sensitivity analysis), ICH E9 (1998) §5.
 */
export function defineEstimand(params: DefineEstimandParams): DefinedEstimand {
  const comparator = params.comparator ?? null;
  const endpointTimepoint = params.endpointTimepoint ?? null;
  const tier = params.objectiveTier ?? 'primary';
  const comparison = params.comparisonType ?? 'superiority';

  // Structured one-sentence description per ICH E9(R1) Figure 1 ordering.
  const iceClause =
    params.intercurrentEvents.length === 0
      ? 'with no intercurrent events specified'
      : 'handling intercurrent events as follows: ' +
        params.intercurrentEvents
          .map(
            (h: IntercurrentEventHandling): string =>
              `${h.event} via ${strategyMeta(h.strategy).label.toLowerCase()}`,
          )
          .join('; ');

  const compClause = comparator ? ` versus ${comparator}` : '';
  const timeClause = endpointTimepoint ? ` at ${endpointTimepoint}` : '';

  const description =
    `Among ${params.population}, the ${summaryLabel(params.populationSummary)} ` +
    `of ${params.endpoint}${timeClause} for ${params.treatment}${compClause}, ` +
    `${iceClause}.`;

  const alignmentChecks: EstimandAlignmentCheck[] = [];

  // Check 1: every ICE must have a strategy.
  if (params.intercurrentEvents.length === 0) {
    alignmentChecks.push({
      attribute: 'intercurrent-events',
      status: 'warning',
      message:
        'No intercurrent events were specified. ICH E9(R1) requires the trial team to ' +
        'systematically enumerate anticipated intercurrent events (treatment ' +
        'discontinuation, rescue medication, death, switching) and choose a strategy ' +
        'for each before finalizing the estimand.',
      citation: 'ICH E9(R1) §A.3.3',
    });
  }

  // Check 2: treatment-policy or while-on-treatment vs. death is incoherent.
  for (const ice of params.intercurrentEvents) {
    if (
      ice.event === 'death' &&
      (ice.strategy === 'treatment-policy' || ice.strategy === 'while-on-treatment')
    ) {
      alignmentChecks.push({
        attribute: 'intercurrent-events',
        status: 'gap',
        message:
          `Death handled by ${strategyMeta(ice.strategy).label.toLowerCase()} is ` +
          'generally incoherent for a non-mortality endpoint: there is no post-death ' +
          'value of the variable to carry forward, and a treatment-policy summary cannot ' +
          'be computed. Consider a composite strategy (death = worst outcome) or a ' +
          'survival-based endpoint (e.g. RMST, win ratio).',
        citation: 'ICH E9(R1) §A.3.4; FDA Multiple Endpoints (2022) §V',
      });
    }
  }

  // Check 3: principal-stratum demands strong assumptions — flag it.
  if (
    params.intercurrentEvents.some(
      (h: IntercurrentEventHandling): boolean => h.strategy === 'principal-stratum',
    )
  ) {
    alignmentChecks.push({
      attribute: 'intercurrent-events',
      status: 'warning',
      message:
        'A principal-stratum strategy targets a latent subpopulation that cannot be ' +
        'directly observed. Estimation requires untestable assumptions; pre-specify the ' +
        'identification strategy and a dedicated sensitivity analysis.',
      citation: 'ICH E9(R1) §A.3.4(5), §A.4',
    });
  }

  // Check 4: summary measure coherence with endpoint type heuristics.
  const summaryGroup = summaryGroupOf(params.populationSummary);
  if (
    summaryGroup === 'survival' &&
    !params.intercurrentEvents.some(
      (h: IntercurrentEventHandling): boolean => h.event === 'death',
    )
  ) {
    alignmentChecks.push({
      attribute: 'population-summary',
      status: 'warning',
      message:
        'A survival/time-to-event summary (hazard ratio, RMST difference, win ratio) ' +
        'is specified but death is not listed as an intercurrent event. For composite ' +
        'or non-fatal time-to-event endpoints, confirm whether death is an event, a ' +
        'competing risk, or a censoring mechanism — this materially changes the estimand.',
      citation: 'ICH E9(R1) §A.3.3; FDA Multiple Endpoints (2022) §V',
    });
  }

  // Check 5: NI/equivalence estimands need treatment-policy or pre-specified
  // conservative handling (ITT can be anti-conservative in NI).
  if (
    (comparison === 'non-inferiority' || comparison === 'equivalence') &&
    params.intercurrentEvents.some(
      (h: IntercurrentEventHandling): boolean => h.strategy === 'treatment-policy',
    )
  ) {
    alignmentChecks.push({
      attribute: 'analysis-set',
      status: 'warning',
      message:
        'In non-inferiority and equivalence trials a pure treatment-policy / ITT ' +
        'handling can bias toward the null (toward concluding non-inferiority). FDA ' +
        'recommends evaluating both ITT and per-protocol analysis sets and ensuring ' +
        'consistency; pre-specify the per-protocol estimand and analysis.',
      citation: 'FDA Non-Inferiority (2016) §III.E; ICH E9 §5.2.3',
    });
  }

  if (alignmentChecks.length === 0) {
    alignmentChecks.push({
      attribute: 'overall',
      status: 'ok',
      message:
        'The five estimand attributes are internally consistent; proceed to align the ' +
        'main estimator and sensitivity analyses to this estimand.',
      citation: 'ICH E9(R1) §A.3, §A.5',
    });
  }

  // Sensitivity pointers tied to chosen strategies.
  const sensitivityConsiderations: string[] = [];
  for (const ice of params.intercurrentEvents) {
    const m = strategyMeta(ice.strategy);
    if (ice.strategy === 'hypothetical') {
      sensitivityConsiderations.push(
        `For the hypothetical handling of ${ice.event}: the primary estimator assumes ` +
          'MAR after setting post-ICE data to missing. Pre-specify a control-based / ' +
          'jump-to-reference or tipping-point sensitivity analysis to probe departures ' +
          'from MAR (ICH E9(R1) §A.4).',
      );
    } else if (ice.strategy === 'treatment-policy') {
      sensitivityConsiderations.push(
        `For the treatment-policy handling of ${ice.event}: collect data after the ICE; ` +
          'sensitivity analyses address only the genuinely unobserved values, not the ' +
          'post-ICE-but-observed values (ICH E9(R1) §A.3.4(1), §A.4).',
      );
    } else if (ice.strategy === 'principal-stratum') {
      sensitivityConsiderations.push(
        `For the principal-stratum handling of ${ice.event}: vary the latent-stratum ` +
          'identification assumptions across a plausible range and report bounds.',
      );
    } else {
      sensitivityConsiderations.push(
        `For the ${m.label.toLowerCase()} handling of ${ice.event}: ${m.cautions}`,
      );
    }
  }
  if (sensitivityConsiderations.length === 0) {
    sensitivityConsiderations.push(
      'Specify at least one sensitivity analysis targeting the same estimand under ' +
        'plausible alternative assumptions (ICH E9(R1) §A.4).',
    );
  }

  return {
    description,
    attributes: {
      treatment: params.treatment,
      comparator,
      population: params.population,
      endpoint: params.endpoint,
      endpointTimepoint,
      intercurrentEventHandling: params.intercurrentEvents,
      populationSummary: params.populationSummary,
    },
    alignmentChecks,
    sensitivityConsiderations,
    citations: [
      'ICH E9(R1) (2019) Addendum on Estimands and Sensitivity Analysis, §A.3, Figure 1',
      'ICH E9 (1998) Statistical Principles for Clinical Trials, §5',
      tier === 'primary'
        ? 'ICH E9(R1) §A.2 — the primary estimand must align with the primary trial objective'
        : 'ICH E9(R1) §A.5 — secondary estimands should be specified with the same rigor',
    ],
  };
}

function summaryLabel(s: PopulationSummary): string {
  switch (s) {
    case 'difference-in-means':
      return 'difference in mean';
    case 'ratio-of-means':
      return 'ratio of mean';
    case 'risk-difference':
      return 'risk difference in';
    case 'risk-ratio':
      return 'risk ratio for';
    case 'odds-ratio':
      return 'odds ratio for';
    case 'hazard-ratio':
      return 'hazard ratio for';
    case 'difference-in-proportion-responders':
      return 'difference in proportion of responders for';
    case 'win-ratio':
      return 'win ratio for';
    case 'restricted-mean-survival-time-difference':
      return 'difference in restricted mean survival time for';
  }
}

function summaryGroupOf(s: PopulationSummary): 'continuous' | 'binary' | 'survival' {
  switch (s) {
    case 'difference-in-means':
    case 'ratio-of-means':
      return 'continuous';
    case 'risk-difference':
    case 'risk-ratio':
    case 'odds-ratio':
    case 'difference-in-proportion-responders':
      return 'binary';
    case 'hazard-ratio':
    case 'win-ratio':
    case 'restricted-mean-survival-time-difference':
      return 'survival';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Intercurrent-event strategy recommendation
// ═════════════════════════════════════════════════════════════════════════════

export interface AssessIntercurrentEventParams {
  /** The intercurrent events to be addressed. */
  events: IntercurrentEventType[];
  /** Endpoint nature: drives which strategies are coherent. */
  endpointType: 'continuous' | 'binary' | 'time-to-event' | 'count' | 'ordinal';
  /** Whether the endpoint can still be measured after the ICE occurs. */
  measurableAfterEvent?: boolean;
  /** Therapeutic context: 'symptomatic-chronic' | 'disease-modifying' |
   *  'oncology-survival' | 'acute' | 'prevention'. */
  context?:
    | 'symptomatic-chronic'
    | 'disease-modifying'
    | 'oncology-survival'
    | 'acute'
    | 'prevention';
  /** Regulatory question framing. */
  objective?: 'effectiveness-pragmatic' | 'efficacy-mechanistic' | 'safety';
}

export interface IntercurrentEventRecommendation {
  event: IntercurrentEventType;
  recommendedStrategy: IntercurrentEventStrategy;
  alternativeStrategy: IntercurrentEventStrategy | null;
  rationale: string;
  estimatorGuidance: string;
  sensitivityGuidance: string;
  citation: string;
}

export interface AssessIntercurrentEventResult {
  recommendations: IntercurrentEventRecommendation[];
  generalNotes: string[];
  citations: string[];
}

/**
 * Recommend an ICH E9(R1) strategy for each intercurrent event given endpoint
 * nature, therapeutic context, and regulatory objective. Deterministic.
 *
 * Citations: ICH E9(R1) §A.3.4 (the five strategies), §A.4 (sensitivity),
 * FDA Multiple Endpoints (2022) §V (composite/mortality handling).
 */
export function assessIntercurrentEventStrategy(
  params: AssessIntercurrentEventParams,
): AssessIntercurrentEventResult {
  const measurable = params.measurableAfterEvent ?? true;
  const context = params.context ?? 'symptomatic-chronic';
  const objective = params.objective ?? 'effectiveness-pragmatic';

  const recommendations: IntercurrentEventRecommendation[] = params.events.map(
    (event: IntercurrentEventType): IntercurrentEventRecommendation => {
      let strategy: IntercurrentEventStrategy;
      let alt: IntercurrentEventStrategy | null;
      let rationale: string;

      switch (event) {
        case 'death': {
          if (params.endpointType === 'time-to-event' && context === 'oncology-survival') {
            strategy = 'treatment-policy';
            alt = 'composite';
            rationale =
              'For an overall-survival endpoint death is the event of interest, so a ' +
              'treatment-policy framing on time-to-death is natural. For non-mortality ' +
              'efficacy endpoints, death should instead be incorporated as the worst ' +
              'outcome (composite) or treated as a competing risk.';
          } else {
            strategy = 'composite';
            alt = 'principal-stratum';
            rationale =
              'For a non-mortality endpoint there is no post-death value to analyze; the ' +
              'coherent strategy is composite (death scored as the worst category / ' +
              'non-response) or a survival-based composite (RMST, win ratio). ' +
              'Treatment-policy and while-on-treatment are not coherent for death.';
          }
          break;
        }
        case 'rescue-medication': {
          if (objective === 'efficacy-mechanistic') {
            strategy = 'hypothetical';
            alt = 'composite';
            rationale =
              'When the question is the mechanistic efficacy of the drug itself, rescue ' +
              'medication confounds the response, so a hypothetical strategy ("had rescue ' +
              'not been taken") isolates the drug effect. A composite (rescue use = ' +
              'non-response) is the pragmatic alternative.';
          } else {
            strategy = 'treatment-policy';
            alt = 'composite';
            rationale =
              'For a pragmatic effectiveness question, rescue medication is part of the ' +
              'treatment regimen as used; treatment-policy keeps all post-rescue data. ' +
              'A composite (rescue = non-response) is appropriate when rescue use is ' +
              'itself an unfavourable outcome.';
          }
          break;
        }
        case 'treatment-discontinuation-lack-of-efficacy': {
          strategy = 'composite';
          alt = 'treatment-policy';
          rationale =
            'Discontinuation for lack of efficacy is itself an efficacy failure; scoring ' +
            'it as non-response (composite) prevents an over-optimistic estimate. ' +
            'Treatment-policy (continue collecting data) is the alternative when the ' +
            'variable remains meaningful after discontinuation.';
          break;
        }
        case 'treatment-discontinuation-adverse-event': {
          strategy = measurable ? 'treatment-policy' : 'composite';
          alt = 'hypothetical';
          rationale =
            'Discontinuation due to an adverse event reflects the real-world benefit/risk ' +
            'of the regimen; a treatment-policy strategy (continue follow-up) captures it ' +
            'if the endpoint remains measurable. If it cannot be measured afterward, a ' +
            'composite (failure) is used; a hypothetical strategy isolates efficacy under ' +
            'full adherence but needs strong assumptions.';
          break;
        }
        case 'treatment-discontinuation': {
          strategy =
            objective === 'efficacy-mechanistic' && measurable
              ? 'hypothetical'
              : 'treatment-policy';
          alt = 'composite';
          rationale =
            objective === 'efficacy-mechanistic'
              ? 'For a mechanistic efficacy question, a hypothetical strategy ("had ' +
                'treatment not been discontinued") targets the on-treatment effect; ' +
                'estimate under MAR after setting post-discontinuation data to missing.'
              : 'For an effectiveness question, treatment-policy keeps post-discontinuation ' +
                'data and reflects the regimen as taken; composite is the alternative when ' +
                'discontinuation is itself an unfavourable outcome.';
          break;
        }
        case 'treatment-switching': {
          strategy = objective === 'efficacy-mechanistic' ? 'hypothetical' : 'treatment-policy';
          alt = 'principal-stratum';
          rationale =
            'Switching to the comparator (or to active therapy from control) contaminates ' +
            'the contrast. Treatment-policy reflects real-world use; a hypothetical ' +
            'strategy ("no switching") isolates the randomized contrast but requires ' +
            'g-methods / RPSFT-type adjustment and explicit assumptions.';
          break;
        }
        case 'dose-modification': {
          strategy = 'treatment-policy';
          alt = 'while-on-treatment';
          rationale =
            'Dose modification is usually part of the intended treatment strategy; ' +
            'treatment-policy keeps all data. While-on-treatment is appropriate if the ' +
            'question is the effect during the modified-dose exposure period.';
          break;
        }
        case 'noncompliance': {
          strategy = 'treatment-policy';
          alt = 'principal-stratum';
          rationale =
            'Non-compliance is intrinsic to the ITT/treatment-policy question. A ' +
            'principal-stratum (e.g. complier-average causal effect) strategy targets the ' +
            'subpopulation of compliers but needs an instrumental-variable / monotonicity ' +
            'assumption.';
          break;
        }
        case 'terminal-event-non-death': {
          strategy = 'composite';
          alt = 'while-on-treatment';
          rationale =
            'A non-fatal terminal event (e.g. transplant, study-terminating progression) ' +
            'truncates the endpoint analogously to death; a composite or while-on-treatment ' +
            'summary up to the event keeps the comparison coherent.';
          break;
        }
        default: {
          strategy = 'treatment-policy';
          alt = 'composite';
          rationale =
            'Default to a treatment-policy framing unless the intercurrent event makes the ' +
            'variable unmeasurable or is itself an unfavourable outcome.';
        }
      }

      const meta = strategyMeta(strategy);
      return {
        event,
        recommendedStrategy: strategy,
        alternativeStrategy: alt,
        rationale,
        estimatorGuidance: meta.typicalEstimator,
        sensitivityGuidance:
          (strategy as IntercurrentEventStrategy) === 'hypothetical'
            ? 'Primary under MAR; add control-based / jump-to-reference and tipping-point ' +
              'sensitivity analyses (ICH E9(R1) §A.4).'
            : (strategy as IntercurrentEventStrategy) === 'principal-stratum'
              ? 'Vary the latent-stratum identification assumption and report bounds (§A.4).'
              : 'Confirm the estimator targets this estimand; add a sensitivity analysis ' +
                'under plausible alternative assumptions (§A.4).',
        citation: meta.citation,
      };
    },
  );

  const generalNotes: string[] = [
    'ICH E9(R1) does not mandate a single strategy: the choice flows from the clinical ' +
      'question. Document the rationale for each intercurrent event before unblinding.',
    'Mixed strategies across different intercurrent events within one estimand are ' +
      'permitted and common (e.g. treatment-policy for discontinuation, composite for ' +
      'rescue).',
    `Endpoint type (${params.endpointType}) and objective (${objective}) materially ` +
      'change the coherent strategy set; re-derive if either changes.',
  ];

  return {
    recommendations,
    generalNotes,
    citations: [
      'ICH E9(R1) (2019) §A.3.4 — the five intercurrent-event strategies',
      'ICH E9(R1) (2019) §A.4 — sensitivity analysis aligned to the estimand',
      'FDA Multiple Endpoints in Clinical Trials (2022) §V — mortality / composite handling',
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Multiplicity control (FWER)
// ═════════════════════════════════════════════════════════════════════════════

export type MultiplicityMethod =
  | 'no-adjustment-single-primary'
  | 'fixed-sequence-hierarchical'
  | 'holm'
  | 'hochberg'
  | 'bonferroni'
  | 'dunnett'
  | 'graphical-bonferroni-holm'
  | 'gatekeeping-parallel'
  | 'gatekeeping-serial'
  | 'fallback';

export type MultiplicitySource =
  | 'multiple-primary-endpoints'
  | 'co-primary-endpoints'
  | 'multiple-doses'
  | 'multiple-subgroups'
  | 'primary-plus-key-secondary'
  | 'multiple-timepoints'
  | 'interim-analyses';

export interface PlanMultiplicityParams {
  /** Sources of multiplicity present in the trial. */
  sources: MultiplicitySource[];
  /** Number of hypotheses being tested (family size). */
  numberOfHypotheses: number;
  /** Family-wise alpha to be protected (two-sided unless otherwise noted). */
  familyWiseAlpha?: number;
  /** Whether the hypotheses have a clinically motivated ordering. */
  hasNaturalOrdering?: boolean;
  /** Whether ALL endpoints must be significant to claim success (co-primary). */
  requireAllToSucceed?: boolean;
  /** Whether the comparisons share a common control (e.g. dose vs placebo). */
  sharedControl?: boolean;
  /** Whether test statistics are positively correlated / known joint dist. */
  positivelyCorrelated?: boolean;
}

export interface PlanMultiplicityResult {
  recommendedMethod: MultiplicityMethod;
  methodLabel: string;
  rationale: string;
  /** Per-hypothesis nominal alpha or alpha-allocation description. */
  alphaAllocation: string;
  /** Worked numeric thresholds where a closed form exists. */
  thresholds: { hypothesisIndex: number; nominalAlpha: number; note: string }[];
  alternativeMethods: { method: MultiplicityMethod; whenPreferred: string }[];
  fwerStatement: string;
  cautions: string[];
  citations: string[];
}

interface MethodMeta {
  method: MultiplicityMethod;
  label: string;
  controls: string;
  citation: string;
}

const METHOD_META: MethodMeta[] = [
  {
    method: 'no-adjustment-single-primary',
    label: 'No adjustment (single primary hypothesis)',
    controls: 'Trivially controls FWER at alpha when there is one primary test.',
    citation: 'FDA Multiple Endpoints (2022) §III',
  },
  {
    method: 'fixed-sequence-hierarchical',
    label: 'Fixed-sequence (hierarchical) testing',
    controls:
      'Controls FWER in the strong sense by testing in a pre-specified order at full ' +
      'alpha, stopping at the first non-significant hypothesis.',
    citation: 'FDA Multiple Endpoints (2022) §IV.A',
  },
  {
    method: 'holm',
    label: 'Holm step-down procedure',
    controls: 'Controls FWER in the strong sense without distributional assumptions.',
    citation: 'FDA Multiple Endpoints (2022) §IV.C.1; Holm (1979)',
  },
  {
    method: 'hochberg',
    label: 'Hochberg step-up procedure',
    controls:
      'Controls FWER under positive dependence (or independence); more powerful than ' +
      'Holm but assumption-dependent.',
    citation: 'FDA Multiple Endpoints (2022) §IV.C.2; Hochberg (1988)',
  },
  {
    method: 'bonferroni',
    label: 'Bonferroni correction',
    controls: 'Controls FWER in the strong sense under any dependence structure (conservative).',
    citation: 'FDA Multiple Endpoints (2022) §IV.B',
  },
  {
    method: 'dunnett',
    label: "Dunnett's many-to-one procedure",
    controls:
      'Controls FWER for multiple active arms vs a common control using the known joint ' +
      'multivariate-t distribution; more powerful than Bonferroni for shared control.',
    citation: 'FDA Multiple Endpoints (2022) §IV.D; Dunnett (1955)',
  },
  {
    method: 'graphical-bonferroni-holm',
    label: 'Graphical approach (Bretz–Maurer–Posch)',
    controls:
      'Controls FWER in the strong sense; encodes alpha-allocation and recycling between ' +
      'hypotheses as a directed graph generalizing Holm and fixed-sequence procedures.',
    citation: 'FDA Multiple Endpoints (2022) §IV.E; Bretz et al. (2009)',
  },
  {
    method: 'gatekeeping-parallel',
    label: 'Parallel gatekeeping',
    controls:
      'Controls FWER across ordered families where a later family is tested only if a ' +
      'specified subset of an earlier (gatekeeper) family is significant.',
    citation: 'FDA Multiple Endpoints (2022) §IV.F',
  },
  {
    method: 'gatekeeping-serial',
    label: 'Serial gatekeeping',
    controls:
      'Controls FWER across ordered families where ALL hypotheses in the gatekeeper ' +
      'family must be significant before the next family is tested.',
    citation: 'FDA Multiple Endpoints (2022) §IV.F',
  },
  {
    method: 'fallback',
    label: 'Fallback procedure',
    controls:
      'Controls FWER while pre-allocating some alpha to each hypothesis, allowing a later ' +
      'hypothesis to be tested even if an earlier one fails (unlike pure fixed-sequence).',
    citation: 'FDA Multiple Endpoints (2022) §IV.A; Wiens (2003)',
  },
];

function methodMeta(m: MultiplicityMethod): MethodMeta {
  const meta = METHOD_META.find((x: MethodMeta): boolean => x.method === m);
  return meta as MethodMeta;
}

/**
 * Recommend a family-wise error rate (FWER) control strategy for a given
 * testing structure and alpha. Deterministic and pure.
 *
 * Citations: FDA Multiple Endpoints in Clinical Trials (2022) §III–§IV;
 * ICH E9 (1998) §5.6.
 */
export function planMultiplicityControl(
  params: PlanMultiplicityParams,
): PlanMultiplicityResult {
  const alpha = params.familyWiseAlpha ?? 0.05;
  const k = Math.max(1, Math.floor(params.numberOfHypotheses));
  const ordered = params.hasNaturalOrdering ?? false;
  const requireAll = params.requireAllToSucceed ?? false;
  const sharedControl = params.sharedControl ?? false;
  const correlated = params.positivelyCorrelated ?? false;

  let method: MultiplicityMethod;
  let rationale: string;
  let alphaAllocation: string;
  const thresholds: { hypothesisIndex: number; nominalAlpha: number; note: string }[] = [];

  if (k === 1) {
    method = 'no-adjustment-single-primary';
    rationale =
      'Only one hypothesis is in the family, so no multiplicity adjustment is required; ' +
      'test at the full familywise alpha.';
    alphaAllocation = `Single test at alpha = ${alpha}.`;
    thresholds.push({ hypothesisIndex: 1, nominalAlpha: alpha, note: 'full alpha' });
  } else if (requireAll || params.sources.includes('co-primary-endpoints')) {
    // Co-primary: ALL must be significant. No alpha penalty (intersection-union),
    // but power cost; each tested at full alpha.
    method = 'no-adjustment-single-primary';
    rationale =
      'Co-primary endpoints require ALL hypotheses to be significant to declare success ' +
      '(intersection-union test). Because the claim is the conjunction, each endpoint is ' +
      'tested at the full alpha with NO multiplicity penalty — but overall power is the ' +
      'product-like intersection, so the sample size must be inflated to retain power.';
    alphaAllocation = `Each co-primary endpoint tested at full alpha = ${alpha} (IUT).`;
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: alpha,
        note: 'co-primary: full alpha, all must pass',
      });
    }
  } else if (
    params.sources.includes('multiple-doses') &&
    sharedControl &&
    correlated
  ) {
    method = 'dunnett';
    rationale =
      'Multiple dose arms compared to a common control with a known joint distribution: ' +
      "Dunnett's procedure uses the multivariate-t correlation among the many-to-one " +
      'contrasts and is uniformly more powerful than Bonferroni while controlling FWER.';
    alphaAllocation =
      `Critical value from the multivariate-t with ${k} contrasts at familywise ` +
      `alpha = ${alpha} (Dunnett critical constant; larger than the single-test z).`;
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: round(alpha / k, 6),
        note: 'Bonferroni lower bound; true Dunnett alpha is larger (less conservative)',
      });
    }
  } else if (ordered && params.sources.includes('primary-plus-key-secondary')) {
    method = 'fixed-sequence-hierarchical';
    rationale =
      'A clinically motivated ordering exists (primary, then key secondary endpoints). ' +
      'A fixed-sequence hierarchical test proceeds in order at full alpha and stops at the ' +
      'first non-significant hypothesis — maximal power for the leading hypotheses with ' +
      'strong FWER control and no alpha split.';
    alphaAllocation =
      `Test hypotheses in pre-specified order, each at full alpha = ${alpha}; stop at the ` +
      'first non-significant result.';
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: alpha,
        note: `tested at full alpha only if hypotheses 1..${i - 1} all significant`,
      });
    }
  } else if (ordered) {
    method = 'graphical-bonferroni-holm';
    rationale =
      'Hypotheses have a partial ordering but failure of one should not necessarily halt ' +
      'all others. A graphical (Bretz–Maurer–Posch) procedure encodes the alpha allocation ' +
      'and recycling as a directed graph, generalizing fixed-sequence, fallback and Holm ' +
      'with strong FWER control.';
    alphaAllocation =
      `Assign initial alpha weights summing to ${alpha} across the ${k} hypotheses and ` +
      'define recycling edges; rejected hypotheses pass their alpha to successors.';
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: round(alpha / k, 6),
        note: 'illustrative equal initial weight; set per the graph',
      });
    }
  } else if (correlated) {
    method = 'hochberg';
    rationale =
      'Several unordered hypotheses with positively correlated (or independent) test ' +
      'statistics: the Hochberg step-up procedure controls FWER and is more powerful than ' +
      'Holm/Bonferroni under that dependence.';
    alphaAllocation =
      `Order p-values p(1) <= ... <= p(${k}). Reject p(${k}) if <= ${round(alpha, 6)}, ` +
      `then p(k-1) if <= alpha/2, ..., p(1) if <= alpha/${k} (step-up).`;
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: round(alpha / (k - i + 1), 6),
        note: `Hochberg step-up threshold for the i-th largest p-value (i=${i})`,
      });
    }
  } else if (params.sources.includes('multiple-subgroups') && k <= 20) {
    method = 'holm';
    rationale =
      'Multiple unordered hypotheses (e.g. subgroups) with no distributional assumption ' +
      'available: the Holm step-down procedure controls FWER in the strong sense under any ' +
      'dependence and uniformly dominates Bonferroni.';
    alphaAllocation =
      `Order p-values p(1) <= ... <= p(${k}). Reject p(1) if <= alpha/${k}; then p(2) if ` +
      `<= alpha/${k - 1}; continue until the first non-rejection (step-down).`;
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: round(alpha / (k - i + 1), 6),
        note: `Holm step-down threshold for the i-th smallest p-value (i=${i})`,
      });
    }
  } else {
    method = 'holm';
    rationale =
      'Multiple unordered hypotheses with no usable joint distribution: the Holm step-down ' +
      'procedure is the assumption-free default — it controls FWER in the strong sense and ' +
      'is always at least as powerful as Bonferroni.';
    alphaAllocation =
      `Order p-values ascending; reject p(i) if p(i) <= alpha/(${k}-i+1), stopping at the ` +
      'first failure.';
    for (let i = 1; i <= k; i++) {
      thresholds.push({
        hypothesisIndex: i,
        nominalAlpha: round(alpha / (k - i + 1), 6),
        note: `Holm step-down threshold (i=${i})`,
      });
    }
  }

  const alternativeMethods: { method: MultiplicityMethod; whenPreferred: string }[] = [];
  if ((method as MultiplicityMethod) !== 'bonferroni') {
    alternativeMethods.push({
      method: 'bonferroni',
      whenPreferred:
        'When a fully assumption-free, simplest-to-explain bound is needed and the modest ' +
        'power loss is acceptable.',
    });
  }
  if (method !== 'hochberg' && !correlated) {
    alternativeMethods.push({
      method: 'hochberg',
      whenPreferred:
        'When positive dependence among test statistics can be justified — more powerful ' +
        'than Holm.',
    });
  }
  if (method !== 'graphical-bonferroni-holm') {
    alternativeMethods.push({
      method: 'graphical-bonferroni-holm',
      whenPreferred:
        'When the testing structure mixes ordering and recycling across endpoint families ' +
        '— a single graph encodes the entire strategy.',
    });
  }
  if (
    (method as MultiplicityMethod) !== 'gatekeeping-serial' &&
    params.sources.includes('primary-plus-key-secondary')
  ) {
    alternativeMethods.push({
      method: 'gatekeeping-serial',
      whenPreferred:
        'When a whole secondary family may be tested only after the entire primary family ' +
        'succeeds.',
    });
  }

  const cautions: string[] = [
    'Pre-specify the multiplicity strategy in the protocol/SAP before unblinding; ' +
      'post-hoc selection of the procedure does not control FWER (ICH E9 §5.6).',
    'Multiplicity from interim analyses is handled by an alpha-spending function, NOT by ' +
      'the endpoint-multiplicity procedure — combine the two structures explicitly.',
  ];
  if (params.sources.includes('multiple-timepoints')) {
    cautions.push(
      'Multiple timepoints inflate type I error like any other family; either pick one ' +
        'primary timepoint or fold the timepoints into the multiplicity graph.',
    );
  }
  if (requireAll || params.sources.includes('co-primary-endpoints')) {
    cautions.push(
      'Co-primary endpoints do not need an alpha penalty but DO need a power penalty: size ' +
        'the study so the JOINT power (all endpoints significant) meets the target.',
    );
  }

  const meta = methodMeta(method);
  return {
    recommendedMethod: method,
    methodLabel: meta.label,
    rationale,
    alphaAllocation,
    thresholds,
    alternativeMethods,
    fwerStatement: `Target: strong control of the family-wise error rate at alpha = ${alpha}. ${meta.controls}`,
    cautions,
    citations: [
      'FDA Multiple Endpoints in Clinical Trials (2022) §III–§IV',
      'ICH E9 (1998) §5.6 — multiplicity',
      meta.citation,
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Adaptive design selection
// ═════════════════════════════════════════════════════════════════════════════

export type AdaptationType =
  | 'group-sequential'
  | 'blinded-ssr'
  | 'unblinded-ssr'
  | 'adaptive-enrichment'
  | 'seamless-2-3'
  | 'mams'
  | 'response-adaptive-randomization'
  | 'adaptive-dose-selection'
  | 'non-adaptive-fixed';

export type AlphaSpendingFunction =
  | 'obrien-fleming'
  | 'pocock'
  | 'lan-demets-obf'
  | 'lan-demets-pocock'
  | 'gamma-family'
  | 'rho-family'
  | 'none';

export interface DesignAdaptiveParams {
  /** Primary goal driving the adaptation. */
  goal:
    | 'stop-early-efficacy'
    | 'stop-early-futility'
    | 'reestimate-sample-size'
    | 'select-population'
    | 'select-dose'
    | 'combine-phases'
    | 'compare-many-arms';
  /** Whether interim looks will use unblinded comparative data. */
  unblindedInterim?: boolean;
  /** Number of planned interim analyses (excluding the final). */
  numberOfInterims?: number;
  /** Whether the nuisance parameter (variance / control rate) is uncertain. */
  nuisanceParameterUncertain?: boolean;
  /** Whether a predictive biomarker subgroup is plausible. */
  biomarkerSubgroupPlausible?: boolean;
  /** Number of experimental arms / doses under consideration. */
  numberOfArms?: number;
  /** Familywise alpha to protect. */
  alpha?: number;
}

export interface DesignAdaptiveResult {
  recommendedAdaptation: AdaptationType;
  adaptationLabel: string;
  alphaSpending: AlphaSpendingFunction;
  rationale: string;
  typeOneErrorControl: string;
  operationalCautions: string[];
  /** Illustrative interim boundaries where a closed form applies. */
  interimBoundaries: { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[];
  regulatoryConsiderations: string[];
  citations: string[];
}

interface AdaptationMeta {
  type: AdaptationType;
  label: string;
  citation: string;
}

const ADAPTATION_META: AdaptationMeta[] = [
  { type: 'group-sequential', label: 'Group sequential design with alpha spending', citation: 'FDA Adaptive Designs (2019) §IV.A' },
  { type: 'blinded-ssr', label: 'Blinded sample-size re-estimation', citation: 'FDA Adaptive Designs (2019) §IV.B' },
  { type: 'unblinded-ssr', label: 'Unblinded sample-size re-estimation', citation: 'FDA Adaptive Designs (2019) §IV.C' },
  { type: 'adaptive-enrichment', label: 'Adaptive population enrichment', citation: 'FDA Adaptive Designs (2019) §IV.E' },
  { type: 'seamless-2-3', label: 'Seamless Phase 2/3 (inferential combination)', citation: 'FDA Adaptive Designs (2019) §IV.D' },
  { type: 'mams', label: 'Multi-arm multi-stage (MAMS) design', citation: 'FDA Adaptive Designs (2019) §IV.D' },
  { type: 'response-adaptive-randomization', label: 'Response-adaptive randomization', citation: 'FDA Adaptive Designs (2019) §IV.F' },
  { type: 'adaptive-dose-selection', label: 'Adaptive dose selection', citation: 'FDA Adaptive Designs (2019) §IV.D' },
  { type: 'non-adaptive-fixed', label: 'Fixed (non-adaptive) design', citation: 'ICH E9 (1998) §3' },
];

function adaptationMeta(t: AdaptationType): AdaptationMeta {
  const m = ADAPTATION_META.find((x: AdaptationMeta): boolean => x.type === t);
  return m as AdaptationMeta;
}

/**
 * O'Brien-Fleming-type nominal alpha boundaries via the Lan-DeMets spending
 * function alpha*(t) = 2 - 2*Phi(z_{alpha/2} / sqrt(t)). Deterministic.
 */
function obfSpending(totalAlpha: number, looks: number): { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[] {
  const out: { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[] = [];
  const zHalf = normInv(1 - totalAlpha / 2);
  let cumulativeSpent = 0;
  for (let i = 1; i <= looks; i++) {
    const t = i / looks;
    const cumAlpha = 2 - 2 * normCdf(zHalf / Math.sqrt(t));
    const incremental = Math.max(0, cumAlpha - cumulativeSpent);
    cumulativeSpent = cumAlpha;
    // Convert the incremental two-sided spend at this look to a nominal Z.
    const nominalAlpha = incremental;
    const nominalZ = normInv(1 - nominalAlpha / 2);
    out.push({
      look: i,
      informationFraction: round(t, 4),
      nominalZ: round(nominalZ, 4),
      nominalAlpha: round(nominalAlpha, 6),
    });
  }
  return out;
}

/**
 * Pocock-type constant-boundary nominal alpha via the Lan-DeMets Pocock
 * spending function alpha*(t) = alpha * ln(1 + (e-1)*t). Deterministic.
 */
function pocockSpending(totalAlpha: number, looks: number): { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[] {
  const out: { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[] = [];
  let cumulativeSpent = 0;
  for (let i = 1; i <= looks; i++) {
    const t = i / looks;
    const cumAlpha = totalAlpha * Math.log(1 + (Math.E - 1) * t);
    const incremental = Math.max(0, cumAlpha - cumulativeSpent);
    cumulativeSpent = cumAlpha;
    const nominalAlpha = incremental;
    const nominalZ = normInv(1 - nominalAlpha / 2);
    out.push({
      look: i,
      informationFraction: round(t, 4),
      nominalZ: round(nominalZ, 4),
      nominalAlpha: round(nominalAlpha, 6),
    });
  }
  return out;
}

/**
 * Select / design an adaptation with type-I-error-control considerations.
 * Deterministic and pure.
 *
 * Citations: FDA Adaptive Designs for Clinical Trials of Drugs and Biologics
 * (2019); ICH E9 (1998) §4.5–§4.6.
 */
export function designAdaptiveDesign(params: DesignAdaptiveParams): DesignAdaptiveResult {
  const alpha = params.alpha ?? 0.05;
  const unblinded = params.unblindedInterim ?? false;
  const looks = Math.max(1, Math.floor(params.numberOfInterims ?? 2)) + 0; // interims
  const arms = Math.max(1, Math.floor(params.numberOfArms ?? 1));

  let adaptation: AdaptationType;
  let spending: AlphaSpendingFunction;
  let rationale: string;
  let typeOneErrorControl: string;
  let interimBoundaries: { look: number; informationFraction: number; nominalZ: number; nominalAlpha: number }[] = [];

  switch (params.goal) {
    case 'stop-early-efficacy':
    case 'stop-early-futility': {
      adaptation = 'group-sequential';
      spending = 'lan-demets-obf';
      rationale =
        'Pre-planned interim analyses to stop early for ' +
        (params.goal === 'stop-early-efficacy' ? 'overwhelming efficacy' : 'futility') +
        ' are the textbook group-sequential setting. An O’Brien-Fleming-type Lan-DeMets ' +
        'spending function spends little alpha at early looks (conservative early stopping ' +
        'for efficacy) and preserves near-full alpha for the final analysis.';
      typeOneErrorControl =
        'A monotone alpha-spending function distributes the total one-sided/two-sided alpha ' +
        'across looks so the cumulative type I error equals alpha exactly; the boundaries ' +
        'below are derived from the information fractions at each look.';
      interimBoundaries = obfSpending(alpha, Math.max(2, looks + 1));
      break;
    }
    case 'reestimate-sample-size': {
      if (unblinded) {
        adaptation = 'unblinded-ssr';
        spending = 'lan-demets-obf';
        rationale =
          'Sample size will be re-estimated using an interim treatment-effect estimate ' +
          '(unblinded). This can inflate type I error unless a pre-specified combination ' +
          'test or a conditional-power rule with an inflation factor / weighted statistic ' +
          'is used. Pair with a group-sequential boundary to control alpha.';
        typeOneErrorControl =
          'Use a pre-specified combination function (e.g. inverse-normal / Fisher) or a ' +
          'promising-zone design with the Cui-Hung-Wang weighted statistic so the final ' +
          'test controls alpha despite the data-dependent re-sizing.';
        interimBoundaries = obfSpending(alpha, Math.max(2, looks + 1));
      } else {
        adaptation = 'blinded-ssr';
        spending = 'none';
        rationale =
          'The nuisance parameter (pooled variance for a continuous endpoint, or the ' +
          'overall event/response rate) is uncertain, but no comparative interim is needed. ' +
          'Blinded sample-size re-estimation adjusts n using only blinded aggregate data and ' +
          'has negligible impact on type I error — generally the lowest-risk adaptation.';
        typeOneErrorControl =
          'Because the re-estimation uses only blinded nuisance-parameter estimates and not ' +
          'the treatment effect, the type I error inflation is negligible and no alpha ' +
          'adjustment is typically required (FDA Adaptive Designs 2019 §IV.B).';
        interimBoundaries = [];
      }
      break;
    }
    case 'select-population': {
      adaptation = params.biomarkerSubgroupPlausible ? 'adaptive-enrichment' : 'group-sequential';
      spending = 'lan-demets-obf';
      rationale = params.biomarkerSubgroupPlausible
        ? 'A predictive biomarker subgroup is plausible. An adaptive-enrichment design runs ' +
          'an interim analysis and, if the overall population underperforms while the marker- ' +
          'positive subgroup is promising, restricts subsequent enrollment to the subgroup. ' +
          'The two populations (full / enriched) form a multiplicity structure.'
        : 'No credible predictive subgroup was identified, so enrichment is not justified; a ' +
          'standard group-sequential design is the safer choice.';
      typeOneErrorControl =
        'Control type I error across BOTH the populations tested (full and enriched) AND the ' +
        'interim looks using a combination test plus a closed-testing / graphical multiplicity ' +
        'procedure (combine endpoint-multiplicity with alpha spending).';
      interimBoundaries = obfSpending(alpha, Math.max(2, looks + 1));
      break;
    }
    case 'combine-phases': {
      adaptation = 'seamless-2-3';
      spending = 'lan-demets-obf';
      rationale =
        'An inferentially seamless Phase 2/3 design selects dose(s)/arm(s) at the end of the ' +
        'learning stage and carries the selected arm(s) plus the stage-1 data into the ' +
        'confirmatory analysis. The arm selection plus stage combination is a multiplicity + ' +
        'adaptation problem requiring a combination test.';
      typeOneErrorControl =
        'Use a pre-specified combination function (inverse-normal or Fisher) with closed ' +
        'testing over the selected arms so that data-driven selection does not inflate alpha; ' +
        'this is the core requirement FDA flags for seamless designs.';
      interimBoundaries = obfSpending(alpha, 2);
      break;
    }
    case 'select-dose': {
      adaptation = 'adaptive-dose-selection';
      spending = 'lan-demets-obf';
      rationale =
        'Multiple doses are screened with an interim selection. Combine the dose selection ' +
        'rule with a multiple-comparison procedure (e.g. Dunnett) and a combination test to ' +
        'preserve alpha across the selected dose and the interim.';
      typeOneErrorControl =
        'Type I error is controlled by combining a many-to-one (Dunnett) multiplicity ' +
        'adjustment for the doses with a stage-combination test for the adaptation.';
      interimBoundaries = obfSpending(alpha, Math.max(2, looks + 1));
      break;
    }
    case 'compare-many-arms': {
      adaptation = 'mams';
      spending = 'lan-demets-obf';
      rationale =
        `A multi-arm multi-stage (MAMS) design evaluates ${arms} experimental arms against a ` +
        'shared control, dropping inferior arms at interim stages. It is efficient (shared ' +
        'control, fewer patients) but requires simultaneous control of arm multiplicity and ' +
        'stagewise looks.';
      typeOneErrorControl =
        'Control FWER across arms (Dunnett-type) AND across stages (alpha spending) jointly; ' +
        'the platform must pre-specify both the arm-dropping rule and the spending function.';
      interimBoundaries = obfSpending(alpha, Math.max(2, looks + 1));
      break;
    }
    default: {
      adaptation = 'non-adaptive-fixed';
      spending = 'none';
      rationale =
        'No adaptation is justified by the stated goal; a fixed design avoids the operational ' +
        'and statistical complexity adaptations introduce.';
      typeOneErrorControl = 'A single final analysis at alpha; no adjustment needed.';
      interimBoundaries = [];
    }
  }

  const operationalCautions: string[] = [
    'Pre-specify the entire adaptation algorithm (timing, decision rules, statistics) in the ' +
      'protocol/SAP before any unblinded data are seen (FDA Adaptive Designs 2019 §V).',
    'Maintain trial integrity: limit access to unblinded interim results to an independent ' +
      'DMC/SAC with firewalls and documented charters (FDA Adaptive Designs 2019 §VI).',
  ];
  if (unblinded) {
    operationalCautions.push(
      'Unblinded adaptations risk operational bias (knowledge of interim effect leaking to ' +
        'sponsor/sites); document the firewall and consider an independent statistical group.',
    );
  }
  if ((adaptation as AdaptationType) === 'response-adaptive-randomization') {
    operationalCautions.push(
      'Response-adaptive randomization can introduce time-trend confounding and complicate ' +
        'inference; pre-specify the allocation rule and a trend-robust analysis.',
    );
  }

  const regulatoryConsiderations: string[] = [
    'FDA recommends extensive clinical-trial simulation to characterize type I error and ' +
      'power of the adaptive design under a range of scenarios (2019 §VII).',
    'Engage the agency early (Type B / Type C meeting) for novel adaptive features; provide ' +
      'the simulation report and the SAP.',
    'ICH E9 §4.5–§4.6: interim analyses and their consequences for the trial must be planned ' +
      'and documented in advance.',
  ];

  const meta = adaptationMeta(adaptation);
  return {
    recommendedAdaptation: adaptation,
    adaptationLabel: meta.label,
    alphaSpending: spending,
    rationale,
    typeOneErrorControl,
    operationalCautions,
    interimBoundaries,
    regulatoryConsiderations,
    citations: [
      'FDA Adaptive Designs for Clinical Trials of Drugs and Biologics (2019)',
      'ICH E9 (1998) §4.5–§4.6 — interim analysis and early stopping',
      meta.citation,
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Missing-data strategy
// ═════════════════════════════════════════════════════════════════════════════

export type MissingnessMechanism = 'MCAR' | 'MAR' | 'MNAR' | 'unknown';

export type PrimaryEstimator =
  | 'mmrm'
  | 'multiple-imputation-mar'
  | 'ancova-complete-case'
  | 'generalized-estimating-equations'
  | 'reference-based-imputation';

export type SensitivityEstimator =
  | 'control-based-imputation'
  | 'jump-to-reference'
  | 'copy-reference'
  | 'copy-increment-from-reference'
  | 'delta-adjustment-tipping-point'
  | 'selection-model'
  | 'pattern-mixture-model';

export interface SelectMissingDataParams {
  /** Endpoint type. */
  endpointType: 'continuous-longitudinal' | 'continuous-single' | 'binary' | 'time-to-event';
  /** The estimand's intercurrent-event strategy the missing-data plan must serve. */
  estimandStrategy: IntercurrentEventStrategy;
  /** Assumed dominant missingness mechanism. */
  assumedMechanism?: MissingnessMechanism;
  /** Expected proportion of subjects with missing primary outcome (0..1). */
  expectedMissingFraction?: number;
  /** Whether monotone (dropout) vs intermittent missingness dominates. */
  monotoneDropout?: boolean;
}

export interface SelectMissingDataResult {
  primaryEstimator: PrimaryEstimator;
  primaryEstimatorLabel: string;
  primaryRationale: string;
  primaryAssumption: MissingnessMechanism;
  sensitivityAnalyses: { estimator: SensitivityEstimator; purpose: string; assumption: MissingnessMechanism }[];
  estimandAlignmentNote: string;
  cautions: string[];
  citations: string[];
}

interface PrimaryEstimatorMeta {
  estimator: PrimaryEstimator;
  label: string;
  assumption: MissingnessMechanism;
}

const PRIMARY_ESTIMATOR_META: PrimaryEstimatorMeta[] = [
  { estimator: 'mmrm', label: 'Mixed model for repeated measures (MMRM)', assumption: 'MAR' },
  { estimator: 'multiple-imputation-mar', label: 'Multiple imputation under MAR', assumption: 'MAR' },
  { estimator: 'ancova-complete-case', label: 'ANCOVA on completers / single timepoint', assumption: 'MCAR' },
  { estimator: 'generalized-estimating-equations', label: 'GEE (with MAR weighting)', assumption: 'MAR' },
  { estimator: 'reference-based-imputation', label: 'Reference-based multiple imputation', assumption: 'MNAR' },
];

function primaryEstimatorMeta(e: PrimaryEstimator): PrimaryEstimatorMeta {
  const m = PRIMARY_ESTIMATOR_META.find((x: PrimaryEstimatorMeta): boolean => x.estimator === e);
  return m as PrimaryEstimatorMeta;
}

/**
 * Choose a primary estimator and sensitivity analyses for missing data,
 * aligned to the estimand's intercurrent-event strategy. Deterministic.
 *
 * Citations: ICH E9(R1) (2019) §A.4 (sensitivity analysis & missing data);
 * ICH E9 (1998) §5.3; NRC "The Prevention and Treatment of Missing Data in
 * Clinical Trials" (2010) as referenced by ICH E9(R1).
 */
export function selectMissingDataStrategy(
  params: SelectMissingDataParams,
): SelectMissingDataResult {
  const mechanism: MissingnessMechanism = params.assumedMechanism ?? 'MAR';
  const missingFrac = params.expectedMissingFraction ?? 0.1;
  const monotone = params.monotoneDropout ?? true;

  let primary: PrimaryEstimator;
  let primaryRationale: string;

  if (params.estimandStrategy === 'treatment-policy') {
    // Treatment-policy: collect post-ICE data; only genuinely-unobserved values
    // are "missing". MAR-based MMRM/MI on the full observation period.
    primary =
      params.endpointType === 'continuous-longitudinal'
        ? 'mmrm'
        : params.endpointType === 'binary'
          ? 'multiple-imputation-mar'
          : params.endpointType === 'time-to-event'
            ? 'multiple-imputation-mar'
            : 'ancova-complete-case';
    primaryRationale =
      'Under a treatment-policy estimand, data are collected after the intercurrent event, ' +
      'so the only missing values are genuinely unobserved (e.g. true loss to follow-up). ' +
      'A likelihood-based MMRM (longitudinal) or MAR multiple imputation handles these under ' +
      'MAR while using the post-ICE observed data directly.';
  } else if (params.estimandStrategy === 'hypothetical') {
    // Hypothetical: set post-ICE data to missing and estimate under MAR.
    primary = params.endpointType === 'continuous-longitudinal' ? 'mmrm' : 'multiple-imputation-mar';
    primaryRationale =
      'Under a hypothetical estimand ("had the intercurrent event not occurred"), post-ICE ' +
      'observations are set to missing and the mean that would have been observed is estimated ' +
      'under MAR. An MMRM (continuous longitudinal) or MAR multiple imputation is the standard ' +
      'primary estimator.';
  } else if (params.estimandStrategy === 'composite') {
    primary = 'multiple-imputation-mar';
    primaryRationale =
      'Under a composite estimand the intercurrent event is folded into the variable (e.g. ' +
      'non-responder), so the ICE itself is not missing data; only truly unobserved composite ' +
      'values require imputation, handled under MAR.';
  } else if (params.estimandStrategy === 'while-on-treatment') {
    primary = params.endpointType === 'continuous-longitudinal' ? 'mmrm' : 'ancova-complete-case';
    primaryRationale =
      'Under a while-on-treatment estimand only the on-treatment period is analyzed; missing ' +
      'on-treatment observations are handled under MAR (MMRM) — post-ICE values are out of ' +
      'scope by construction, not missing.';
  } else {
    // principal-stratum
    primary = 'multiple-imputation-mar';
    primaryRationale =
      'Under a principal-stratum estimand the latent stratum membership drives identification; ' +
      'missing outcome data within the stratum are handled under MAR, but the dominant ' +
      'assumptions are about stratum membership, addressed in sensitivity analyses.';
  }

  // Reference-based primary only when the estimand is explicitly conservative.
  const sensitivityAnalyses: { estimator: SensitivityEstimator; purpose: string; assumption: MissingnessMechanism }[] = [];

  if (params.estimandStrategy === 'hypothetical' || params.estimandStrategy === 'treatment-policy') {
    sensitivityAnalyses.push({
      estimator: 'jump-to-reference',
      purpose:
        'Probe departures from MAR by assuming subjects who discontinue active treatment ' +
        'behave like the control arm thereafter (a conservative MNAR scenario).',
      assumption: 'MNAR',
    });
    sensitivityAnalyses.push({
      estimator: 'copy-reference',
      purpose:
        'Reference-based MI variant: imputed values copy the reference-arm trajectory, ' +
        'shrinking the active-arm advantage for discontinuers.',
      assumption: 'MNAR',
    });
  }
  sensitivityAnalyses.push({
    estimator: 'delta-adjustment-tipping-point',
    purpose:
      'Tipping-point analysis: progressively worsen imputed outcomes in the active arm (add ' +
      'a delta) until the conclusion reverses; report the delta required and judge its ' +
      'clinical plausibility.',
    assumption: 'MNAR',
  });
  sensitivityAnalyses.push({
    estimator: 'pattern-mixture-model',
    purpose:
      'Model the outcome distribution separately by missingness pattern to stress-test the ' +
      'MAR assumption (an explicit MNAR sensitivity model).',
    assumption: 'MNAR',
  });
  if (!monotone) {
    sensitivityAnalyses.push({
      estimator: 'control-based-imputation',
      purpose:
        'With intermittent (non-monotone) missingness, a control-based MI provides a ' +
        'conservative reference for the intermittently missing visits.',
      assumption: 'MNAR',
    });
  }

  const cautions: string[] = [
    'No statistical method recovers information that was never collected; the first-line ' +
      'defense against missing data is trial conduct (minimize dropout, follow up after ' +
      'discontinuation) — ICH E9(R1) §A.4 and the NRC 2010 report.',
    'The missing-data assumption (MCAR/MAR/MNAR) is untestable from the observed data alone; ' +
      'pre-specify the primary assumption and the sensitivity analyses in the SAP.',
    'Avoid single-imputation shortcuts (LOCF/BOCF) as the PRIMARY analysis — they assume an ' +
      'implausible mechanism and understate uncertainty (ICH E9(R1) discourages them).',
  ];
  if (missingFrac > 0.2) {
    cautions.push(
      `An expected missing fraction of ${round(missingFrac * 100, 1)}% is high; results will ` +
        'be sensitive to the missing-data assumption — strengthen retention and broaden the ' +
        'sensitivity analyses.',
    );
  }

  const meta = primaryEstimatorMeta(primary);
  return {
    primaryEstimator: primary,
    primaryEstimatorLabel: meta.label,
    primaryRationale,
    primaryAssumption: mechanism === 'unknown' ? meta.assumption : mechanism === 'MCAR' ? 'MCAR' : meta.assumption,
    sensitivityAnalyses,
    estimandAlignmentNote:
      'The missing-data handling must serve the estimand: the same intercurrent-event ' +
      'strategy that defines the estimand dictates which observations are "missing" versus ' +
      '"out of scope". Re-derive this plan if the estimand changes (ICH E9(R1) §A.4).',
    cautions,
    citations: [
      'ICH E9(R1) (2019) §A.4 — sensitivity analysis and missing data',
      'ICH E9 (1998) §5.3 — missing values and outliers',
      'National Research Council (2010), The Prevention and Treatment of Missing Data ' +
        'in Clinical Trials (referenced by ICH E9(R1))',
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Sample-size estimation (closed-form)
// ═════════════════════════════════════════════════════════════════════════════

export type EndpointKind = 'continuous' | 'binary' | 'time-to-event';
export type DesignComparison = 'superiority' | 'non-inferiority' | 'equivalence';

export interface EstimateSampleSizeParams {
  endpointKind: EndpointKind;
  comparison: DesignComparison;
  /** Significance level. Convention: two-sided for superiority/equivalence,
   *  one-sided for non-inferiority. Provide the value you intend; the formula
   *  note states how it is used. Default 0.05. */
  alpha?: number;
  /** Whether alpha is to be treated as two-sided. Default: true for
   *  superiority/equivalence, false for non-inferiority. */
  twoSided?: boolean;
  /** Target power (1 - beta). Default 0.90. */
  power?: number;
  /** Allocation ratio experimental:control (k = n_exp / n_ctrl). Default 1. */
  allocationRatio?: number;
  /** Anticipated dropout fraction (0..1) to inflate n. Default 0. */
  dropoutFraction?: number;

  // Continuous endpoint parameters
  /** Mean difference to detect (superiority) or expected true diff (NI/equiv). */
  meanDifference?: number;
  /** Common standard deviation. */
  standardDeviation?: number;

  // Binary endpoint parameters
  /** Control-arm proportion (0..1). */
  controlProportion?: number;
  /** Experimental-arm proportion (0..1). */
  experimentalProportion?: number;

  // Time-to-event parameters (Schoenfeld)
  /** Hazard ratio to detect. */
  hazardRatio?: number;
  /** Overall probability that a subject has an event during the study (0..1). */
  eventProbability?: number;

  // Margins for NI / equivalence
  /** Non-inferiority margin (same units as endpoint contrast). For binary use
   *  a risk-difference margin; for continuous a mean-difference margin; for TTE
   *  a log-hazard-ratio margin expressed as an HR (e.g. 1.3). */
  niMargin?: number;
  /** Equivalence margin (symmetric, absolute). */
  equivalenceMargin?: number;
}

export interface EstimateSampleSizeResult {
  endpointKind: EndpointKind;
  comparison: DesignComparison;
  /** Per-arm sample sizes (control, experimental) BEFORE dropout inflation. */
  nPerArm: { control: number; experimental: number };
  /** Total randomized after dropout inflation. */
  totalRandomized: number;
  /** For TTE: required number of events. */
  requiredEvents?: number;
  /** The exact formula applied, in plain text. */
  formula: string;
  /** Echo of the key derived quantities (effect size, z-values). */
  derivedQuantities: Record<string, number>;
  assumptions: string[];
  citations: string[];
}

/**
 * Closed-form sample size for continuous (two-sample t / z), binary
 * (two-proportion z), and time-to-event (Schoenfeld) endpoints under
 * superiority, non-inferiority, or equivalence. Normal approximation;
 * deterministic and pure.
 *
 * Citations: ICH E9 (1998) §3.5 (sample size); FDA Non-Inferiority (2016)
 * §III (NI margin & analysis); Schoenfeld (1983) for the event-driven formula;
 * Chow, Shao, Wang, "Sample Size Calculations in Clinical Research".
 */
export function estimateSampleSize(
  params: EstimateSampleSizeParams,
): EstimateSampleSizeResult {
  const power = params.power ?? 0.9;
  const beta = 1 - power;
  const k = params.allocationRatio && params.allocationRatio > 0 ? params.allocationRatio : 1;
  const dropout = Math.min(0.95, Math.max(0, params.dropoutFraction ?? 0));
  const comparison = params.comparison;

  // Default sidedness per convention.
  const twoSided =
    params.twoSided ?? (comparison === 'non-inferiority' ? false : true);
  const alpha = params.alpha ?? 0.05;
  // For equivalence the TOST uses alpha at each side; the relevant z is z_alpha
  // (one-sided) but two intervals → use z_{alpha} with two one-sided tests.
  const zAlpha =
    comparison === 'equivalence'
      ? normInv(1 - alpha) // each one-sided test of TOST at alpha
      : twoSided
        ? normInv(1 - alpha / 2)
        : normInv(1 - alpha);
  // Equivalence uses z_{beta/2}; superiority/NI use z_{beta}.
  const zBeta = comparison === 'equivalence' ? normInv(1 - beta / 2) : normInv(1 - beta);

  let nControl = 0;
  let nExperimental = 0;
  let requiredEvents: number | undefined;
  let formula = '';
  const derivedQuantities: Record<string, number> = {};
  const assumptions: string[] = [];

  if (params.endpointKind === 'continuous') {
    const sd = params.standardDeviation ?? 1;
    const rawDiff = params.meanDifference ?? 0;
    // Effective contrast after subtracting margin for NI/equivalence.
    let effect: number;
    if (comparison === 'superiority') {
      effect = Math.abs(rawDiff);
      formula =
        'Two-sample comparison of means (normal approximation): ' +
        'n_control = (1 + 1/k) * (z_{1-alpha[/2]} + z_{1-beta})^2 * sigma^2 / delta^2, ' +
        'with n_exp = k * n_control. Here delta is the true mean difference to detect.';
    } else if (comparison === 'non-inferiority') {
      const margin = Math.abs(params.niMargin ?? 0);
      // Effect available against the margin = |true diff| + margin if drug is
      // truly non-inferior with expected diff rawDiff (assume rawDiff >= 0 favorable).
      effect = Math.abs(margin + rawDiff);
      formula =
        'Non-inferiority for means: n_control = (1 + 1/k) * (z_{1-alpha} + z_{1-beta})^2 * ' +
        'sigma^2 / (delta_expected + margin)^2 (one-sided alpha). The denominator combines ' +
        'the expected true difference and the NI margin.';
      assumptions.push(
        'NI margin must be pre-specified and clinically/statistically justified ' +
          '(fraction-retention of the active-control effect) — FDA Non-Inferiority (2016) §III.',
      );
    } else {
      // equivalence
      const margin = Math.abs(params.equivalenceMargin ?? 0);
      effect = Math.max(1e-9, margin - Math.abs(rawDiff));
      formula =
        'Equivalence (TOST) for means: n_control = (1 + 1/k) * (z_{1-alpha} + z_{1-beta/2})^2 ' +
        '* sigma^2 / (margin - |delta_expected|)^2. Uses two one-sided tests at alpha.';
      assumptions.push(
        'Equivalence requires the two-sided CI for the difference to lie entirely within ' +
          '(-margin, +margin); power uses z_{1-beta/2}.',
      );
    }
    const cohenD = effect / sd;
    derivedQuantities.zAlpha = round(zAlpha, 4);
    derivedQuantities.zBeta = round(zBeta, 4);
    derivedQuantities.effect = round(effect, 6);
    derivedQuantities.standardizedEffect = round(cohenD, 6);
    const nC = ((1 + 1 / k) * Math.pow(zAlpha + zBeta, 2) * sd * sd) / (effect * effect);
    nControl = ceilN(nC);
    nExperimental = ceilN(nC * k);
    assumptions.push(
      'Assumes a common, known standard deviation and approximately normal outcomes; for ' +
        'small n use the t-distribution (add ~1–2 per arm).',
    );
  } else if (params.endpointKind === 'binary') {
    const pC = clampProb(params.controlProportion ?? 0.5);
    const pE = clampProb(params.experimentalProportion ?? pC);
    let effect: number;
    if (comparison === 'superiority') {
      effect = Math.abs(pE - pC);
      formula =
        'Two-proportion comparison (normal approximation, risk difference): ' +
        'n_control = (z_{1-alpha[/2]} * sqrt((1+1/k) * pbar*(1-pbar)) + ' +
        'z_{1-beta} * sqrt(pE*(1-pE)/k + pC*(1-pC)))^2 / (pE - pC)^2, ' +
        'where pbar is the allocation-weighted pooled proportion.';
    } else if (comparison === 'non-inferiority') {
      const margin = Math.abs(params.niMargin ?? 0);
      // For NI on risk difference, the "distance" to the margin is |pE - pC| + margin
      // when the experimental is truly non-inferior (expected diff favorable).
      effect = Math.abs((pE - pC) + margin);
      formula =
        'Non-inferiority for proportions (risk difference): ' +
        'n_control = (z_{1-alpha} + z_{1-beta})^2 * (pE*(1-pE)/k + pC*(1-pC)) / ' +
        '((pE - pC) + margin)^2 (one-sided alpha).';
      assumptions.push(
        'NI margin on the risk-difference scale must be pre-specified and justified ' +
          '(FDA Non-Inferiority 2016 §III).',
      );
    } else {
      const margin = Math.abs(params.equivalenceMargin ?? 0);
      effect = Math.max(1e-9, margin - Math.abs(pE - pC));
      formula =
        'Equivalence (TOST) for proportions: n_control = (z_{1-alpha} + z_{1-beta/2})^2 * ' +
        '(pE*(1-pE)/k + pC*(1-pC)) / (margin - |pE - pC|)^2.';
    }
    const pBar = (pC + k * pE) / (1 + k);
    derivedQuantities.zAlpha = round(zAlpha, 4);
    derivedQuantities.zBeta = round(zBeta, 4);
    derivedQuantities.controlProportion = round(pC, 6);
    derivedQuantities.experimentalProportion = round(pE, 6);
    derivedQuantities.effect = round(effect, 6);
    let nC: number;
    if (comparison === 'superiority') {
      const a = zAlpha * Math.sqrt((1 + 1 / k) * pBar * (1 - pBar));
      const b = zBeta * Math.sqrt((pE * (1 - pE)) / k + pC * (1 - pC));
      nC = Math.pow(a + b, 2) / (effect * effect);
    } else {
      const variance = (pE * (1 - pE)) / k + pC * (1 - pC);
      nC = (Math.pow(zAlpha + zBeta, 2) * variance) / (effect * effect);
    }
    nControl = ceilN(nC);
    nExperimental = ceilN(nC * k);
    assumptions.push(
      'Normal approximation to the binomial; for very small proportions or counts, an exact ' +
        'method (Fisher) or continuity correction may increase the required n.',
    );
  } else {
    // time-to-event — Schoenfeld
    let hr = params.hazardRatio ?? 1;
    if (hr <= 0) hr = 1e-6;
    let logHR: number;
    if (comparison === 'superiority') {
      logHR = Math.log(hr);
      formula =
        'Schoenfeld (1983) event-driven formula: required events ' +
        'E = (z_{1-alpha[/2]} + z_{1-beta})^2 / (theta^2 * k/(1+k)^2), where ' +
        'theta = ln(HR) is the log-hazard-ratio (the allocation factor k/(1+k)^2 = 1/4 ' +
        'for 1:1). n is then E / overall_event_probability.';
    } else if (comparison === 'non-inferiority') {
      const marginHR = Math.abs(params.niMargin ?? 1) || 1;
      // distance to the margin on log scale.
      logHR = Math.log(marginHR) - Math.log(hr);
      formula =
        'Non-inferiority (TTE, Schoenfeld): E = (z_{1-alpha} + z_{1-beta})^2 / ' +
        '(theta^2 * k/(1+k)^2) with theta = ln(NI_margin_HR) - ln(expected_HR) (one-sided).';
      assumptions.push(
        'NI margin expressed as a hazard ratio (e.g. 1.3) must be pre-specified and justified.',
      );
    } else {
      const marginHR = Math.abs(params.equivalenceMargin ?? 1) || 1;
      logHR = Math.max(1e-6, Math.abs(Math.log(marginHR)) - Math.abs(Math.log(hr)));
      formula =
        'Equivalence (TTE): E = (z_{1-alpha} + z_{1-beta/2})^2 / (theta^2 * k/(1+k)^2) with ' +
        'theta = |ln(equiv_margin_HR)| - |ln(expected_HR)|.';
    }
    const allocFactor = k / Math.pow(1 + k, 2); // 1/4 at k=1
    const theta2 = Math.max(1e-12, logHR * logHR);
    const events = Math.pow(zAlpha + zBeta, 2) / (theta2 * allocFactor);
    requiredEvents = ceilN(events);
    const eventProb = clampProb(params.eventProbability ?? 1);
    const totalN = requiredEvents / Math.max(1e-6, eventProb);
    // Split by allocation.
    nControl = ceilN(totalN / (1 + k));
    nExperimental = ceilN((totalN * k) / (1 + k));
    derivedQuantities.zAlpha = round(zAlpha, 4);
    derivedQuantities.zBeta = round(zBeta, 4);
    derivedQuantities.logHazardRatio = round(logHR, 6);
    derivedQuantities.allocationFactor = round(allocFactor, 6);
    derivedQuantities.requiredEvents = requiredEvents;
    derivedQuantities.eventProbability = round(eventProb, 6);
    assumptions.push(
      'Schoenfeld formula assumes proportional hazards and that the number of events drives ' +
        'power; total n is back-calculated from the overall probability of an event.',
    );
  }

  // Dropout inflation: n_adj = n / (1 - dropout).
  const inflate = (n: number): number => ceilN(n / (1 - dropout));
  const nControlAdj = dropout > 0 ? inflate(nControl) : nControl;
  const nExperimentalAdj = dropout > 0 ? inflate(nExperimental) : nExperimental;
  const totalRandomized = nControlAdj + nExperimentalAdj;

  if (dropout > 0) {
    assumptions.push(
      `Per-arm n inflated by 1/(1-${dropout}) = ${round(1 / (1 - dropout), 4)} for dropout.`,
    );
  }
  assumptions.push(
    twoSided
      ? 'Alpha treated as TWO-sided.'
      : 'Alpha treated as ONE-sided (per non-inferiority / TOST convention).',
  );

  return {
    endpointKind: params.endpointKind,
    comparison,
    nPerArm: { control: nControlAdj, experimental: nExperimentalAdj },
    totalRandomized,
    requiredEvents,
    formula,
    derivedQuantities,
    assumptions,
    citations: [
      'ICH E9 (1998) §3.5 — sample size',
      comparison === 'non-inferiority'
        ? 'FDA Non-Inferiority Clinical Trials to Establish Effectiveness (2016) §III'
        : 'ICH E9(R1) (2019) §A.2 — align sample size to the estimand',
      params.endpointKind === 'time-to-event'
        ? 'Schoenfeld DA (1983), Biometrics — sample size for the log-rank/Cox test'
        : 'Chow, Shao & Wang, Sample Size Calculations in Clinical Research',
    ],
  };
}

function clampProb(p: number): number {
  if (p < 1e-6) return 1e-6;
  if (p > 1 - 1e-6) return 1 - 1e-6;
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Reference tables & extended regulatory notes (deterministic data)
// ═════════════════════════════════════════════════════════════════════════════
//
// The following exported reference tables make the regulatory grounding of the
// engine inspectable and reusable by callers (e.g. report generators) without
// re-deriving it. All are pure data, no `as const`, explicitly typed.

export interface EstimandAttributeReference {
  attribute: string;
  ich_e9r1_section: string;
  definition: string;
  commonPitfall: string;
}

export const ESTIMAND_ATTRIBUTE_REFERENCE: EstimandAttributeReference[] = [
  {
    attribute: 'Treatment',
    ich_e9r1_section: 'ICH E9(R1) §A.3.2',
    definition:
      'The treatment condition of interest and, as appropriate, the alternative treatment ' +
      'condition to which comparison will be made — including dose, schedule, and permitted ' +
      'concomitant/background therapy.',
    commonPitfall:
      'Failing to specify background/standard-of-care therapy, so the "treatment" is ambiguous.',
  },
  {
    attribute: 'Population',
    ich_e9r1_section: 'ICH E9(R1) §A.3.2',
    definition:
      'The patients targeted by the clinical question — the population in which the treatment ' +
      'effect is to be estimated (may be the full trial population or a subpopulation).',
    commonPitfall:
      'Conflating the analysis set (an operational construct) with the target population (the ' +
      'estimand attribute).',
  },
  {
    attribute: 'Variable (endpoint)',
    ich_e9r1_section: 'ICH E9(R1) §A.3.2',
    definition:
      'The endpoint obtained for each patient that is required to address the clinical ' +
      'question, including the timing of assessment.',
    commonPitfall:
      'Leaving the assessment time implicit, so the estimand is not fully specified.',
  },
  {
    attribute: 'Intercurrent-event handling',
    ich_e9r1_section: 'ICH E9(R1) §A.3.3–§A.3.4',
    definition:
      'For each anticipated intercurrent event, the strategy (treatment-policy, hypothetical, ' +
      'composite, while-on-treatment, principal-stratum) used to reflect the clinical question.',
    commonPitfall:
      'Choosing a strategy that is incoherent with the variable (e.g. treatment-policy for death ' +
      'with a non-mortality endpoint).',
  },
  {
    attribute: 'Population-level summary',
    ich_e9r1_section: 'ICH E9(R1) §A.3.5',
    definition:
      'A summary measure for the variable that provides a basis for comparison between ' +
      'treatment conditions (e.g. difference in means, risk difference, hazard ratio).',
    commonPitfall:
      'Selecting a summary (e.g. hazard ratio) that implicitly assumes a model (proportional ' +
      'hazards) not justified for the data.',
  },
];

export interface NonInferiorityReference {
  topic: string;
  fda_2016_section: string;
  guidance: string;
}

export const NON_INFERIORITY_REFERENCE: NonInferiorityReference[] = [
  {
    topic: 'Assay sensitivity',
    fda_2016_section: 'FDA Non-Inferiority (2016) §II',
    guidance:
      'An NI trial is only interpretable if the active control would reliably have beaten ' +
      'placebo in this trial (constancy + assay sensitivity). If historical evidence of the ' +
      "control's effect is weak, an NI design may be uninterpretable.",
  },
  {
    topic: 'Margin (M1 / M2)',
    fda_2016_section: 'FDA Non-Inferiority (2016) §III',
    guidance:
      'M1 is the entire effect of the active control vs placebo inferred from historical data; ' +
      'M2 (the NI margin) is a clinically acceptable fraction of M1 that may be lost. The trial ' +
      'rules out a loss larger than M2.',
  },
  {
    topic: 'Analysis sets',
    fda_2016_section: 'FDA Non-Inferiority (2016) §III.E',
    guidance:
      'Unlike superiority trials, in NI the ITT analysis is not automatically conservative; ' +
      'evaluate BOTH ITT and per-protocol and require consistency.',
  },
  {
    topic: 'Biocreep',
    fda_2016_section: 'FDA Non-Inferiority (2016) §II',
    guidance:
      'Successive NI comparisons against progressively weaker controls can erode the standard; ' +
      'anchor the margin to placebo-controlled historical evidence, not the latest comparator.',
  },
];

export interface MrctReference {
  topic: string;
  ich_e17_section: string;
  guidance: string;
}

export const MRCT_REFERENCE: MrctReference[] = [
  {
    topic: 'Structured pooling / regions',
    ich_e17_section: 'ICH E17 (2017) §2.1',
    guidance:
      'Plan a single MRCT with a common protocol and a pre-specified strategy for pooling ' +
      'regions; allocate sample size to give a reasonable chance of consistency across regions.',
  },
  {
    topic: 'Consistency of effects',
    ich_e17_section: 'ICH E17 (2017) §2.2.5',
    guidance:
      'Pre-specify how consistency of the treatment effect across regions will be evaluated; ' +
      'avoid requiring statistical significance within each region (under-powered by design).',
  },
  {
    topic: 'Intrinsic / extrinsic factors',
    ich_e17_section: 'ICH E17 (2017) §2.2.1',
    guidance:
      'Identify intrinsic (genetic, physiological) and extrinsic (medical practice, diet) ' +
      'factors that could cause regional differences, and reflect them in design and analysis.',
  },
];

export interface ControlChoiceReference {
  controlType: string;
  ich_e10_section: string;
  guidance: string;
}

export const CONTROL_CHOICE_REFERENCE: ControlChoiceReference[] = [
  {
    controlType: 'Placebo concurrent control',
    ich_e10_section: 'ICH E10 (2000) §2.1',
    guidance:
      'Maximizes assay sensitivity and the ability to distinguish drug effect from background; ' +
      'ethical only when withholding effective therapy causes no serious harm.',
  },
  {
    controlType: 'Active (positive) concurrent control',
    ich_e10_section: 'ICH E10 (2000) §2.4',
    guidance:
      'Used for superiority vs an active drug or for non-inferiority; NI/equivalence requires ' +
      'documented assay sensitivity and a justified margin.',
  },
  {
    controlType: 'No-treatment / dose-response concurrent control',
    ich_e10_section: 'ICH E10 (2000) §2.2–§2.3',
    guidance:
      'Dose-response concurrent controls characterize the dose-effect relationship and can ' +
      'provide internal evidence of assay sensitivity.',
  },
  {
    controlType: 'External / historical control',
    ich_e10_section: 'ICH E10 (2000) §2.5',
    guidance:
      'Acceptable only in limited circumstances (e.g. dramatic effects, predictable course); ' +
      'highly vulnerable to bias and generally not adequate to establish effectiveness.',
  },
];

/**
 * Aggregate reference accessor — returns the static regulatory reference tables.
 * Pure and deterministic; lets report generators cite the grounding directly.
 */
export function getStatisticsReferenceTables(): {
  estimandAttributes: EstimandAttributeReference[];
  nonInferiority: NonInferiorityReference[];
  mrct: MrctReference[];
  controlChoice: ControlChoiceReference[];
  strategies: StrategyMeta[];
  multiplicityMethods: MethodMeta[];
  adaptations: AdaptationMeta[];
} {
  return {
    estimandAttributes: ESTIMAND_ATTRIBUTE_REFERENCE,
    nonInferiority: NON_INFERIORITY_REFERENCE,
    mrct: MRCT_REFERENCE,
    controlChoice: CONTROL_CHOICE_REFERENCE,
    strategies: STRATEGY_META,
    multiplicityMethods: METHOD_META,
    adaptations: ADAPTATION_META,
  };
}
