/**
 * Biostatistics bridge — design adapter.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * The platform holds three statistical models that never met:
 *
 *   • `study-design/StatisticalPlan` — the design-as-data spine (USDM / ICH
 *     M11), persisted on `cdisc_prm_studies` and projected into the protocol,
 *     SAP, SoA and registration record;
 *   • `ana-biostats/StatisticalInput` — what the deterministic computation and
 *     judgment engines consume, and what the Biostatistics surface edits;
 *   • `biostatistics-judgment/StudyDesignInput` — a third, unconnected copy.
 *
 * Nothing translated between them, so a study designed in the design spine
 * had to be retyped into the biostatistics workbench, and a sample size the
 * workbench computed never reached the protocol, the SAP projection or the
 * registration record. This module is the ONE translation, in both directions:
 *
 *   studyDesignToStatisticalInput(design)  →  { input, gaps, mapped }
 *   computationToPlanPatch(input, result)  →  Partial<StatisticalPlan>
 *
 * ── Honesty contract ─────────────────────────────────────────────────────────
 * The adapter never invents a number. Where the design is silent it either
 * applies the engine's documented default AND reports that as a gap, or — when
 * the missing value would make the computation meaningless (no effect size, no
 * event rate for a time-to-event endpoint) — returns `input: null` with a
 * blocking gap. A caller that computes anyway is fabricating.
 *
 * Pure and deterministic: no DB, no AI, no I/O. Everything here is unit-tested
 * against a design the SAP-projection tests already consider complete.
 *
 * @module server/services/biostatistics-bridge/design-adapter
 */

import type {
  StudyDesign,
  StatisticalPlan,
  EndpointType as DesignEndpointType,
  Endpoint,
} from '../study-design/study-design-types';
import { primaryEndpoints } from '../study-design/study-design-types';
import type {
  ClientTrack,
  ComputationResult,
  EndpointType as EngineEndpointType,
  ObjectiveType,
  RegulatoryBody,
  StatisticalInput,
  StudyType,
} from '../ana-biostats/types';

// ─── Gap reporting ───────────────────────────────────────────────────────────

/** Why the adapter could not take a value from the design, and what it did instead. */
export interface DesignGap {
  /** The engine input this concerns (e.g. "effectSize"). */
  field: keyof StatisticalInput | 'primaryEndpoint' | 'estimand';
  /** Sentence for a person: what was missing and what was assumed, if anything. */
  message: string;
  /**
   * `blocking` — no defensible default exists; the computation must not run.
   * `defaulted` — the engine's documented default was applied; the person
   *               should confirm it before anything is filed.
   * `note` — a lossy translation the reader should know about.
   */
  severity: 'blocking' | 'defaulted' | 'note';
  /** Where in the design object the value belongs, for the fix-it link. */
  designPath: string;
}

export interface DesignAdapterResult {
  /** Engine input, or null when a blocking gap makes computation meaningless. */
  input: StatisticalInput | null;
  gaps: DesignGap[];
  /** Engine fields that were taken directly from the design (audit trail of the mapping). */
  mapped: string[];
}

// ─── Vocabulary maps (design → engine) ───────────────────────────────────────

const REGION_TO_BODY: Record<string, RegulatoryBody> = {
  us: 'FDA', usa: 'FDA', fda: 'FDA', 'united states': 'FDA',
  eu: 'EMA', ema: 'EMA', europe: 'EMA', 'european union': 'EMA',
  uk: 'MHRA', gb: 'MHRA', mhra: 'MHRA', 'united kingdom': 'MHRA',
  jp: 'PMDA', japan: 'PMDA', pmda: 'PMDA',
  cn: 'NMPA', china: 'NMPA', nmpa: 'NMPA',
  au: 'TGA', australia: 'TGA', tga: 'TGA',
  ca: 'Health_Canada', canada: 'Health_Canada', 'health canada': 'Health_Canada', health_canada: 'Health_Canada',
};

/** First recognised target region wins; the engine takes one body per run. */
export function regulatoryBodyForRegions(regions: string[] | undefined): RegulatoryBody | undefined {
  for (const r of regions ?? []) {
    const hit = REGION_TO_BODY[String(r).trim().toLowerCase()];
    if (hit) return hit;
  }
  return undefined;
}

