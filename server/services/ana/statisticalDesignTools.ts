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
 *   compute_assurance            — Bayesian assurance / probability of success (assurance.ts)
 *   assess_ivd_analytical_extensions — EP25/Arrhenius/EP10/EP06/EP07/Youden extensions (analytical-performance-extensions.ts)
 *   run_monte_carlo_simulation   — seeded MC: diagnostic accuracy / time-to-market / review outcome (monte-carlo.ts)
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

export const SCREEN_SIGNAL_PANEL: AnaTool = {
  name: 'screen_signal_panel',
  description:
    "Multi-method pharmacovigilance signal screen from a 2×2 contingency table (a/b/c/d counts): runs the frequentist PRR/ROR/χ² criterion AND the two Bayesian shrinkage methods — BCPNN Information Component (WHO-UMC; signal when the lower 95% bound IC025 > 0) and gamma-Poisson EBGM (FDA/MGPS family; signal when EB05 ≥ 2) — then consolidates them into a single priority tier (strong = all 3 concur, moderate = 2, weak = 1, none = 0) with explicit divergence notes. Prefer this over analyze_safety_signal when you want a robust, small-count-aware verdict: the Bayesian methods suppress the coincidental co-reports that inflate raw PRR at low counts. EBGM here uses a fixed single-table prior (α=β=0.5), not a database-wide MGPS fit. DETERMINISTIC. " +
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

export const COMPUTE_ASSURANCE: AnaTool = {
  name: 'compute_assurance',
  description:
    "Compute Bayesian assurance (unconditional probability of trial success) for a two-sample means design with a normal prior on the standardized effect δ: assurance = ∫ power(δ)·π(δ) dδ (O'Hagan-Stevens-Campbell). Unlike power (conditional on one assumed effect), assurance averages power over genuine effect-size uncertainty and is bounded well away from 1 for a diffuse prior. method='quadrature' (default) is DETERMINISTIC Gaussian quadrature over the prior grid; method='monte_carlo' is the seeded simulation the quadrature is validated against. Also returns the naive design power at the prior mean for comparison. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      priorMean: { type: 'number', description: 'Prior mean of the standardized effect δ = (μ₁−μ₀)/σ.' },
      priorSd: { type: 'number', description: 'Prior SD of δ (effect-size uncertainty). 0 ⇒ assurance equals power at the prior mean.' },
      nPerArm: { type: 'number', description: 'Subjects per arm (> 0, equal allocation).' },
      alpha: { type: 'number', description: 'Type I error level. Default 0.025.' },
      oneSided: { type: 'boolean', description: 'One-sided test. Default true.' },
      nNodes: { type: 'number', description: '[quadrature] Number of prior grid nodes. Default 33.' },
      method: { type: 'string', enum: ['quadrature', 'monte_carlo'], description: "Estimation path. Default 'quadrature' (deterministic). 'monte_carlo' is the seeded validation simulation." },
      nSim: { type: 'number', description: '[monte_carlo] Number of simulations. Default 200000.' },
      seed: { type: 'number', description: '[monte_carlo] Optional seed for reproducibility (otherwise derived from inputs).' },
    },
    required: ['priorMean', 'priorSd', 'nPerArm'],
  },
};

export const RUN_MONTE_CARLO_SIMULATION: AnaTool = {
  name: 'run_monte_carlo_simulation',
  description:
    "Seeded (reproducible) Monte-Carlo simulation that turns point estimates into distributions with credible/prediction intervals. mode='diagnostic_accuracy': Beta-posterior (Jeffreys) credible intervals for sensitivity/specificity/PPV/NPV from a 2×2 table. mode='time_to_market': triangular per-study, parallel-within-phase calendar-time forecast for a multi-phase program (P50/P90 weeks). mode='review_outcome': propagate per-element evidence-completion probabilities through the deterministic IVD reviewer engine into a distribution of likely review verdicts and readiness scores. Seeded Monte-Carlo — REPRODUCIBLE for a given seed. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['diagnostic_accuracy', 'time_to_market', 'review_outcome'], description: 'Which Monte-Carlo simulation to run.' },
      // diagnostic_accuracy
      tp: { type: 'number', description: '[diagnostic_accuracy] True positives (non-negative integer).' },
      fp: { type: 'number', description: '[diagnostic_accuracy] False positives (non-negative integer).' },
      fn: { type: 'number', description: '[diagnostic_accuracy] False negatives (non-negative integer).' },
      tn: { type: 'number', description: '[diagnostic_accuracy] True negatives (non-negative integer).' },
      // time_to_market
      phases: {
        type: 'array',
        description: '[time_to_market] Sequenced phases; studies within a phase run in parallel.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Phase name.' },
            studyWeeks: { type: 'array', items: { type: 'number' }, description: 'Mode (most-likely) duration in weeks for each study in the phase.' },
          },
          required: ['name', 'studyWeeks'],
        },
      },
      slipFactor: { type: 'number', description: '[time_to_market] Upside risk factor on the mode estimate (e.g. 0.6 → up to 1.6× slippage). Default 0.5.' },
      // review_outcome
      profile: {
        type: 'object',
        description: '[review_outcome] The IVD review profile (without evidence).',
        properties: {
          pathway: { type: 'string', enum: ['510k', 'de_novo', 'pma', 'eu_ivdr'], description: 'Regulatory pathway.' },
          assayType: { type: 'string', enum: ['quantitative', 'qualitative', 'ihc', 'ngs', 'molecular'], description: 'Assay type.' },
          intendedUse: { type: 'string', enum: ['cdx', 'screening', 'diagnosis', 'monitoring', 'aid_to_diagnosis'], description: 'Intended use.' },
          biomarker: { type: 'string', description: 'Optional biomarker name.' },
          hasSoftware: { type: 'boolean', description: 'Whether the device includes software.' },
        },
        required: ['pathway', 'assayType', 'intendedUse'],
      },
      evidenceProbabilities: {
        type: 'object',
        description: '[review_outcome] Per-evidence-element probability (0–1) of being complete by submission, keyed by evidence element (e.g. analyticalPrecision, detectionCapability, stability, clinicalPerformance).',
        additionalProperties: { type: 'number' },
      },
      iterations: { type: 'number', description: 'Monte-Carlo iterations (engine-clamped per mode). Optional.' },
      seed: { type: 'number', description: 'Optional seed for reproducibility (otherwise the engine default).' },
    },
    required: ['mode'],
  },
};

