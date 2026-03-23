/**
 * Biostats Signal Engine — Deterministic Evaluators
 *
 * Each evaluator is a pure function: inputs → signal (or null).
 * NO LLM calls. NO AI inference. Deterministic math only.
 *
 * @module server/services/biostats-signal-engine/evaluators
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BiostatSignal,
  BiostatEvaluationRequest,
  SignalComputation,
  SignalAction,
  SignalSeverity,
  SignalProofReceipt,
  EndpointSpec,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// MATH UTILITIES (deterministic, no LLM)
// ═══════════════════════════════════════════════════════════════════════════

/** Standard normal CDF approximation (Abramowitz & Stegun 26.2.17) */
function normCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

/** Inverse normal CDF (rational approximation, Beasley-Springer-Moro) */
function normQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 1: POWER INADEQUACY
// ═══════════════════════════════════════════════════════════════════════════

export function evaluatePowerInadequacy(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  const pp = req.powerParams;
  if (!pp) return { signal: null, receipt: null };

  // Compute actual power deterministically
  let computedPower: number;
  let formula: string;
  let inputs: Record<string, unknown>;

  const zAlpha = normQuantile(1 - pp.alpha / 2);
  const N = pp.enrolledN ?? pp.plannedN;
  const adjustedN = pp.dropoutRate ? Math.floor(N * (1 - pp.dropoutRate)) : N;

  if (pp.endpointType === 'continuous') {
    const sigma = pp.sigma ?? 1;
    const ratio = pp.allocationRatio ?? 1;
    const n1 = Math.floor(adjustedN / (1 + ratio));
    const n2 = adjustedN - n1;
    const se = sigma * Math.sqrt(1 / n1 + 1 / n2);
    const effect = pp.effectSize / se;
    computedPower = normCdf(effect - zAlpha) + normCdf(-effect - zAlpha);
    formula = `Power = Φ(δ/SE - z_{α/2}) + Φ(-δ/SE - z_{α/2}), SE = σ√(1/n₁ + 1/n₂)`;
    inputs = { delta: pp.effectSize, sigma, n1, n2, alpha: pp.alpha, zAlpha: round(zAlpha, 4) };
  } else if (pp.endpointType === 'binary') {
    const p1 = pp.controlRate ?? 0.3;
    const p2 = pp.treatmentRate ?? (p1 + pp.effectSize);
    const ratio = pp.allocationRatio ?? 1;
    const n1 = Math.floor(adjustedN / (1 + ratio));
    const n2 = adjustedN - n1;
    const pBar = (n1 * p1 + n2 * p2) / (n1 + n2);
    const se0 = Math.sqrt(pBar * (1 - pBar) * (1 / n1 + 1 / n2));
    const se1 = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    const z = (Math.abs(p2 - p1) - zAlpha * se0) / se1;
    computedPower = normCdf(z);
    formula = `Power = Φ((|p₂-p₁| - z_{α/2}·SE₀) / SE₁)`;
    inputs = { p1, p2, n1, n2, alpha: pp.alpha, pBar: round(pBar, 4) };
  } else if (pp.endpointType === 'time_to_event') {
    const hr = pp.hazardRatio ?? (1 - pp.effectSize);
    const logHR = Math.log(hr);
    const events = Math.floor(adjustedN * 0.7); // approximate event fraction
    const se = 2 / Math.sqrt(events);
    const z = Math.abs(logHR) / se - zAlpha;
    computedPower = normCdf(z);
    formula = `Power = Φ(|log(HR)|/SE - z_{α/2}), SE = 2/√d, d = events`;
    inputs = { hazardRatio: hr, events, adjustedN, alpha: pp.alpha };
  } else {
    // Ordinal/count: use effect-size based approximation
    const sigma = pp.sigma ?? 1;
    const se = sigma * Math.sqrt(4 / adjustedN);
    const effect = pp.effectSize / se;
    computedPower = normCdf(effect - zAlpha);
    formula = `Power ≈ Φ(δ/SE - z_{α/2}), SE = σ√(4/N)`;
    inputs = { delta: pp.effectSize, sigma, adjustedN, alpha: pp.alpha };
  }

  computedPower = round(computedPower, 4);

  // Determine severity based on how far below target
  const powerGap = pp.targetPower - computedPower;
  const triggered = computedPower < pp.targetPower;

  if (!triggered) return { signal: null, receipt: null };

  const severity: SignalSeverity =
    powerGap >= 0.30 ? 'critical' :
    powerGap >= 0.15 ? 'high' :
    powerGap >= 0.05 ? 'medium' : 'low';

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: `${pp.endpointType}_power_calculation`,
    inputs,
    outputs: { computedPower, targetPower: pp.targetPower, powerGap: round(powerGap, 4) },
    formula,
    thresholdApplied: `power (${computedPower}) < target (${pp.targetPower})`,
    thresholdMet: true,
    deterministicProof: `Computed power = ${computedPower} using ${formula}. Target = ${pp.targetPower}. Gap = ${round(powerGap, 4)}. Study is underpowered by ${round(powerGap * 100, 1)}%.`,
  };

  const actions: SignalAction[] = [
    {
      actionType: severity === 'critical' ? 'block_submission' : 'require_human_review',
      reason: `Study power ${computedPower} is below required ${pp.targetPower}`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
    {
      actionType: 'generate_contradiction',
      reason: `Power assumption (${pp.targetPower}) contradicts computed reality (${computedPower})`,
      targetSystem: 'contradiction_engine',
      executed: false,
    },
    {
      actionType: 'update_assumption',
      reason: `Power assumption in registry must be updated to reflect actual ${computedPower}`,
      targetSystem: 'assumption_registry',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'power_inadequacy',
    severity,
    title: `Power Inadequacy: ${round(computedPower * 100, 1)}% vs ${pp.targetPower * 100}% target`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'deterministic',
    createdAt: new Date(),
    status: 'active',
  };

  const receipt = buildReceipt(signal, req);

  return { signal, receipt };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 2: ENDPOINT / DOCUMENT MISALIGNMENT
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateEndpointMisalignment(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  if (!req.endpoints) return { signal: null, receipt: null };

  const sources = Object.entries(req.endpoints).filter(([_, eps]) => eps && eps.length > 0);
  if (sources.length < 2) return { signal: null, receipt: null };

  const misalignments: Array<{
    field: string;
    sourceA: string;
    sourceB: string;
    valueA: string;
    valueB: string;
    severity: SignalSeverity;
  }> = [];

  // Compare all pairs of document sources
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const [nameA, epsA] = sources[i];
      const [nameB, epsB] = sources[j];

      // Compare primary endpoints
      const primariesA = epsA!.filter(e => e.category === 'primary');
      const primariesB = epsB!.filter(e => e.category === 'primary');

      // Check count mismatch
      if (primariesA.length !== primariesB.length) {
        misalignments.push({
          field: 'primary_endpoint_count',
          sourceA: nameA,
          sourceB: nameB,
          valueA: `${primariesA.length} primary endpoints`,
          valueB: `${primariesB.length} primary endpoints`,
          severity: 'critical',
        });
      }

      // Check name/type mismatches
      for (const epA of primariesA) {
        const match = primariesB.find(epB =>
          normalizeEndpointName(epB.name) === normalizeEndpointName(epA.name)
        );

        if (!match) {
          // Primary endpoint in one doc not found in another
          misalignments.push({
            field: 'primary_endpoint_name',
            sourceA: nameA,
            sourceB: nameB,
            valueA: epA.name,
            valueB: `NOT FOUND in ${nameB}`,
            severity: 'critical',
          });
        } else {
          // Check type mismatch
          if (epA.type !== match.type) {
            misalignments.push({
              field: 'endpoint_type',
              sourceA: nameA,
              sourceB: nameB,
              valueA: `${epA.name}: ${epA.type}`,
              valueB: `${match.name}: ${match.type}`,
              severity: 'high',
            });
          }
          // Check statistical method mismatch
          if (epA.statisticalMethod && match.statisticalMethod &&
              epA.statisticalMethod.toLowerCase() !== match.statisticalMethod.toLowerCase()) {
            misalignments.push({
              field: 'statistical_method',
              sourceA: nameA,
              sourceB: nameB,
              valueA: `${epA.name}: ${epA.statisticalMethod}`,
              valueB: `${match.name}: ${match.statisticalMethod}`,
              severity: 'high',
            });
          }
          // Check timepoint mismatch
          if (epA.timepoint && match.timepoint &&
              epA.timepoint.toLowerCase() !== match.timepoint.toLowerCase()) {
            misalignments.push({
              field: 'endpoint_timepoint',
              sourceA: nameA,
              sourceB: nameB,
              valueA: `${epA.name}: ${epA.timepoint}`,
              valueB: `${match.name}: ${match.timepoint}`,
              severity: 'medium',
            });
          }
        }
      }
    }
  }

  if (misalignments.length === 0) return { signal: null, receipt: null };

  const maxSeverity = misalignments.reduce<SignalSeverity>((max, m) => {
    const order: SignalSeverity[] = ['low', 'medium', 'high', 'critical'];
    return order.indexOf(m.severity) > order.indexOf(max) ? m.severity : max;
  }, 'low');

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: 'cross_document_endpoint_comparison',
    inputs: {
      documentsCompared: sources.map(([name, eps]) => ({ source: name, endpointCount: eps!.length })),
    },
    outputs: {
      misalignmentCount: misalignments.length,
      misalignments,
    },
    thresholdApplied: `misalignment_count (${misalignments.length}) > 0`,
    thresholdMet: true,
    deterministicProof: `Cross-document comparison found ${misalignments.length} endpoint misalignment(s) across ${sources.map(s => s[0]).join(', ')}. ${misalignments.filter(m => m.severity === 'critical').length} critical, ${misalignments.filter(m => m.severity === 'high').length} high.`,
  };

  const actions: SignalAction[] = [
    {
      actionType: 'generate_contradiction',
      reason: `Endpoints diverge across ${sources.length} documents: ${misalignments.length} misalignment(s)`,
      targetSystem: 'contradiction_engine',
      executed: false,
    },
    {
      actionType: maxSeverity === 'critical' ? 'block_submission' : 'flag_for_amendment',
      reason: `Document alignment must be restored before submission`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'endpoint_document_misalignment',
    severity: maxSeverity,
    title: `Endpoint Misalignment: ${misalignments.length} discrepancies across ${sources.map(s => s[0]).join('/')}`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'cross_reference',
    createdAt: new Date(),
    status: 'active',
  };

  return { signal, receipt: buildReceipt(signal, req) };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 3: STATISTICAL UNCERTAINTY (low-confidence, no auto-execute)
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateStatisticalUncertainty(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  const r = req.results;
  if (!r) return { signal: null, receipt: null };

  const uncertaintyReasons: string[] = [];
  let severity: SignalSeverity = 'low';

  // Check 1: p-value near boundary (0.03 - 0.07)
  if (r.primaryPValue !== undefined) {
    if (r.primaryPValue >= 0.03 && r.primaryPValue <= 0.07) {
      uncertaintyReasons.push(
        `Primary p-value (${r.primaryPValue}) is in the uncertainty zone [0.03, 0.07]`
      );
      severity = r.primaryPValue > 0.05 ? 'high' : 'medium';
    }
  }

  // Check 2: CI includes clinically meaningful threshold
  if (r.confidenceInterval && r.clinicalThreshold !== undefined) {
    const [lower, upper] = r.confidenceInterval;
    const threshold = r.clinicalThreshold;
    if (lower < threshold && upper > threshold) {
      uncertaintyReasons.push(
        `95% CI [${lower}, ${upper}] spans the clinical threshold (${threshold})`
      );
      severity = severityMax(severity, 'high');
    }
    // Check CI width relative to effect
    if (r.pointEstimate !== undefined) {
      const ciWidth = upper - lower;
      const effectMagnitude = Math.abs(r.pointEstimate);
      if (effectMagnitude > 0 && ciWidth / effectMagnitude > 1.5) {
        uncertaintyReasons.push(
          `CI width (${round(ciWidth, 3)}) exceeds 1.5× the point estimate magnitude (${round(effectMagnitude, 3)})`
        );
        severity = severityMax(severity, 'medium');
      }
    }
  }

  // Check 3: Point estimate near zero or near clinical threshold
  if (r.pointEstimate !== undefined && r.clinicalThreshold !== undefined) {
    const proximity = Math.abs(r.pointEstimate - r.clinicalThreshold);
    const scale = Math.abs(r.clinicalThreshold) || 1;
    if (proximity / scale < 0.1) {
      uncertaintyReasons.push(
        `Point estimate (${r.pointEstimate}) within 10% of clinical threshold (${r.clinicalThreshold})`
      );
      severity = severityMax(severity, 'high');
    }
  }

  if (uncertaintyReasons.length === 0) return { signal: null, receipt: null };

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: 'statistical_uncertainty_assessment',
    inputs: {
      primaryPValue: r.primaryPValue,
      confidenceInterval: r.confidenceInterval,
      pointEstimate: r.pointEstimate,
      clinicalThreshold: r.clinicalThreshold,
    },
    outputs: {
      uncertaintyReasons,
      reasonCount: uncertaintyReasons.length,
    },
    thresholdApplied: `uncertainty_reasons > 0 (found ${uncertaintyReasons.length})`,
    thresholdMet: true,
    deterministicProof: `Statistical uncertainty detected: ${uncertaintyReasons.join('; ')}. No automated execution permitted — human biostatistician review required.`,
  };

  // Critical: NO auto-execute for uncertain results
  const actions: SignalAction[] = [
    {
      actionType: 'no_auto_execute',
      reason: `Low-confidence statistical result — automated action prohibited`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
    {
      actionType: 'require_human_review',
      reason: `Biostatistician must evaluate: ${uncertaintyReasons[0]}`,
      targetSystem: 'human_review_queue',
      executed: false,
    },
    {
      actionType: 'escalate_to_biostat',
      reason: `Statistical uncertainty requires domain expert judgment`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'statistical_uncertainty',
    severity,
    title: `Statistical Uncertainty: ${uncertaintyReasons.length} concern(s) — NO auto-execution`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'computed',
    createdAt: new Date(),
    status: 'active',
  };

  return { signal, receipt: buildReceipt(signal, req) };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 4: SAMPLE SIZE DRIFT
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateSampleSizeDrift(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  const pp = req.powerParams;
  if (!pp || !pp.enrolledN) return { signal: null, receipt: null };

  const drift = (pp.plannedN - pp.enrolledN) / pp.plannedN;
  if (drift <= 0.05) return { signal: null, receipt: null }; // Less than 5% under — not a signal

  const severity: SignalSeverity =
    drift >= 0.30 ? 'critical' :
    drift >= 0.15 ? 'high' :
    drift >= 0.10 ? 'medium' : 'low';

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: 'sample_size_drift_calculation',
    inputs: { plannedN: pp.plannedN, enrolledN: pp.enrolledN },
    outputs: { driftFraction: round(drift, 4), driftPercent: round(drift * 100, 1) },
    formula: `drift = (plannedN - enrolledN) / plannedN`,
    thresholdApplied: `drift (${round(drift * 100, 1)}%) > 5%`,
    thresholdMet: true,
    deterministicProof: `Enrolled ${pp.enrolledN} vs planned ${pp.plannedN} = ${round(drift * 100, 1)}% underenrollment. This reduces effective power.`,
  };

  const actions: SignalAction[] = [
    {
      actionType: 'generate_contradiction',
      reason: `Planned N (${pp.plannedN}) contradicts enrolled N (${pp.enrolledN})`,
      targetSystem: 'contradiction_engine',
      executed: false,
    },
    {
      actionType: 'update_assumption',
      reason: `Sample size assumption must be revised to ${pp.enrolledN}`,
      targetSystem: 'assumption_registry',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'sample_size_drift',
    severity,
    title: `Sample Size Drift: ${round(drift * 100, 1)}% underenrollment (${pp.enrolledN}/${pp.plannedN})`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'deterministic',
    createdAt: new Date(),
    status: 'active',
  };

  return { signal, receipt: buildReceipt(signal, req) };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 5: MULTIPLICITY GAP
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateMultiplicityGap(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  const m = req.multiplicity;
  if (!m) return { signal: null, receipt: null };
  if (m.numberOfComparisons <= 1) return { signal: null, receipt: null };

  const hasAdjustment = !!m.adjustmentMethod;
  if (hasAdjustment) return { signal: null, receipt: null };

  // No adjustment with multiple comparisons = signal
  const severity: SignalSeverity =
    m.numberOfComparisons >= 5 ? 'critical' :
    m.numberOfComparisons >= 3 ? 'high' : 'medium';

  const naiveAlpha = req.powerParams?.alpha ?? 0.05;
  const inflatedFWER = round(1 - Math.pow(1 - naiveAlpha, m.numberOfComparisons), 4);

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: 'multiplicity_fwer_check',
    inputs: { numberOfComparisons: m.numberOfComparisons, nominalAlpha: naiveAlpha, adjustmentMethod: 'NONE' },
    outputs: { inflatedFWER, bonferroniAlpha: round(naiveAlpha / m.numberOfComparisons, 4) },
    formula: `FWER = 1 - (1 - α)^k`,
    thresholdApplied: `no_adjustment AND comparisons (${m.numberOfComparisons}) > 1`,
    thresholdMet: true,
    deterministicProof: `${m.numberOfComparisons} comparisons without multiplicity adjustment. Familywise error rate inflated to ${round(inflatedFWER * 100, 1)}% (nominal ${naiveAlpha * 100}%). Bonferroni-corrected α would be ${round(naiveAlpha / m.numberOfComparisons, 4)}.`,
  };

  const actions: SignalAction[] = [
    {
      actionType: 'generate_contradiction',
      reason: `Claimed α=${naiveAlpha} but effective FWER=${inflatedFWER} due to ${m.numberOfComparisons} uncontrolled comparisons`,
      targetSystem: 'contradiction_engine',
      executed: false,
    },
    {
      actionType: 'flag_for_amendment',
      reason: `SAP must add multiplicity adjustment (Bonferroni, Holm, Hochberg, or graphical approach)`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'multiplicity_gap',
    severity,
    title: `Multiplicity Gap: ${m.numberOfComparisons} comparisons, no FWER control (inflated to ${round(inflatedFWER * 100, 1)}%)`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'deterministic',
    createdAt: new Date(),
    status: 'active',
  };

  return { signal, receipt: buildReceipt(signal, req) };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATOR 6: MISSING DATA RISK
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateMissingDataRisk(req: BiostatEvaluationRequest): {
  signal: BiostatSignal | null;
  receipt: SignalProofReceipt | null;
} {
  const md = req.missingData;
  if (!md) return { signal: null, receipt: null };

  const issues: string[] = [];
  let severity: SignalSeverity = 'low';

  // Check 1: Observed dropout exceeds assumed
  if (md.observedDropoutRate !== undefined && md.observedDropoutRate > md.assumedDropoutRate) {
    const excess = md.observedDropoutRate - md.assumedDropoutRate;
    issues.push(`Observed dropout (${round(md.observedDropoutRate * 100, 1)}%) exceeds assumed (${round(md.assumedDropoutRate * 100, 1)}%) by ${round(excess * 100, 1)}pp`);
    severity = severityMax(severity, excess >= 0.15 ? 'critical' : excess >= 0.10 ? 'high' : 'medium');
  }

  // Check 2: LOCF used (discouraged per ICH E9(R1))
  if (md.handlingMethod === 'LOCF') {
    issues.push(`LOCF used for missing data — ICH E9(R1) favors MMRM/MI approaches`);
    severity = severityMax(severity, 'high');
  }

  // Check 3: High absolute dropout
  if (md.assumedDropoutRate >= 0.25) {
    issues.push(`High assumed dropout rate (${round(md.assumedDropoutRate * 100, 1)}%) — sensitivity analyses critical`);
    severity = severityMax(severity, 'medium');
  }

  if (issues.length === 0) return { signal: null, receipt: null };

  const signalId = uuidv4();
  const computation: SignalComputation = {
    method: 'missing_data_risk_assessment',
    inputs: { assumedDropoutRate: md.assumedDropoutRate, observedDropoutRate: md.observedDropoutRate, handlingMethod: md.handlingMethod },
    outputs: { issues, issueCount: issues.length },
    thresholdApplied: `missing_data_issues > 0`,
    thresholdMet: true,
    deterministicProof: `Missing data risk: ${issues.join('; ')}.`,
  };

  const actions: SignalAction[] = [
    {
      actionType: 'update_assumption',
      reason: `Missing data assumptions need revision based on observed data`,
      targetSystem: 'assumption_registry',
      executed: false,
    },
    {
      actionType: severity === 'critical' ? 'flag_for_amendment' : 'require_human_review',
      reason: `Missing data handling may need protocol amendment`,
      targetSystem: 'resolution_orchestrator',
      executed: false,
    },
  ];

  const signal: BiostatSignal = {
    signalId,
    signalType: 'missing_data_risk',
    severity,
    title: `Missing Data Risk: ${issues.length} concern(s)`,
    description: computation.deterministicProof,
    organizationId: req.organizationId,
    projectId: req.projectId,
    studyId: req.studyId,
    sourceArtifacts: req.artifactRefs ?? [],
    affectedArtifacts: [],
    computation,
    actions,
    contradictionIds: [],
    evidenceClass: 'computed',
    createdAt: new Date(),
    status: 'active',
  };

  return { signal, receipt: buildReceipt(signal, req) };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function normalizeEndpointName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function severityMax(a: SignalSeverity, b: SignalSeverity): SignalSeverity {
  const order: SignalSeverity[] = ['low', 'medium', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function buildReceipt(signal: BiostatSignal, req: BiostatEvaluationRequest): SignalProofReceipt {
  return {
    receiptId: uuidv4(),
    signalId: signal.signalId,
    signalType: signal.signalType,
    severity: signal.severity,
    timestamp: signal.createdAt,
    projectId: req.projectId,
    organizationId: req.organizationId,
    evaluationContext: {
      studyPhase: req.studyDesign?.phase,
      indication: req.studyDesign?.indication,
      therapeuticArea: req.studyDesign?.therapeuticArea,
      regulatoryPath: req.studyDesign?.regulatoryPath,
    },
    computation: signal.computation,
    actionsTriggered: signal.actions,
    contradictionsCreated: [],
    assumptionsUpdated: [],
    resolutionPlansCreated: [],
    sourceArtifacts: signal.sourceArtifacts,
    affectedArtifacts: signal.affectedArtifacts,
  };
}
