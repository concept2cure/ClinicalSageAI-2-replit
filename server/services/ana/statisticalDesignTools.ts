/**
 * Statistical design & analysis tools — exposes the deterministic biostatistics
 * engines in `server/services/stats/*` to AnA as first-class, selectable tools.
 *
 * These engines were production-grade but previously had NO tool surface, so the
 * model could not reach them. Each tool here is a thin, validated wrapper over a
 * closed-form/exact engine (no Monte-Carlo, no LLM estimation) — the numbers are
 * reproducible and submission-defensible. Handlers live in AnaToolExecutor.ts
 * (registerToolHandler) and dynamic-import the matching `../stats/*` module.
 *
 * Tools:
 *   design_mmrm                  — MMRM longitudinal trial sample size/power (mmrm-design.ts)
 *   design_group_sequential      — alpha-spending boundaries + operating characteristics (group-sequential-oc.ts)
 *   design_dose_finding          — BOIN escalation boundaries / decision table / MTD (dose-finding-boin.ts)
 *   analyze_win_ratio            — hierarchical composite win ratio (win-ratio.ts)
 *   analyze_rmst                 — restricted mean survival time difference (rmst.ts)
 *   design_mrmc_reader_study     — MRMC reader-study power / readers-for-power (mrmc.ts)
 *   analyze_external_control_borrow — normal power-prior historical borrowing (external-control.ts)
 *   analyze_safety_signal        — PRR/ROR disproportionality signalling (signal-disproportionality.ts)
 *   adjust_multiplicity          — Bonferroni/Holm/Hochberg/fixed-seq/graphical FWER control (multiplicity.ts)
 *
 * @module server/services/ana/statisticalDesignTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Report the returned numbers verbatim. Do NOT recompute, round differently, or estimate these values yourself — a fabricated statistic in a regulatory submission is a critical defect. If the engine reports a validation error, relay exactly which parameter is missing or invalid and ask the user for it.';

export const DESIGN_MMRM: AnaTool = {
  name: 'design_mmrm',
  description:
    "Compute the sample size and power for a longitudinal trial analysed with a Mixed-Model for Repeated Measures (MMRM), using the DETERMINISTIC MMRM design engine (exact variance-factor under the assumed covariance — not an estimate). Use for repeated-measures designs (e.g. change-from-baseline at a target visit) where dropout/retention varies by visit. Returns required N per arm and total, the variance inflation factor, efficiency vs a completers-only analysis, and achieved power. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      visits: { type: 'number', description: 'Number of post-baseline visits T (integer ≥ 1). The contrast is tested at targetVisit (default T).' },
      covariance: { type: 'string', enum: ['compound_symmetry', 'ar1'], description: 'Within-subject correlation structure.' },
      rho: { type: 'number', description: 'Correlation parameter ρ ∈ [0,1). CS: common pairwise ρ. AR(1): lag-1 ρ.' },
      sigma: { type: 'number', description: 'Common SD of the change-from-baseline response at each visit (σ > 0).' },
      delta: { type: 'number', description: 'Between-arm difference in mean change at the target visit (|δ| > 0).' },
      alpha: { type: 'number', description: 'Two-sided significance level. Default 0.05.' },
      power: { type: 'number', description: 'Target power. Default 0.90.' },
      retention: { type: 'array', items: { type: 'number' }, description: 'Per-visit retention fractions (length = visits), monotone non-increasing in (0,1]. Default all 1 (complete data).' },
      targetVisit: { type: 'number', description: 'Visit at which the contrast is tested (1-based, default = final visit).' },
      allocationRatio: { type: 'number', description: 'Allocation ratio n₂/n₁. Default 1.' },
    },
    required: ['visits', 'covariance', 'rho', 'sigma', 'delta'],
  },
};

export const DESIGN_GROUP_SEQUENTIAL: AnaTool = {
  name: 'design_group_sequential',
  description:
    "Solve EXACT efficacy boundaries for a group-sequential (interim-analysis) design under an alpha-spending function, accounting for the correlation between looks so type I error is controlled at exactly alpha (one-sided) — not the common z_{1−α_k/2} approximation. Optionally returns the full operating-characteristics table (reject probability / expected information) over a grid of drift values. Use for any design with planned interim analyses. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      informationFractions: { type: 'array', items: { type: 'number' }, description: 'Information fractions at each analysis, strictly increasing, last = 1 (e.g. [0.5, 1.0]).' },
      alpha: { type: 'number', description: 'One-sided type I error to spend (0 < alpha < 0.5).' },
      spendingFunction: { type: 'string', enum: ['obrien-fleming', 'pocock', 'linear'], description: 'Alpha-spending function.' },
      driftGrid: { type: 'array', items: { type: 'number' }, description: 'Optional grid of drift values for the operating-characteristics table (e.g. [0, 1, 2, 3]). Include 0 for the type I error.' },
    },
    required: ['informationFractions', 'alpha', 'spendingFunction'],
  },
};

export const DESIGN_DOSE_FINDING: AnaTool = {
  name: 'design_dose_finding',
  description:
    "Compute the Bayesian Optimal Interval (BOIN) escalation/de-escalation boundaries and the per-cohort decision table for a Phase 1 dose-finding (oncology) trial, and — when observed dose-level data are supplied — select the MTD via isotonic regression. DETERMINISTIC. Use for first-in-human / dose-escalation design and conduct. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'number', description: 'Target DLT (toxicity) probability, e.g. 0.30.' },
      cohortSizes: { type: 'array', items: { type: 'number' }, description: 'Cumulative cohort sizes for the decision table. Default [3, 6, 9, 12].' },
      phi1: { type: 'number', description: 'Lower toxicity bound for the boundary (optional; engine default).' },
      phi2: { type: 'number', description: 'Upper toxicity bound for the boundary (optional; engine default).' },
      observedDoses: {
        type: 'array',
        description: 'Optional observed data per dose level (in dose order) to select the MTD.',
        items: {
          type: 'object',
          properties: {
            nPatients: { type: 'number', description: 'Patients treated at this dose.' },
            nDlt: { type: 'number', description: 'DLTs observed at this dose.' },
            eliminated: { type: 'boolean', description: 'Whether the dose was eliminated for safety.' },
          },
          required: ['nPatients', 'nDlt'],
        },
      },
    },
    required: ['target'],
  },
};

export const ANALYZE_WIN_RATIO: AnaTool = {
  name: 'analyze_win_ratio',
  description:
    "Compute the win ratio for a hierarchical composite endpoint: every treatment subject is compared with every control subject through an ordered hierarchy of levels (each continuous or time-to-event with right-censoring), the first decisive level deciding the pairwise winner. DETERMINISTIC. Returns the win ratio, wins/losses, confidence interval, and p-value. Use for prioritized composite endpoints (e.g. death > hospitalization > biomarker). " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      treatment: {
        type: 'array',
        description: 'Treatment-arm subjects. Each has `levels` ordered to match `hierarchy`.',
        items: {
          type: 'object',
          properties: {
            levels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  value: { type: 'number', description: 'Outcome value (TTE: the time).' },
                  event: { type: 'boolean', description: 'TTE only: true = event observed, false = right-censored.' },
                },
                required: ['value'],
              },
            },
          },
          required: ['levels'],
        },
      },
      control: { type: 'array', description: 'Control-arm subjects (same shape as treatment).', items: { type: 'object', properties: { levels: { type: 'array', items: { type: 'object', properties: { value: { type: 'number' }, event: { type: 'boolean' } }, required: ['value'] } } }, required: ['levels'] } },
      hierarchy: {
        type: 'array',
        description: 'Ordered level specs (highest priority first), parallel to each subject’s levels.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['continuous', 'tte'] },
            direction: { type: 'string', enum: ['higher-better', 'lower-better'] },
          },
          required: ['type', 'direction'],
        },
      },
      confLevel: { type: 'number', description: 'Confidence level for the interval. Default 0.95.' },
    },
    required: ['treatment', 'control', 'hierarchy'],
  },
};

export const ANALYZE_RMST: AnaTool = {
  name: 'analyze_rmst',
  description:
    "Compute the Restricted Mean Survival Time (RMST) difference between two arms up to a horizon tau, from Kaplan-Meier estimates — a model-free survival summary that does not assume proportional hazards. DETERMINISTIC. Returns RMST per arm, the difference, standard error, CI, and p-value. Use when the PH assumption is doubtful or for an interpretable 'extra event-free time' summary. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      treatment: {
        type: 'object',
        description: 'Treatment arm survival data (parallel arrays).',
        properties: {
          times: { type: 'array', items: { type: 'number' }, description: 'Observed times.' },
          events: { type: 'array', items: { type: 'number' }, description: '1 = event, 0 = censored, parallel to times.' },
        },
        required: ['times', 'events'],
      },
      control: { type: 'object', description: 'Control arm survival data.', properties: { times: { type: 'array', items: { type: 'number' } }, events: { type: 'array', items: { type: 'number' } } }, required: ['times', 'events'] },
      tau: { type: 'number', description: 'Restriction horizon (same time units as times).' },
      confLevel: { type: 'number', description: 'Confidence level. Default 0.95.' },
    },
    required: ['treatment', 'control', 'tau'],
  },
};

export const DESIGN_MRMC_READER_STUDY: AnaTool = {
  name: 'design_mrmc_reader_study',
  description:
    "Power analysis for a Multi-Reader Multi-Case (MRMC) study under the Obuchowski-Rockette model — the standard design for imaging / AI-diagnostic device pivotal studies comparing two modalities' figures of merit (e.g. AUC). DETERMINISTIC. Provide either `nReaders` to get the power, OR `targetPower` to get the minimum number of readers. Returns power, noncentrality, and variance of the reader-averaged modality difference. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      aucDifference: { type: 'number', description: 'True difference in the figure of merit between modalities (Δ).' },
      varTR: { type: 'number', description: 'Treatment×reader variance component σ²_TR ≥ 0.' },
      varError: { type: 'number', description: 'Single reader-modality error variance σ²_ε ≥ 0.' },
      cov1: { type: 'number', description: 'Same-reader, different-modality error covariance.' },
      cov2: { type: 'number', description: 'Different-reader, same-modality error covariance.' },
      cov3: { type: 'number', description: 'Different-reader, different-modality error covariance. Must satisfy varError ≥ cov1 ≥ cov2 ≥ cov3 ≥ 0.' },
      nReaders: { type: 'number', description: 'Number of readers J (≥ 2) — supply to compute power.' },
      targetPower: { type: 'number', description: 'Target power in (0,1) — supply instead of nReaders to solve for the minimum readers.' },
      maxReaders: { type: 'number', description: 'Upper search bound when solving for readers. Default 100.' },
      alpha: { type: 'number', description: 'Significance level. Default 0.05.' },
    },
    required: ['aucDifference', 'varTR', 'varError', 'cov1', 'cov2', 'cov3'],
  },
};

export const ANALYZE_EXTERNAL_CONTROL_BORROW: AnaTool = {
  name: 'analyze_external_control_borrow',
  description:
    "Normal power-prior borrowing from a historical/external control into a concurrent control: discount the historical precision by a0 ∈ [0,1] (1 = full pooling, 0 = no borrowing) and return the posterior control mean, posterior SE, effective historical N borrowed, and the fraction of posterior precision contributed by history. DETERMINISTIC. Use for hybrid/external-control designs (rare disease, single-arm augmentation). " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      meanC: { type: 'number', description: 'Concurrent control mean.' },
      seC: { type: 'number', description: 'Concurrent control standard error (> 0).' },
      nC: { type: 'number', description: 'Concurrent control sample size.' },
      meanH: { type: 'number', description: 'Historical control mean.' },
      seH: { type: 'number', description: 'Historical control standard error (> 0).' },
      nH: { type: 'number', description: 'Historical control sample size.' },
      a0: { type: 'number', description: 'Power-prior discount a0 ∈ [0,1].' },
    },
    required: ['meanC', 'seC', 'nC', 'meanH', 'seH', 'nH', 'a0'],
  },
};

export const ANALYZE_SAFETY_SIGNAL: AnaTool = {
  name: 'analyze_safety_signal',
  description:
    "Pharmacovigilance disproportionality analysis from a 2×2 contingency table (a/b/c/d counts): compute the Proportional Reporting Ratio (PRR) and Reporting Odds Ratio (ROR) with 95% CIs and the Yates-corrected chi-squared, and apply the standard EMA/MHRA signalling criterion (PRR ≥ 2 AND χ² ≥ 4 AND a ≥ 3). DETERMINISTIC. Use for spontaneous-report (FAERS/MAUDE) signal detection. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'Reports of the event for the product of interest.' },
      b: { type: 'number', description: 'Reports of other events for the product of interest.' },
      c: { type: 'number', description: 'Reports of the event for all other products.' },
      d: { type: 'number', description: 'Reports of other events for all other products.' },
    },
    required: ['a', 'b', 'c', 'd'],
  },
};

export const ADJUST_MULTIPLICITY: AnaTool = {
  name: 'adjust_multiplicity',
  description:
    "Apply a multiple-testing procedure to a set of observed p-values to control the family-wise error rate: Bonferroni, weighted-Bonferroni, Holm, Hochberg, fixed-sequence, or graphical (Bretz). DETERMINISTIC. Returns the reject/accept decision per hypothesis and the set of rejected hypotheses. Use whenever a study tests multiple primary/secondary endpoints under a defined testing strategy. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      pValues: { type: 'array', items: { type: 'number' }, description: 'Observed p-values (one per hypothesis), each in [0,1].' },
      alpha: { type: 'number', description: 'Family-wise alpha (0 < alpha < 1).' },
      procedure: { type: 'string', enum: ['bonferroni', 'weighted-bonferroni', 'holm', 'hochberg', 'fixed-sequence', 'graphical'], description: 'Multiplicity procedure.' },
      ids: { type: 'array', items: { type: 'string' }, description: 'Optional hypothesis ids, parallel to pValues (default H1..Hm).' },
      weights: { type: 'array', items: { type: 'number' }, description: 'Required for weighted-bonferroni and graphical: per-hypothesis weights.' },
      transitionMatrix: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Required for graphical: the m×m alpha-propagation transition matrix.' },
    },
    required: ['pValues', 'alpha', 'procedure'],
  },
};

// ── IVD / diagnostics / device batch (clinical-performance, diagnostic-design,
//    bayesian-device, analytical-performance engines) ─────────────────────────

export const COMPUTE_DIAGNOSTIC_ACCURACY: AnaTool = {
  name: 'compute_diagnostic_accuracy',
  description:
    "Compute diagnostic-test accuracy from a 2×2 confusion matrix (tp/fp/fn/tn vs the reference/comparator): sensitivity & specificity with exact Clopper-Pearson CIs, PPA/NPA, sample and prevalence-adjusted PPV/NPV, accuracy, Youden's J, positive/negative likelihood ratios, and Cohen's kappa. DETERMINISTIC. Use for IVD/companion-diagnostic clinical performance reporting. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      tp: { type: 'number', description: 'Test-positive AND reference-positive (true positives).' },
      fp: { type: 'number', description: 'Test-positive AND reference-negative (false positives).' },
      fn: { type: 'number', description: 'Test-negative AND reference-positive (false negatives).' },
      tn: { type: 'number', description: 'Test-negative AND reference-negative (true negatives).' },
      conf: { type: 'number', description: 'Confidence level for intervals. Default 0.95.' },
      prevalence: { type: 'number', description: 'Population prevalence (0–1) for prevalence-adjusted PPV/NPV. Omit to report only sample-based predictive values.' },
    },
    required: ['tp', 'fp', 'fn', 'tn'],
  },
};

export const SIZE_DIAGNOSTIC_STUDY: AnaTool = {
  name: 'size_diagnostic_study',
  description:
    "Sample-size a diagnostic study with EXACT binomial power. mode='single_proportion' sizes one performance metric (e.g. sensitivity) against a goal; mode='co_primary' sizes co-primary sensitivity AND specificity jointly given prevalence. DETERMINISTIC. Use for IVD/device performance study design. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['single_proportion', 'co_primary'], description: 'Which sizing to run.' },
      goal: { type: 'number', description: '[single_proportion] Null/threshold performance to exceed (0–1).' },
      expected: { type: 'number', description: '[single_proportion] Expected true performance under the alternative; must exceed goal.' },
      sensitivityGoal: { type: 'number', description: '[co_primary] Sensitivity threshold.' },
      sensitivityExpected: { type: 'number', description: '[co_primary] Expected sensitivity.' },
      specificityGoal: { type: 'number', description: '[co_primary] Specificity threshold.' },
      specificityExpected: { type: 'number', description: '[co_primary] Expected specificity.' },
      prevalence: { type: 'number', description: '[co_primary] Disease prevalence (0–1) to convert per-class N to total N.' },
      alpha: { type: 'number', description: 'One-sided type I error. Default 0.025.' },
      power: { type: 'number', description: 'Target power. Default 0.9.' },
      jointPowerTarget: { type: 'number', description: '[co_primary] Optional joint-power target across both endpoints.' },
      maxN: { type: 'number', description: 'Cap on the exact search. Default 5000.' },
    },
    required: ['mode'],
  },
};

export const DESIGN_BAYESIAN_DEVICE: AnaTool = {
  name: 'design_bayesian_device',
  description:
    "Size a single-arm device performance study with a Bayesian success rule (Beta prior): find the smallest n whose posterior-exceedance rule attains the target power at the expected rate while holding type I error at the goal. DETERMINISTIC (exact binomial). Use for device/diagnostic single-arm pivotal designs (e.g. 'P(performance > goal | data) ≥ successThreshold'). " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      goal: { type: 'number', description: 'Performance goal to exceed (0–1); type I error is held here.' },
      expected: { type: 'number', description: 'Expected (alternative) true rate; must exceed goal.' },
      successThreshold: { type: 'number', description: 'Posterior-probability threshold for declaring success (e.g. 0.95).' },
      targetPower: { type: 'number', description: 'Target power in (0,1).' },
      priorAlpha: { type: 'number', description: 'Beta prior alpha. Default uniform (1).' },
      priorBeta: { type: 'number', description: 'Beta prior beta. Default uniform (1).' },
      maxTypeI: { type: 'number', description: 'Optional cap on the one-sided type I error.' },
      maxN: { type: 'number', description: 'Upper search bound. Default 5000.' },
    },
    required: ['goal', 'expected', 'successThreshold', 'targetPower'],
  },
};

export const COMPUTE_ANALYTICAL_PERFORMANCE: AnaTool = {
  name: 'compute_analytical_performance',
  description:
    "IVD analytical method validation (CLSI-style), DETERMINISTIC. mode='imprecision': repeatability/within-lab SD & CV from a balanced runs×replicates design (EP05). mode='detection_capability': LoB/LoD (and LoQ) from blank + low-concentration replicates (EP17). mode='method_comparison': bias/regression of a candidate vs comparator method, optionally at a medical-decision level (EP09). Use for IVD analytical performance sections. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['imprecision', 'detection_capability', 'method_comparison'], description: 'Which analytical computation to run.' },
      runs: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '[imprecision] One inner array of replicate measurements per run; all runs share the same replicate count.' },
      blankReplicates: { type: 'array', items: { type: 'number' }, description: '[detection_capability] Replicate measurements of analyte-free (blank) samples.' },
      lowSamples: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '[detection_capability] One inner array of replicates per low-concentration sample near the LoD.' },
      falsePositiveRate: { type: 'number', description: '[detection_capability] False-positive rate governing LoB. Default 0.05.' },
      reference: { type: 'array', items: { type: 'number' }, description: '[method_comparison] Comparator measurements.' },
      test: { type: 'array', items: { type: 'number' }, description: '[method_comparison] Candidate measurements, paired with reference.' },
      decisionLevel: { type: 'number', description: '[method_comparison] Optional medical-decision level at which to report systematic bias.' },
    },
    required: ['mode'],
  },
};

// ── Operational forecasting (seeded Monte-Carlo, reproducible by seed) ────────

export const FORECAST_ENROLLMENT: AnaTool = {
  name: 'forecast_enrollment',
  description:
    "Forecast trial enrollment completion under a Poisson-Gamma multi-site accrual model: given per-site mean rates (with optional over-dispersion and activation times) and a target N, return the expected/median time to reach N, the 10th/90th-percentile times, and the probability of reaching N. Seeded Monte-Carlo — REPRODUCIBLE for a given seed. Use for accrual feasibility and timeline planning. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      sites: {
        type: 'array',
        description: 'Per-site accrual configuration.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional site id.' },
            meanRate: { type: 'number', description: 'Mean recruitment rate (patients per unit time) once active.' },
            rateCv: { type: 'number', description: 'Coefficient of variation of the site rate (0 = pure Poisson, no over-dispersion).' },
            activationTime: { type: 'number', description: 'Calendar time the site begins recruiting. Default 0.' },
          },
          required: ['meanRate'],
        },
      },
      targetN: { type: 'number', description: 'Target enrollment (positive integer).' },
      nSim: { type: 'number', description: 'Monte-Carlo replications. Default 4000.' },
      seed: { type: 'number', description: 'Optional seed for reproducibility (otherwise derived from inputs).' },
    },
    required: ['sites', 'targetN'],
  },
};

export const PROJECT_EVENTS: AnaTool = {
  name: 'project_events',
  description:
    "Project the calendar time to accrue a target number of events in a time-to-event trial: uniform accrual (rate × period), exponential event times per arm (from control median + hazard ratio), optional exponential dropout. Returns the expected/median and 10th/90th-percentile times to reach the target events. Seeded Monte-Carlo — REPRODUCIBLE for a given seed. Use for event-driven analysis timing (interim/final). " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      accrualRate: { type: 'number', description: 'Patients accrued per unit time (uniform accrual).' },
      accrualPeriod: { type: 'number', description: 'Duration of accrual.' },
      medianControl: { type: 'number', description: 'Median time-to-event in the control arm (> 0).' },
      hazardRatio: { type: 'number', description: 'Hazard ratio (treatment vs control).' },
      targetEvents: { type: 'number', description: 'Target number of events (positive integer).' },
      allocationRatio: { type: 'number', description: 'Treatment:control allocation ratio. Default 1.' },
      dropoutHazard: { type: 'number', description: 'Exponential dropout hazard per unit time. Default 0.' },
      nSim: { type: 'number', description: 'Monte-Carlo replications. Default 2000.' },
      seed: { type: 'number', description: 'Optional seed for reproducibility.' },
    },
    required: ['accrualRate', 'accrualPeriod', 'medianControl', 'hazardRatio', 'targetEvents'],
  },
};

/** All statistical-design & analysis tools, spread into ALL_ANA_TOOLS. */
export const STATISTICAL_DESIGN_TOOLS: AnaTool[] = [
  DESIGN_MMRM,
  DESIGN_GROUP_SEQUENTIAL,
  DESIGN_DOSE_FINDING,
  ANALYZE_WIN_RATIO,
  ANALYZE_RMST,
  DESIGN_MRMC_READER_STUDY,
  ANALYZE_EXTERNAL_CONTROL_BORROW,
  ANALYZE_SAFETY_SIGNAL,
  ADJUST_MULTIPLICITY,
  COMPUTE_DIAGNOSTIC_ACCURACY,
  SIZE_DIAGNOSTIC_STUDY,
  DESIGN_BAYESIAN_DEVICE,
  COMPUTE_ANALYTICAL_PERFORMANCE,
  FORECAST_ENROLLMENT,
  PROJECT_EVENTS,
];
