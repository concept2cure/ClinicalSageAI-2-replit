/**
 * Study-design gates — the deterministic checks a design must pass before it can
 * advance (module spec §2 estimands, §3 endpoint architecture, §4 design framework,
 * §6 sample size / power red-flags, §7 schedule of activities).
 *
 * Each gate is a pure function over the {@link StudyDesign} object that returns
 * {@link DesignFinding}s. Nothing here calls a DB, a clock, an RNG or an LLM, so the
 * same design always yields the same findings — they are reproducible and
 * unit-testable, and they never fabricate a value to make a design look better than
 * it is. The estimand bar is the exact bar the SAP renderer uses (one shared source
 * of truth in `estimand-sap-section.ts`).
 *
 * Severity contract:
 *   - `critical` blocks design approval outright (e.g. NI without a margin).
 *   - `major`    is a reviewer-likely deficiency; blocks `qc → approved`.
 *   - `minor`    is a defensibility weakness worth addressing.
 *   - `info`     is advisory.
 *
 * @module server/services/study-design/design-gates
 */

import { assessEstimandCompleteness } from '../estimand-sap-section';
import { analyzeScheduleOfActivities } from './schedule-of-activities';
import {
  type StudyDesign,
  type Endpoint,
  ESTIMAND_REQUIRED_ROLES,
} from './study-design-types';

export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface DesignFinding {
  /** Stable code, e.g. 'EST-001'. Stable so the UI and audit can key on it. */
  code: string;
  /** Module-spec section the finding comes from, e.g. '§2 Estimands'. */
  section: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** The standard the finding rests on, e.g. 'ICH E9(R1)'. */
  standard?: string;
  /** The endpoint the finding concerns, when endpoint-scoped. */
  endpointName?: string;
  /** What to do about it. */
  suggestedFix?: string;
}

// ─── §2 · Estimand gate ──────────────────────────────────────────────────────

/**
 * Every primary and key-secondary endpoint must carry a complete ICH E9(R1)
 * estimand. A required endpoint with no estimand is Critical (the primary
 * inference is undefined); a required endpoint whose estimand is structurally
 * incomplete is Major. Estimands are matched to endpoints by name.
 */
export function estimandGate(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const estimandsByEndpoint = new Map(
    (design.estimands ?? []).map(e => [e.endpointName, e] as const),
  );

  for (const endpoint of design.endpoints ?? []) {
    if (!ESTIMAND_REQUIRED_ROLES.includes(endpoint.role)) continue;

    const estimand = estimandsByEndpoint.get(endpoint.name);
    if (!estimand) {
      findings.push({
        code: 'EST-001',
        section: '§2 Estimands',
        severity: endpoint.role === 'primary' ? 'critical' : 'major',
        standard: 'ICH E9(R1)',
        endpointName: endpoint.name,
        title: `No estimand for ${endpoint.role.replace('_', ' ')} endpoint`,
        detail:
          `Endpoint "${endpoint.name}" has no estimand. Per ICH E9(R1) every ` +
          'objective must be expressed as an estimand before the analysis is finalized.',
        suggestedFix:
          'Define the estimand: treatment condition, population, variable, ' +
          'intercurrent-event strategy, and population-level summary measure.',
      });
      continue;
    }

    const completeness = assessEstimandCompleteness(estimand);
    if (!completeness.complete) {
      findings.push({
        code: 'EST-002',
        section: '§2 Estimands',
        severity: 'major',
        standard: 'ICH E9(R1)',
        endpointName: endpoint.name,
        title: `Incomplete estimand (${completeness.attributesSpecified}/5 attributes)`,
        detail:
          `Estimand for "${endpoint.name}" is missing: ${completeness.missing.join(', ')}.`,
        suggestedFix: 'Specify the missing estimand attribute(s) before finalization.',
      });
    }
    // Defensibility warnings (e.g. a strategy without a rationale) are reported as
    // minor so they surface without blocking a structurally complete estimand.
    for (const warning of completeness.warnings) {
      findings.push({
        code: 'EST-003',
        section: '§2 Estimands',
        severity: 'minor',
        standard: 'ICH E9(R1)',
        endpointName: endpoint.name,
        title: 'Estimand defensibility warning',
        detail: warning,
      });
    }
  }

  return findings;
}