export function clientTrackForProduct(productType: StudyDesign['productType']): ClientTrack {
  if (productType === 'device' || productType === 'combination') return 'medical_device';
  if (productType === 'ivd') return 'diagnostics_ivd';
  return 'biotech_pharma';
}

const DESIGN_ENDPOINT_TO_ENGINE: Record<DesignEndpointType, EngineEndpointType> = {
  continuous: 'continuous',
  binary: 'binary',
  time_to_event: 'time_to_event',
  ordinal: 'ordinal',
  count: 'count',
  composite: 'composite',
  // A validated PRO instrument yields a score; the engine sizes it as a continuous measure.
  patient_reported: 'continuous',
};

function studyTypeFor(design: StudyDesign): StudyType {
  const f = design.framework;
  switch (f?.structuralDesign) {
    case 'single_arm': return 'single_arm';
    case 'adaptive': return 'adaptive';
    case 'basket': return 'basket';
    case 'platform': return 'platform';
    case 'dose_ranging': return 'dose_response';
    default: break;
  }
  if (design.productType === 'ivd') return 'diagnostic_accuracy';
  switch (f?.inferentialFrame) {
    case 'non_inferiority': return 'non_inferiority';
    case 'equivalence': return 'equivalence';
    default: return 'superiority';
  }
}

function objectiveTypeFor(design: StudyDesign): ObjectiveType {
  if (design.productType === 'ivd') return 'diagnostic_accuracy';
  if (design.framework?.structuralDesign === 'dose_ranging') return 'dose_finding';
  const primary = design.objectives?.find((o) => o.level === 'primary');
  const text = (primary?.text ?? '').toLowerCase();
  if (/\bsafety\b|\btolerab/.test(text)) return 'safety';
  if (/bioequivalen/.test(text)) return 'bioequivalence';
  if (design.productType === 'device' && /\bperformance\b/.test(text)) return 'performance';
  return 'efficacy';
}

function comparatorFor(design: StudyDesign): StatisticalInput['comparatorType'] {
  switch (design.framework?.controlType) {
    case 'placebo': return 'placebo';
    case 'active': return 'active';
    case 'historical':
    case 'external': return 'historical';
    default: return undefined;
  }
}

function multiplicityFor(plan: StatisticalPlan | undefined): StatisticalInput['multiplicityMethod'] {
  switch (plan?.multiplicity?.method) {
    case 'holm': return 'holm';
    case 'hochberg': return 'hochberg';
    case 'none': return 'none';
    default: return undefined; // fixed_sequence / gatekeeping / graphical / alpha_spending have no engine analogue
  }
}

