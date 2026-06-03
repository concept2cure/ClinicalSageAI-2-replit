/**
 * Study-design gates — the deterministic checks a design must pass before it can
 * advance (module spec §2 estimands, §3 endpoint architecture, §4 design framework,
 * §6 sample size / power red-flags).
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

// ─── Aggregate ───────────────────────────────────────────────────────────────

/** Run every gate over a design and return the combined findings. */
export function runAllGates(design: StudyDesign): DesignFinding[] {
  return [
    ...estimandGate(design),
    ...endpointRedFlags(design),
    ...frameworkRules(design),
    ...multiplicityGate(design),
    ...powerRedFlags(design),
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