// ─── §3 · Endpoint architecture red-flags ────────────────────────────────────

/**
 * Structural red-flags on the endpoint set: surrogate without agreement,
 * time-to-event without an event definition, PRO without a validated instrument,
 * heterogeneous composite, and more than one primary endpoint without justification.
 */
export function endpointRedFlags(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const endpoints = design.endpoints ?? [];

  for (const e of endpoints) {
    findings.push(...endpointRedFlagsForOne(e));
  }

  // More than one primary endpoint (co-primary / multiple-primary) needs justification.
  const primaries = endpoints.filter(e => e.role === 'primary');
  if (primaries.length > 1) {
    findings.push({
      code: 'EPT-005',
      section: '§3 Endpoints',
      severity: 'major',
      endpointName: primaries.map(e => e.name).join(', '),
      title: `${primaries.length} primary endpoints`,
      detail:
        'More than one primary endpoint (co-primary or multiple-primary) requires ' +
        'an explicit multiplicity/power justification.',
      suggestedFix:
        'Prefer a single primary endpoint, or justify co-primaries and account for ' +
        'them in the multiplicity strategy and sample size.',
    });
  } else if (primaries.length === 0) {
    findings.push({
      code: 'EPT-006',
      section: '§3 Endpoints',
      severity: 'critical',
      title: 'No primary endpoint',
      detail: 'The design declares no primary endpoint.',
      suggestedFix: 'Designate exactly one primary endpoint.',
    });
  }

  return findings;
}

function endpointRedFlagsForOne(e: Endpoint): DesignFinding[] {
  const findings: DesignFinding[] = [];

  if (e.isSurrogate && e.regulatoryAcceptance !== 'accepted_precedent') {
    findings.push({
      code: 'EPT-001',
      section: '§3 Endpoints',
      severity: e.role === 'primary' ? 'major' : 'minor',
      endpointName: e.name,
      title: 'Surrogate endpoint without accepted precedent',
      detail:
        `"${e.name}" is a surrogate and is not marked as accepted precedent for this ` +
        'indication/agency. Surrogates generally require agency agreement or qualification.',
      suggestedFix:
        'Confirm regulatory acceptance of the surrogate (precedent or qualification), ' +
        'or pair it with a clinical endpoint.',
    });
  }

  if (e.type === 'time_to_event' && !nonEmpty(e.eventDefinition)) {
    findings.push({
      code: 'EPT-002',
      section: '§3 Endpoints',
      severity: 'major',
      endpointName: e.name,
      title: 'Time-to-event endpoint without an event definition',
      detail: `"${e.name}" is time-to-event but no event definition is specified.`,
      suggestedFix: 'Define the event precisely (what counts, how adjudicated, censoring rules).',
    });
  }

  if (e.type === 'patient_reported' && !nonEmpty(e.validatedInstrument)) {
    findings.push({
      code: 'EPT-003',
      section: '§3 Endpoints',
      severity: 'major',
      endpointName: e.name,
      title: 'Patient-reported endpoint without a validated instrument',
      detail:
        `"${e.name}" is patient-reported but no instrument validated for this population ` +
        'is named.',
      suggestedFix: 'Name a fit-for-purpose, validated PRO instrument for the population.',
    });
  }

  if (e.type === 'composite') {
    const components = e.compositeComponents ?? [];
    if (components.length < 2) {
      findings.push({
        code: 'EPT-004',
        section: '§3 Endpoints',
        severity: 'minor',
        endpointName: e.name,
        title: 'Composite endpoint without enumerated components',
        detail: `"${e.name}" is composite but its components are not enumerated.`,
        suggestedFix:
          'List the components and confirm they are of comparable clinical importance ' +
          'and expected direction (avoid heterogeneous composites).',
      });
    }
  }

  return findings;
}

// ─── §4 · Design framework rules ─────────────────────────────────────────────

/**
 * Inferential-frame and control-choice obligations (ICH E9 / E10). Non-inferiority
 * and equivalence require a justified margin; external/historical controls require an
 * E10 justification; non-inferiority makes per-protocol a (co-)primary analysis set.
 */