export const ASSESS_IVD_ANALYTICAL_EXTENSIONS: AnaTool = {
  name: 'assess_ivd_analytical_extensions',
  description:
    "Extended IVD analytical-performance studies the core engine does not cover, all DETERMINISTIC (CLSI-style). mode='real_time_stability' (EP25): shelf-life from a value-vs-time series and a spec limit. mode='accelerated_stability' (Arrhenius): predicted real-time shelf-life and activation energy from elevated-temperature rate constants. mode='carryover' (EP10): carryover percent from a high→low run sequence vs an acceptance limit. mode='hook_effect': high-dose hook (prozone) detection from a concentration–signal series. mode='recovery' (EP06/EP07): spike-recovery / dilution-linearity recovery vs an acceptance band. mode='cutoff': clinical decision point by maximizing the Youden index over a labelled score set. " +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['real_time_stability', 'accelerated_stability', 'carryover', 'hook_effect', 'recovery', 'cutoff'], description: 'Which analytical-extension study to run.' },
      // real_time_stability
      points: {
        type: 'array',
        description: "[real_time_stability] {time,value} series. [accelerated_stability] {temperatureC,rateConstant} series. [recovery] {expected,observed} series. Field set depends on mode.",
        items: { type: 'object', additionalProperties: { type: 'number' } },
      },
      initialValue: { type: 'number', description: '[real_time_stability] Optional t=0 reference value (defaults to the regression intercept).' },
      maxPercentChange: { type: 'number', description: '[real_time_stability] Max acceptable percent change before out-of-spec (e.g. 10 for ±10%).' },
      // accelerated_stability
      storageTemperatureC: { type: 'number', description: '[accelerated_stability] Intended real-time storage temperature in Celsius (e.g. 4, 25).' },
      degradationThreshold: { type: 'number', description: '[accelerated_stability] Degradation fraction defining end of shelf-life (0–1, e.g. 0.1).' },
      // carryover
      lowAfterHigh: { type: 'array', items: { type: 'number' }, description: '[carryover] Replicates of the low sample run immediately after a high-concentration sample.' },
      lowBaseline: { type: 'array', items: { type: 'number' }, description: '[carryover] Replicates of the low sample run in a clean sequence.' },
      highSample: { type: 'array', items: { type: 'number' }, description: '[carryover] Replicates of the high-concentration sample.' },
      acceptanceLimitPct: { type: 'number', description: '[carryover] Acceptance limit for carryover percent. Default 1.' },
      // hook_effect
      series: {
        type: 'array',
        description: '[hook_effect] Concentration–signal series (≥ 3 points).',
        items: { type: 'object', properties: { concentration: { type: 'number' }, signal: { type: 'number' } }, required: ['concentration', 'signal'] },
      },
      dropThreshold: { type: 'number', description: '[hook_effect] Fractional drop from the peak that flags a hook. Default 0.05.' },
      // recovery
      recoveryBandPct: { type: 'array', items: { type: 'number' }, description: '[recovery] Acceptable recovery band [low, high] percent. Default [80, 120].' },
      // cutoff
      observations: {
        type: 'array',
        description: '[cutoff] Labelled scores: each {score, positive} where positive=true marks the diseased/positive reference state. Higher scores assumed to indicate disease.',
        items: { type: 'object', properties: { score: { type: 'number' }, positive: { type: 'boolean' } }, required: ['score', 'positive'] },
      },
    },
    required: ['mode'],
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
  SCREEN_SIGNAL_PANEL,
  ADJUST_MULTIPLICITY,
  COMPUTE_DIAGNOSTIC_ACCURACY,
  SIZE_DIAGNOSTIC_STUDY,
  DESIGN_BAYESIAN_DEVICE,
  COMPUTE_ANALYTICAL_PERFORMANCE,
  ASSESS_IVD_ANALYTICAL_EXTENSIONS,
  COMPUTE_ASSURANCE,
  FORECAST_ENROLLMENT,
  PROJECT_EVENTS,
  RUN_MONTE_CARLO_SIMULATION,
];