function missingDataFor(strategy: string | undefined): StatisticalInput['missingDataMethod'] {
  const s = (strategy ?? '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('mmrm')) return 'MMRM';
  if (s.includes('multiple imputation') || /\bmi\b/.test(s)) return 'multiple_imputation';
  if (s.includes('pattern')) return 'pattern_mixture';
  if (s.includes('locf')) return 'LOCF';
  if (s.includes('complete case') || s.includes('complete-case')) return 'complete_case';
  return undefined;
}

/** "Phase 3" the way the engine's presets spell it, from the design vocabulary. */
export function phaseLabel(phase: StudyDesign['phase'] | undefined): string | undefined {
  if (!phase) return undefined;
  if (phase === 'FIH') return 'Phase I (first-in-human)';
  const roman: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
  const m = /^(\d)(b?)$/.exec(phase);
  if (!m) return String(phase);
  return `Phase ${roman[m[1]] ?? m[1]}${m[2]}`;
}

// ─── design → engine input ───────────────────────────────────────────────────

const ENGINE_DEFAULTS = { alpha: 0.05, power: 0.8, attrition: 0.15 } as const;

/**
 * Translate a persisted design into the input the computation and judgment
 * engines take. See the module header for the honesty contract.
 */
export function studyDesignToStatisticalInput(design: StudyDesign): DesignAdapterResult {
  const gaps: DesignGap[] = [];
  const mapped: string[] = [];
  const plan = design.statisticalPlan ?? ({ plannedAnalyses: [] } as StatisticalPlan);
  const pa = plan.powerAssumptions ?? {};

  const primary: Endpoint | undefined = primaryEndpoints(design)[0];
  if (!primary) {
    gaps.push({
      field: 'primaryEndpoint',
      message: 'The design declares no primary endpoint, so there is nothing to size the study for.',
      severity: 'blocking',
      designPath: 'endpoints[role=primary]',
    });
  }
  const primaryCount = primaryEndpoints(design).length;
  if (primaryCount > 1) {
    gaps.push({
      field: 'primaryEndpoint',
      message: `The design has ${primaryCount} primary endpoints; the engine sizes on the first ("${primary?.name}"). Co-primary sizing needs a dedicated multiplicity run.`,
      severity: 'note',
      designPath: 'endpoints[role=primary]',
    });
  }

  const clientTrack = clientTrackForProduct(design.productType);
  const endpointType: EngineEndpointType = clientTrack === 'diagnostics_ivd'
    ? 'sensitivity_specificity'
    : primary
      ? DESIGN_ENDPOINT_TO_ENGINE[primary.type] ?? 'continuous'
      : 'continuous';
  if (primary?.type === 'patient_reported') {
    gaps.push({
      field: 'endpointType',
      message: 'A patient-reported endpoint is sized as a continuous score; confirm the instrument yields an interval-scale measure.',
      severity: 'note',
      designPath: `endpoints["${primary.name}"].type`,
    });
  }
  if (primary && (primary.type === 'ordinal' || primary.type === 'count' || primary.type === 'composite')) {
    gaps.push({
      field: 'endpointType',
      message: `The engine has no closed-form for a ${primary.type} endpoint and will fall back to a continuous approximation. Treat the result as indicative only.`,
      severity: 'note',
      designPath: `endpoints["${primary.name}"].type`,
    });
  }

  // alpha / power / attrition — defaults are reported, never silent.
  let alpha: number;
  if (typeof plan.alpha === 'number') {
    alpha = plan.oneSided ? plan.alpha * 2 : plan.alpha;
    mapped.push('alpha');
    if (plan.oneSided) {
      gaps.push({
        field: 'alpha',
        message: `The plan states a one-sided alpha of ${plan.alpha}; the engine uses two-sided ${alpha} (the equivalent boundary).`,
        severity: 'note',
        designPath: 'statisticalPlan.alpha',
      });
    }
  } else {
    alpha = ENGINE_DEFAULTS.alpha;
    gaps.push({ field: 'alpha', message: 'No alpha in the statistical plan; two-sided 0.05 assumed.', severity: 'defaulted', designPath: 'statisticalPlan.alpha' });
  }

  let powerTarget: number;
  if (typeof plan.power === 'number') { powerTarget = plan.power; mapped.push('powerTarget'); }
  else {
    powerTarget = ENGINE_DEFAULTS.power;
    gaps.push({ field: 'powerTarget', message: 'No target power in the statistical plan; 80% assumed.', severity: 'defaulted', designPath: 'statisticalPlan.power' });
  }

  let attritionRate: number;
  if (typeof plan.dropoutRate === 'number') { attritionRate = plan.dropoutRate; mapped.push('attritionRate'); }
  else {
    attritionRate = ENGINE_DEFAULTS.attrition;
    gaps.push({ field: 'attritionRate', message: 'No dropout rate in the statistical plan; 15% assumed.', severity: 'defaulted', designPath: 'statisticalPlan.dropoutRate' });
  }

  // Effect and its companions — blocking when absent, per endpoint family.
  const effectSize = pa.effectSize;
  const isIvd = clientTrack === 'diagnostics_ivd';
  if (!isIvd && typeof effectSize !== 'number') {
    if (endpointType === 'binary' && typeof pa.eventRate === 'number') {
      // A binary endpoint sized from rates alone is legitimate: control rate is the
      // event rate, and the delta must still be stated somewhere.
      gaps.push({
        field: 'effectSize',
        message: 'No effect size (treatment-minus-control rate difference) in the power assumptions.',
        severity: 'blocking',
        designPath: 'statisticalPlan.powerAssumptions.effectSize',
      });
    } else {
      gaps.push({
        field: 'effectSize',
        message: 'No effect size in the power assumptions. The engine cannot size a study without one.',
        severity: 'blocking',
        designPath: 'statisticalPlan.powerAssumptions.effectSize',
      });
    }
  } else if (!isIvd) {
    mapped.push('effectSize');
  }

  if (endpointType === 'continuous' && typeof pa.variance !== 'number') {
    gaps.push({
      field: 'variance',
      message: 'No variance in the power assumptions; the engine will treat the effect size as standardised (SD = effect).',
      severity: 'defaulted',
      designPath: 'statisticalPlan.powerAssumptions.variance',
    });
  } else if (endpointType === 'continuous') {
    mapped.push('variance');
  }

  if (endpointType === 'time_to_event' && typeof pa.eventRate !== 'number') {
    gaps.push({
      field: 'eventRate',
      message: 'A time-to-event endpoint needs an expected event rate to convert events into subjects.',
      severity: 'blocking',
      designPath: 'statisticalPlan.powerAssumptions.eventRate',
    });
  } else if (endpointType === 'time_to_event') {
    mapped.push('eventRate');
  }

  let controlRate: number | undefined;
  let treatmentRate: number | undefined;
  if (endpointType === 'binary') {
    if (typeof pa.eventRate === 'number') {
      controlRate = pa.eventRate;
      mapped.push('controlRate');
      if (typeof effectSize === 'number') {
        // Rounded so 0.3 + 0.15 is 0.45 and not 0.44999999999999996 on the wire.
        treatmentRate = Math.min(1, Math.max(0, Number((pa.eventRate + effectSize).toFixed(6))));
        mapped.push('treatmentRate');
      }
    } else {
      gaps.push({
        field: 'controlRate',
        message: 'A binary endpoint needs the control-arm response rate (recorded as the event rate in the power assumptions).',
        severity: 'blocking',
        designPath: 'statisticalPlan.powerAssumptions.eventRate',
      });
    }
  }

  // Frame-specific obligations.
  const studyType = studyTypeFor(design);
  const margin = design.framework?.margin;
  if ((studyType === 'non_inferiority' || studyType === 'equivalence') && typeof margin !== 'number') {
    gaps.push({
      field: studyType === 'non_inferiority' ? 'nonInferiorityMargin' : 'equivalenceMargin',
      message: `A ${studyType.replace('_', '-')} frame needs a margin; none is set on the design framework.`,
      severity: 'blocking',
      designPath: 'framework.margin',
    });
  } else if (typeof margin === 'number' && (studyType === 'non_inferiority' || studyType === 'equivalence')) {
    mapped.push(studyType === 'non_inferiority' ? 'nonInferiorityMargin' : 'equivalenceMargin');
  }

  // Allocation ratio from the randomisation scheme (first two arms).
  let allocationRatio = 1;
  const ratio = design.randomization?.ratio;
  if (Array.isArray(ratio) && ratio.length >= 2 && ratio[1] > 0) {
    allocationRatio = ratio[0] / ratio[1];
    mapped.push('allocationRatio');
    if (ratio.length > 2) {
      gaps.push({
        field: 'allocationRatio',
        message: `Randomisation ratio ${ratio.join(':')} has ${ratio.length} arms; the engine sizes the first two.`,
        severity: 'note',
        designPath: 'randomization.ratio',
      });
    }
  } else if (design.arms && design.arms.length >= 2) {
    gaps.push({ field: 'allocationRatio', message: 'No randomisation ratio; 1:1 assumed.', severity: 'defaulted', designPath: 'randomization.ratio' });
  }

  const primaryEstimand = primary ? design.estimands?.find((e) => e.endpointName === primary.name) : undefined;
  if (primary && !primaryEstimand) {
    gaps.push({
      field: 'estimand',
      message: `No estimand is defined for the primary endpoint "${primary.name}" (ICH E9(R1)).`,
      severity: 'note',
      designPath: `estimands["${primary.name}"]`,
    });
  }

  const regulatoryBody = regulatoryBodyForRegions(design.targetRegions);
  if (!regulatoryBody) {
    gaps.push({
      field: 'regulatoryBody',
      message: 'No recognised target region on the design; regulatory customisation will default to FDA.',
      severity: 'defaulted',
      designPath: 'targetRegions',
    });
  } else {
    mapped.push('regulatoryBody');
  }

  const interimAnalyses = (plan.interim?.informationFractions ?? []).filter((f) => f > 0 && f < 1).length;
  const keySecondaries = (design.endpoints ?? []).filter((e) => e.role === 'key_secondary').length;

  const blocking = gaps.some((g) => g.severity === 'blocking');

  const input: StatisticalInput = {
    clientTrack,
    regulatoryBody: regulatoryBody ?? 'FDA',
    studyType,
    objectiveType: objectiveTypeFor(design),
    endpointType,
    alpha,
    powerTarget,
    effectSize: typeof effectSize === 'number' ? effectSize : 0,
    variance: typeof pa.variance === 'number' ? pa.variance : undefined,
    eventRate: typeof pa.eventRate === 'number' ? pa.eventRate : undefined,
    controlRate,
    treatmentRate,
    nonInferiorityMargin: studyType === 'non_inferiority' && typeof margin === 'number' ? margin : undefined,
    equivalenceMargin: studyType === 'equivalence' && typeof margin === 'number' ? margin : undefined,
    attritionRate,
    allocationRatio,
    comparatorType: comparatorFor(design),
    indication: design.indication,
    phase: phaseLabel(design.phase),
    numberOfGroups: Math.max(1, design.arms?.length ?? 2),
    numberOfEndpoints: 1 + keySecondaries,
    interimAnalyses: interimAnalyses > 0 ? interimAnalyses : undefined,
    multiplicityMethod: multiplicityFor(plan),
    estimandStrategy: primaryEstimand?.strategy,
    missingDataMethod: missingDataFor(plan.missingDataStrategy),
  };
  for (const k of ['studyType', 'endpointType', 'clientTrack', 'indication', 'phase', 'numberOfGroups'] as const) {
    if (!mapped.includes(k)) mapped.push(k);
  }

  return { input: blocking ? null : input, gaps, mapped };
}

// ─── engine result → design patch ────────────────────────────────────────────

/** Every evidence link the bridge writes starts with this, so it can be told from the design's own evidence. */
export const BRIDGE_STAMP_PREFIX = 'Biostatistics bridge —';

/**
 * What the computation tells the design. Only fields the engine actually
 * produced are written; existing power assumptions are preserved and the
 * provenance of the number is recorded as an `assumption` evidence link that
 * names the method, so the SAP projection's §6 red-flags can see where the
 * planned N came from.
 */
export function computationToPlanPatch(
  input: StatisticalInput,
  result: ComputationResult,
  provenance?: { engine: string; version: string; inputsSha256?: string },
): Partial<StatisticalPlan> {
  const plannedSampleSize = result.adjustedTotal ?? result.sampleSize.total;
  // The stamp always opens with the same words so `applyPlanPatch` can
  // recognise and supersede an earlier bridge stamp without touching the
  // design's own evidence (a prior trial, a TPP, a guidance).
  const label = provenance
    ? `${BRIDGE_STAMP_PREFIX} ${provenance.engine} ${provenance.version} — ${result.method}`
    : `${BRIDGE_STAMP_PREFIX} ${result.method}`;
  return {
    alpha: input.alpha,
    oneSided: false,
    power: result.power,
    plannedSampleSize,
    dropoutRate: input.attritionRate,
    powerAssumptions: {
      effectSize: input.effectSize,
      ...(typeof input.variance === 'number' ? { variance: input.variance } : {}),
      ...(typeof input.eventRate === 'number' ? { eventRate: input.eventRate }
        : typeof input.controlRate === 'number' ? { eventRate: input.controlRate } : {}),
      evidence: [
        {
          kind: 'assumption',
          source: label,
          ...(provenance?.inputsSha256 ? { ref: `sha256:${provenance.inputsSha256}` } : {}),
        },
      ],
    },
  };
}

/** Merge a plan patch into a design without mutating either. */
export function applyPlanPatch(design: StudyDesign, patch: Partial<StatisticalPlan>): StudyDesign {
  const current = design.statisticalPlan ?? ({ plannedAnalyses: [] } as StatisticalPlan);
  const existingEvidence = current.powerAssumptions?.evidence ?? [];
  const patchEvidence = patch.powerAssumptions?.evidence ?? [];
  return {
    ...design,
    statisticalPlan: {
      ...current,
      ...patch,
      plannedAnalyses: current.plannedAnalyses ?? [],
      powerAssumptions: {
        ...(current.powerAssumptions ?? {}),
        ...(patch.powerAssumptions ?? {}),
        evidence: [
          // A prior bridge stamp is superseded, not accumulated.
          ...existingEvidence.filter((e) => !(e.kind === 'assumption' && e.source.startsWith(BRIDGE_STAMP_PREFIX))),
          ...patchEvidence,
        ],
      },
    },
  };
}

// ─── Statistical readiness (the list-row summary) ────────────────────────────

export interface StatisticalReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  /** What to fix, when not ok. */
  hint?: string;
}