export function frameworkRules(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const f = design.framework;
  if (!f) {
    return [
      {
        code: 'FRM-000',
        section: '§4 Design framework',
        severity: 'critical',
        title: 'No design framework specified',
        detail: 'The inferential frame, structural design and control type are not specified.',
        suggestedFix: 'Specify the inferential frame, structural design and control type.',
      },
    ];
  }

  const needsMargin = f.inferentialFrame === 'non_inferiority' || f.inferentialFrame === 'equivalence';
  if (needsMargin && !(typeof f.margin === 'number' && f.margin > 0)) {
    findings.push({
      code: 'FRM-001',
      section: '§4 Design framework',
      severity: 'critical',
      standard: 'ICH E9 / E10',
      title: `${frameLabel(f.inferentialFrame)} design without a margin`,
      detail:
        `A ${frameLabel(f.inferentialFrame)} design requires a pre-specified, justified ` +
        'margin. None is set.',
      suggestedFix: 'Set the margin and justify it (clinical and statistical basis).',
    });
  } else if (needsMargin && !nonEmpty(f.marginJustification)) {
    findings.push({
      code: 'FRM-002',
      section: '§4 Design framework',
      severity: 'major',
      standard: 'ICH E9 / E10',
      title: `${frameLabel(f.inferentialFrame)} margin without justification`,
      detail: 'A margin is set but not justified.',
      suggestedFix: 'Document the clinical and statistical basis for the margin.',
    });
  }

  // Non-inferiority: per-protocol should be a (co-)primary analysis set (§5).
  if (f.inferentialFrame === 'non_inferiority') {
    const hasPpPrimary = (design.population?.analysisPopulations ?? []).some(
      p => p.kind === 'PP' && p.isPrimaryAnalysisSet,
    );
    if (!hasPpPrimary) {
      findings.push({
        code: 'FRM-003',
        section: '§4 Design framework',
        severity: 'major',
        standard: 'ICH E9',
        title: 'Non-inferiority without per-protocol as a (co-)primary analysis set',
        detail:
          'For non-inferiority, the per-protocol population is normally (co-)primary ' +
          'alongside ITT, because ITT is anti-conservative for NI.',
        suggestedFix: 'Mark the per-protocol population as a (co-)primary analysis set.',
      });
    }
  }

  // External / historical control needs an ICH E10 justification.
  if ((f.controlType === 'external' || f.controlType === 'historical') && !nonEmpty(f.controlJustification)) {
    findings.push({
      code: 'FRM-004',
      section: '§4 Design framework',
      severity: 'major',
      standard: 'ICH E10',
      title: `${f.controlType} control without an ICH E10 justification`,
      detail:
        `An ${f.controlType} control is used without a documented ICH E10 rationale ` +
        '(why a concurrent control is not feasible, and how bias is addressed).',
      suggestedFix: 'Document the E10 rationale and the bias-control strategy.',
    });
  }

  // Single-arm without an external/historical comparator is rarely confirmatory.
  if (f.structuralDesign === 'single_arm' && f.controlType === 'none') {
    findings.push({
      code: 'FRM-005',
      section: '§4 Design framework',
      severity: design.phase === '3' || design.phase === '3b' ? 'major' : 'minor',
      standard: 'ICH E10',
      title: 'Single-arm design with no control',
      detail:
        'A single-arm design with no external/historical control limits causal ' +
        'interpretation; for confirmatory phases this is a reviewer concern.',
      suggestedFix:
        'Add an external/historical control with an E10 justification, or document why a ' +
        'single-arm design is acceptable for this indication and phase.',
    });
  }

  return findings;
}

// ─── §6 · Sample size / power red-flags ──────────────────────────────────────

/**
 * Power and sample-size red-flags that do not require recomputation: missing power
 * target, single-point estimates without sensitivity analyses, an assumed effect
 * larger than the prior phase actually observed (optimism bias), and an assumed
 * dropout below the historical rate.
 */
export function powerRedFlags(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const sp = design.statisticalPlan;
  if (!sp) {
    return [
      {
        code: 'PWR-000',
        section: '§6 Sample size & power',
        severity: 'major',
        title: 'No statistical plan',
        detail: 'The design carries no statistical plan (alpha, power, sample size).',
        suggestedFix: 'Specify alpha, target power, and the planned sample size with provenance.',
      },
    ];
  }

  if (typeof sp.power !== 'number') {
    findings.push({
      code: 'PWR-001',
      section: '§6 Sample size & power',
      severity: 'major',
      title: 'No target power specified',
      detail: 'The design does not state a target power.',
      suggestedFix: 'State target power (≥80% standard, ≥90% for confirmatory).',
    });
  } else if (sp.power < 0.8) {
    findings.push({
      code: 'PWR-002',
      section: '§6 Sample size & power',
      severity: 'major',
      title: `Underpowered (target power ${(sp.power * 100).toFixed(0)}%)`,
      detail: 'Target power is below the conventional 80% floor.',
      suggestedFix: 'Raise power to ≥80% (≥90% confirmatory) or justify the lower target.',
    });
  }

  if (!sp.sensitivityAnalysesSpecified) {
    findings.push({
      code: 'PWR-003',
      section: '§6 Sample size & power',
      severity: 'minor',
      title: 'No sensitivity analysis across assumptions',
      detail:
        'Sample size rests on point assumptions with no sensitivity analysis across ' +
        'plausible ranges. A single-point estimate is a reviewer red-flag.',
      suggestedFix: 'Add a sensitivity analysis across effect-size and dropout ranges.',
    });
  }

  const pa = sp.powerAssumptions;
  if (pa) {
    if (
      typeof pa.effectSize === 'number' &&
      typeof pa.priorPhaseObservedEffect === 'number' &&
      pa.effectSize > pa.priorPhaseObservedEffect
    ) {
      findings.push({
        code: 'PWR-004',
        section: '§6 Sample size & power',
        severity: 'major',
        title: 'Assumed effect exceeds prior-phase observed (optimism bias)',
        detail:
          `Assumed effect size (${pa.effectSize}) is larger than the prior phase actually ` +
          `observed (${pa.priorPhaseObservedEffect}). Powering on an optimistic effect ` +
          'inflates the chance of an underpowered trial.',
        suggestedFix: 'Power on the observed (or a conservative) effect size, or justify the uplift.',
      });
    }
    if (
      typeof sp.dropoutRate === 'number' &&
      typeof pa.historicalDropoutRate === 'number' &&
      sp.dropoutRate < pa.historicalDropoutRate
    ) {
      findings.push({
        code: 'PWR-005',
        section: '§6 Sample size & power',
        severity: 'minor',
        title: 'Assumed dropout below historical',
        detail:
          `Assumed dropout (${pct(sp.dropoutRate)}) is below the historical rate ` +
          `(${pct(pa.historicalDropoutRate)}); an optimistic dropout under-sizes the trial.`,
        suggestedFix: 'Use the historical dropout (or higher) and inflate the sample size accordingly.',
      });
    }
    const hasProvenance = Array.isArray(pa.evidence) && pa.evidence.length > 0;
    if (typeof pa.effectSize === 'number' && !hasProvenance) {
      findings.push({
        code: 'PWR-006',
        section: '§6 Sample size & power',
        severity: 'minor',
        title: 'Effect-size assumption without provenance',
        detail: 'The assumed effect size carries no evidence reference (prior data vs assumption).',
        suggestedFix: 'Attach the provenance of the effect-size assumption.',
      });
    }
  }

  return findings;
}

// ─── §10 / §17 · Multiplicity control ────────────────────────────────────────

/**
 * When the design tests more than one confirmatory hypothesis (a primary plus key
 * secondaries, or co-primaries), a multiplicity strategy must be in place or the
 * family-wise type-I error is uncontrolled. Per spec §17 this is Critical.
 */
export function multiplicityGate(design: StudyDesign): DesignFinding[] {
  const endpoints = design.endpoints ?? [];
  const confirmatory = endpoints.filter(e => e.role === 'primary' || e.role === 'key_secondary');
  const hasHierarchy = confirmatory.length > 1;
  const method = design.statisticalPlan?.multiplicity?.method;

  if (hasHierarchy && (!method || method === 'none')) {
    return [
      {
        code: 'MUL-001',
        section: '§10 Statistical plan',
        severity: 'critical',
        standard: 'ICH E9',
        title: 'No multiplicity control for the testing hierarchy',
        detail:
          `The design tests ${confirmatory.length} confirmatory hypotheses without a ` +
          'multiplicity strategy, leaving the family-wise type-I error uncontrolled.',
        suggestedFix:
          'Specify a multiplicity strategy (fixed-sequence, gatekeeping, Holm/Hochberg, ' +
          'graphical, or alpha-spending) with an explicit alpha allocation.',
      },
    ];
  }
  return [];
}