export interface StatisticalReadiness {
  /** 0–100: share of applicable checks that pass. */
  percent: number;
  checks: StatisticalReadinessCheck[];
  plannedSampleSize: number | null;
  power: number | null;
  alpha: number | null;
  primaryEndpoint: string | null;
}

/**
 * The handful of facts a protocol author or PM wants at a glance: is this
 * design statistically ready to file? Every check names its fix. Checks that
 * do not apply (an interim plan on a design with no interims) are not counted.
 */
export function statisticalReadiness(design: StudyDesign): StatisticalReadiness {
  const plan = design.statisticalPlan ?? ({ plannedAnalyses: [] } as StatisticalPlan);
  const primary = primaryEndpoints(design)[0];
  const pa = plan.powerAssumptions ?? {};
  const frame = design.framework?.inferentialFrame;
  const keySecondaries = (design.endpoints ?? []).filter((e) => e.role === 'key_secondary').length;
  const hasInterims = (plan.interim?.informationFractions ?? []).some((f) => f > 0 && f < 1);

  const checks: (StatisticalReadinessCheck | null)[] = [
    { key: 'primary_endpoint', label: 'Primary endpoint declared', ok: Boolean(primary), hint: 'Add an endpoint with role "primary".' },
    { key: 'estimand', label: 'Primary estimand defined (ICH E9(R1))', ok: Boolean(primary && design.estimands?.some((e) => e.endpointName === primary.name)), hint: 'Define the estimand for the primary endpoint.' },
    { key: 'alpha', label: 'Alpha stated', ok: typeof plan.alpha === 'number', hint: 'Set statisticalPlan.alpha.' },
    { key: 'power', label: 'Target power stated', ok: typeof plan.power === 'number', hint: 'Set statisticalPlan.power.' },
    { key: 'effect', label: 'Effect-size assumption with evidence', ok: typeof pa.effectSize === 'number' && (pa.evidence?.length ?? 0) > 0, hint: 'Record the assumed effect and where it comes from.' },
    { key: 'sample_size', label: 'Planned sample size', ok: typeof plan.plannedSampleSize === 'number' && plan.plannedSampleSize > 0, hint: 'Compute and apply a sample size.' },
    { key: 'dropout', label: 'Dropout assumption', ok: typeof plan.dropoutRate === 'number', hint: 'Set statisticalPlan.dropoutRate.' },
    { key: 'primary_analysis', label: 'Primary analysis method planned', ok: Boolean(primary && plan.plannedAnalyses?.some((a) => a.endpointName === primary.name)), hint: 'Add a planned analysis for the primary endpoint.' },
    { key: 'populations', label: 'Analysis populations with a primary set', ok: Boolean(design.population?.analysisPopulations?.some((p) => p.isPrimaryAnalysisSet)), hint: 'Mark the primary analysis set.' },
    frame && frame !== 'superiority'
      ? { key: 'margin', label: `${frame.replace('_', '-')} margin justified`, ok: typeof design.framework?.margin === 'number' && Boolean(design.framework?.marginJustification), hint: 'Set the margin and its justification on the framework.' }
      : null,
    keySecondaries > 0
      ? { key: 'multiplicity', label: 'Multiplicity strategy for key secondaries', ok: Boolean(plan.multiplicity && plan.multiplicity.method !== 'none'), hint: 'Declare a multiplicity method.' }
      : null,
    hasInterims
      ? { key: 'interim', label: 'Interim spending and DMC role', ok: Boolean(plan.interim?.spendingFunction) && Boolean(design.safety?.dmcCharter?.present), hint: 'Name the spending function and the DMC charter.' }
      : null,
    { key: 'missing_data', label: 'Missing-data strategy aligned with the estimand', ok: Boolean(plan.missingDataStrategy) && !/locf/i.test(plan.missingDataStrategy ?? ''), hint: 'State a missing-data strategy other than LOCF-as-primary.' },
  ];
  const applicable = checks.filter((c): c is StatisticalReadinessCheck => c !== null);
  const passed = applicable.filter((c) => c.ok).length;
  return {
    percent: applicable.length === 0 ? 0 : Math.round((passed / applicable.length) * 100),
    checks: applicable,
    plannedSampleSize: typeof plan.plannedSampleSize === 'number' ? plan.plannedSampleSize : null,
    power: typeof plan.power === 'number' ? plan.power : null,
    alpha: typeof plan.alpha === 'number' ? plan.alpha : null,
    primaryEndpoint: primary?.name ?? null,
  };
}