// ─── §7 · Schedule of Activities ─────────────────────────────────────────────

/**
 * Structural integrity and endpoint coverage of the Schedule of Activities. The
 * substantive check is whether the schedule actually collects every confirmatory
 * endpoint; the rest guard the grid's referential integrity and its baseline anchor.
 * The detail logic lives in `schedule-of-activities.ts` (one source of truth the SoA
 * projection shares); this gate adapts its issues to the finding shape.
 */
export function scheduleOfActivitiesGate(design: StudyDesign): DesignFinding[] {
  return analyzeScheduleOfActivities(design).map(issue => ({
    code: issue.code,
    section: '§7 Schedule of Activities',
    severity: issue.severity,
    standard: 'ICH M11',
    title: issue.title,
    detail: issue.detail,
    suggestedFix: issue.suggestedFix,
    endpointName: issue.endpointName,
  }));
}

// ─── §9 · Analysis populations ───────────────────────────────────────────────

/**
 * Population definitions decide which patients the primary inference is about.
 * A superiority trial whose primary analysis set is per-protocol is analysed on
 * a self-selected subset (FDA default is ITT); a plan with no primary analysis
 * set leaves the primary inference undefined; a trial with no safety
 * population has nowhere to put its adverse events. Non-inferiority's need for
 * a PP co-primary is FRM-003 and is not repeated here.
 */
export function populationGate(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const sets = design.population?.analysisPopulations ?? [];
  if (sets.length === 0) {
    findings.push({
      code: 'POP-001',
      section: '§9 Analysis populations',
      severity: 'major',
      standard: 'ICH E9 §5.2',
      title: 'No analysis populations defined',
      detail: 'The design declares no analysis population, so the primary analysis has no defined analysis set.',
      suggestedFix: 'Define ITT (or the frame-appropriate primary set), per-protocol and safety populations, and mark the primary set.',
    });
    return findings;
  }
  const primary = sets.filter(p => p.isPrimaryAnalysisSet);
  if (primary.length === 0) {
    findings.push({
      code: 'POP-002',
      section: '§9 Analysis populations',
      severity: 'major',
      standard: 'ICH E9 §5.2',
      title: 'No analysis population marked primary',
      detail: `${sets.length} population(s) are defined but none is marked as the primary analysis set.`,
      suggestedFix: 'Mark the primary analysis set (ITT for superiority; ITT and PP co-primary for non-inferiority).',
    });
  }
  const frame = design.framework?.inferentialFrame;
  if (frame === 'superiority' && primary.length > 0 && primary.every(p => p.kind === 'PP')) {
    findings.push({
      code: 'POP-003',
      section: '§9 Analysis populations',
      severity: 'major',
      standard: 'ICH E9 §5.2.3',
      title: 'Superiority primary analysis on the per-protocol set',
      detail:
        'The only primary analysis set is per-protocol. In a superiority trial the per-protocol set is a ' +
        'self-selected subset and the primary analysis is expected on all randomised patients (ITT).',
      suggestedFix: 'Make ITT the primary analysis set and keep per-protocol as a supportive analysis.',
    });
  }
  if (!sets.some(p => p.kind === 'Safety')) {
    findings.push({
      code: 'POP-004',
      section: '§9 Analysis populations',
      severity: 'minor',
      standard: 'ICH E3 §11.4',
      title: 'No safety population defined',
      detail: 'Safety analyses are reported on all patients who received study treatment, as treated; no such set is declared.',
      suggestedFix: 'Add a Safety population: all patients who received at least one dose, analysed as treated.',
    });
  }
  return findings;
}

// ─── §11 · Method–endpoint matching ──────────────────────────────────────────

type MethodFamily = 'time_to_event' | 'continuous' | 'binary' | 'ordinal' | 'count' | 'unknown';

/** Classify a free-text analysis method into the family it is fit for. */
export function classifyAnalysisMethod(method: string): MethodFamily {
  const m = method.toLowerCase();
  // The named TEST decides the family, not the data it is described as being
  // run on: "t-test on median survival" is a t-test, which is the mismatch
  // this gate exists to catch, so the explicit test names are matched first.
  if (/t[- ]?test|\bancova\b|\banova\b|\bmmrm\b|mixed[- ]model|least squares|wilcoxon|mann[- ]whitney/.test(m)) return 'continuous';
  if (/cox|kaplan|\bkm\b|log[- ]?rank|rmst|weibull|accelerated failure|competing risk|fine[- ]gray/.test(m)) return 'time_to_event';
  if (/proportional odds|ordinal|van elteren|cumulative logit/.test(m)) return 'ordinal';
  if (/negative binomial|poisson|andersen|lwyy|rate ratio|recurrent/.test(m)) return 'count';
  if (/logistic|cmh|cochran|mantel|fisher|chi[- ]?square|risk difference|odds ratio|relative risk|exact test/.test(m)) return 'binary';
  if (/\bgee\b|linear|repeated/.test(m)) return 'continuous';
  return 'unknown';
}

/** Endpoint type → the method families that fit it (ICH E9 §5.4; skill §IV table). */
const FIT_FOR_ENDPOINT: Record<string, MethodFamily[]> = {
  time_to_event: ['time_to_event'],
  continuous: ['continuous'],
  patient_reported: ['continuous', 'ordinal'],
  binary: ['binary'],
  ordinal: ['ordinal', 'continuous'], // Wilcoxon / Mann-Whitney classify as continuous and are fit for ordinal data
  count: ['count'],
  composite: ['time_to_event', 'binary', 'continuous', 'ordinal', 'count'],
};

/**
 * The planned analysis must fit the endpoint it analyses. A t-test on median
 * survival, an ANOVA on a responder rate or a chi-square on an ordinal scale
 * is not a stylistic choice — it is the wrong inference. Applies to primary
 * and key-secondary endpoints; a required endpoint with no planned analysis
 * at all is a gap of its own.
 */
export function methodEndpointGate(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const analyses = design.statisticalPlan?.plannedAnalyses ?? [];
  for (const e of design.endpoints ?? []) {
    if (!ESTIMAND_REQUIRED_ROLES.includes(e.role)) continue;
    const planned = analyses.filter(a => a.endpointName === e.name);
    if (planned.length === 0) {
      findings.push({
        code: 'MTH-001',
        section: '§11 Statistical methods',
        severity: e.role === 'primary' ? 'major' : 'minor',
        standard: 'ICH E9 §5.4',
        endpointName: e.name,
        title: `No planned analysis for ${e.role.replace('_', ' ')} endpoint "${e.name}"`,
        detail: 'The statistical plan names no analysis method for this endpoint, so its primary analysis is not pre-specified.',
        suggestedFix: 'Add a planned analysis naming the method (e.g. MMRM, Cox proportional hazards, logistic regression) and the estimand it targets.',
      });
      continue;
    }
    for (const a of planned) {
      const family = classifyAnalysisMethod(a.method);
      const fit = FIT_FOR_ENDPOINT[e.type] ?? [];
      if (family === 'unknown') continue; // an unrecognised method is not evidence of a mismatch
      if (!fit.includes(family)) {
        findings.push({
          code: 'MTH-002',
          section: '§11 Statistical methods',
          severity: 'major',
          standard: 'ICH E9 §5.4',
          endpointName: e.name,
          title: `"${a.method}" does not fit a ${e.type.replace(/_/g, ' ')} endpoint`,
          detail:
            `"${a.method}" is a ${family.replace(/_/g, ' ')}-data method planned for "${e.name}", ` +
            `which is a ${e.type.replace(/_/g, ' ')} endpoint.`,
          suggestedFix: suggestedMethodFor(e.type),
        });
      } else if (e.type === 'continuous' && /\banova\b/.test(a.method.toLowerCase()) && !/ancova/.test(a.method.toLowerCase())) {
        findings.push({
          code: 'MTH-003',
          section: '§11 Statistical methods',
          severity: 'minor',
          standard: 'EMA guideline on baseline covariates (2015)',
          endpointName: e.name,
          title: `ANOVA without baseline adjustment for "${e.name}"`,
          detail: 'A change-from-baseline endpoint analysed by ANOVA ignores the baseline covariate; ANCOVA or MMRM with baseline is the accepted model.',
          suggestedFix: 'Use ANCOVA with the baseline value as a covariate, or MMRM for repeated measures.',
        });
      }
    }
  }
  return findings;
}

function suggestedMethodFor(type: string): string {
  switch (type) {
    case 'time_to_event': return 'Use Kaplan–Meier with a log-rank test and a Cox proportional-hazards model (or RMST if hazards are non-proportional).';
    case 'binary': return 'Use logistic regression or a CMH test stratified by the randomisation factors.';
    case 'ordinal': return 'Use a proportional-odds model or a Wilcoxon / van Elteren test; do not collapse to binary.';
    case 'count': return 'Use a negative-binomial (or Poisson) model; for recurrent events, Andersen–Gill or LWYY.';
    default: return 'Use MMRM or ANCOVA with the baseline value as a covariate.';
  }
}

// ─── §12 · Missing data ──────────────────────────────────────────────────────

/**
 * The missing-data strategy must be pre-specified and must serve the estimand.
 * LOCF as the primary approach is the one method both FDA and EMA have moved
 * away from; a plan with no strategy at all leaves the primary analysis's
 * handling of dropouts to the CSR author.
 */
export function missingDataGate(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const sp = design.statisticalPlan;
  if (!sp) return findings; // PWR-000 already reports the absent plan
  const strategy = (sp.missingDataStrategy ?? '').trim();
  if (!strategy) {
    findings.push({
      code: 'MIS-001',
      section: '§12 Missing data',
      severity: 'major',
      standard: 'ICH E9(R1) §A.6',
      title: 'No missing-data strategy specified',
      detail: 'The statistical plan does not say how missing outcomes are handled in the primary analysis, so the estimand cannot be shown to be estimated.',
      suggestedFix: 'Pre-specify the primary approach (e.g. MMRM under MAR, multiple imputation, tipping-point sensitivity) aligned with the estimand strategy.',
    });
    return findings;
  }
  const s = strategy.toLowerCase();
  if (/\blocf\b|last observation carried forward/.test(s)) {
    findings.push({
      code: 'MIS-002',
      section: '§12 Missing data',
      severity: sp.sensitivityAnalysesSpecified ? 'minor' : 'major',
      standard: 'FDA / EMA missing-data guidance (NRC 2010; EMA 2010)',
      title: 'LOCF as the primary missing-data method',
      detail:
        'Last observation carried forward assumes no change after dropout and is biased in either direction; ' +
        'both agencies have moved to model-based (MMRM) or imputation-based (MI) primary analyses.' +
        (sp.sensitivityAnalysesSpecified ? ' Sensitivity analyses are specified, which limits the exposure.' : ' No sensitivity analyses are specified.'),
      suggestedFix: 'Make MMRM or multiple imputation the primary approach; keep LOCF, if at all, as a sensitivity analysis.',
    });
  } else if (/complete[- ]case/.test(s)) {
    findings.push({
      code: 'MIS-003',
      section: '§12 Missing data',
      severity: 'minor',
      standard: 'ICH E9(R1) §A.6',
      title: 'Complete-case analysis as the primary approach',
      detail: 'A complete-case primary analysis assumes missingness is completely at random and discards randomised patients.',
      suggestedFix: 'Use MMRM or multiple imputation as the primary approach and present complete-case as supportive.',
    });
  }
  // Strategy family versus the primary estimand's intercurrent-event strategy.
  const primaryName = (design.endpoints ?? []).find(e => e.role === 'primary')?.name;
  const est = primaryName ? (design.estimands ?? []).find(x => x.endpointName === primaryName) : undefined;
  if (est?.strategy === 'treatment_policy' && /censor|truncat|while on treatment|on[- ]treatment only/.test(s)) {
    findings.push({
      code: 'MIS-004',
      section: '§12 Missing data',
      severity: 'major',
      standard: 'ICH E9(R1) §A.3',
      endpointName: primaryName,
      title: 'Missing-data approach contradicts the treatment-policy estimand',
      detail:
        'The primary estimand follows patients regardless of intercurrent events, but the missing-data approach censors or truncates at discontinuation — that estimates a different (while-on-treatment) estimand.',
      suggestedFix: 'For a treatment-policy estimand, collect data after discontinuation and use multiple imputation (with tipping-point sensitivity) rather than censoring.',
    });
  }
  return findings;
}

// ─── §13 · Interim analysis ──────────────────────────────────────────────────

/**
 * An interim look spends alpha. A plan that declares interims but names no
 * spending function has no type I error control; a plan with no independent
 * DMC has nobody to see the unblinded data.
 */
export function interimAnalysisGate(design: StudyDesign): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const interim = design.statisticalPlan?.interim;
  const fractions = interim?.informationFractions ?? [];
  if (!interim || fractions.length === 0) return findings;
  if (!interim.spendingFunction) {
    findings.push({
      code: 'INT-001',
      section: '§13 Interim analysis',
      severity: 'critical',
      standard: 'ICH E9 §4.5; FDA adaptive-design guidance (2019)',
      title: 'Interim analyses with no alpha-spending function',
      detail: `${fractions.length} interim look(s) are planned but no spending function is named, so the overall type I error is not controlled.`,
      suggestedFix: 'Name the spending function (O\'Brien–Fleming, Lan–DeMets, Pocock) and derive the efficacy boundaries from it.',
    });
  }
  const sorted = fractions.every((f, i) => f > 0 && f <= 1 && (i === 0 || f > fractions[i - 1]));
  if (!sorted || fractions[fractions.length - 1] !== 1) {
    findings.push({
      code: 'INT-002',
      section: '§13 Interim analysis',
      severity: 'major',
      standard: 'ICH E9 §4.5',
      title: 'Information fractions are not a valid schedule',
      detail: `Information fractions must be strictly increasing within (0, 1] and end at 1 (the final analysis); the plan has [${fractions.join(', ')}].`,
      suggestedFix: 'List the interim fractions in order and end the schedule with 1.0 for the final analysis.',
    });
  }
  if (!interim.efficacyBoundaries?.length && !interim.futilityBoundaries?.length) {
    findings.push({
      code: 'INT-003',
      section: '§13 Interim analysis',
      severity: 'minor',
      standard: 'ICH E9 §4.5',
      title: 'No stopping boundaries stated',
      detail: 'Neither efficacy nor futility boundaries are recorded for the planned interim looks.',
      suggestedFix: 'Record the efficacy (and, where applicable, futility) boundaries derived from the spending function.',
    });
  }
  const dmc = design.safety?.dmcCharter;
  if (!dmc?.present) {
    findings.push({
      code: 'INT-004',
      section: '§13 Interim analysis',
      severity: 'major',
      standard: 'FDA DMC guidance (2006)',
      title: 'Interim analyses without a data monitoring committee',
      detail: 'Interim looks at unblinded data are planned but no DMC charter is recorded, so the sponsor would be the one seeing the interim results.',
      suggestedFix: 'Charter an independent DMC with a statistical member and an unblinding procedure before the first look.',
    });
  } else if (dmc.hasStatisticalMember === false) {
    findings.push({
      code: 'INT-005',
      section: '§13 Interim analysis',
      severity: 'minor',
      standard: 'FDA DMC guidance (2006)',
      title: 'DMC without a statistical member',
      detail: 'The DMC charter records no statistician on the committee that will read the interim analysis.',
      suggestedFix: 'Add an independent statistician to the DMC.',
    });
  }
  return findings;
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

/** Run every gate over a design and return the combined findings. */
export function runAllGates(design: StudyDesign): DesignFinding[] {
  return [
    ...estimandGate(design),
    ...endpointRedFlags(design),
    ...frameworkRules(design),
    ...multiplicityGate(design),
    ...powerRedFlags(design),
    ...populationGate(design),
    ...methodEndpointGate(design),
    ...missingDataGate(design),
    ...interimAnalysisGate(design),
    ...scheduleOfActivitiesGate(design),
  ];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function nonEmpty(v: string | undefined | null): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function frameLabel(frame: string): string {
  return frame === 'non_inferiority' ? 'non-inferiority' : frame;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}
