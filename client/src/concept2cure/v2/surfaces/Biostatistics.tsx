import React, { useState, useMemo, useRef } from 'react';
import { I } from '../icons';
import { connected, useLiveRows, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { saveToAuthoring } from '../authoringHandoff';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ═══════════════════════════════════════════════════════════════════
   Biostatistics — a document-producing statistical workbench.

   The center of gravity is the DELIVERABLE: AnA generates the actual
   governed statistical document (real prose), regenerating live as the
   design changes. Computation engine + document generators ported
   verbatim from server/services/ana-biostats/*.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface BiostatInput {
  clientTrack: string;
  regulatoryBody?: string;
  studyType: string;
  objectiveType: string;
  endpointType: string;
  alpha: number;
  powerTarget: number;
  effectSize: number;
  variance?: number;
  attritionRate: number;
  allocationRatio: number;
  numberOfGroups?: number;
  numberOfEndpoints?: number;
  controlRate?: number;
  treatmentRate?: number;
  eventRate?: number;
  sensitivity?: number;
  specificity?: number;
  prevalence?: number;
  interimAnalyses?: number;
  nonInferiorityMargin?: number;
  equivalenceMargin?: number;
  comparatorType?: string;
  estimandStrategy?: string;
  missingDataMethod?: string;
  indication?: string;
  phase?: string;
}

interface Assumption {
  parameter: string;
  value: number;
  source: string;
  sensitivity: string;
}

interface ScenarioResult {
  label: string;
  sampleSize: { perGroup: number; total: number };
  power: number;
  delta: string;
  recommendation: string;
}

interface DiagnosticMetrics {
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
  nSens: number;
  nSpec: number;
}

interface BiostatResult {
  method: string;
  formula: string;
  testStatistic: string;
  criticalValue: number;
  sampleSize: { perGroup: number; total: number; groups: number };
  power: number;
  adjustedTotal: number;
  adjustedSampleSize: number;
  attritionAdjusted: boolean;
  events?: number;
  diagnosticMetrics?: DiagnosticMetrics;
  assumptions: Assumption[];
  scenarios: ScenarioResult[];
}

interface JudgmentDimension {
  name: string;
  verdict: string;
  score: number;
  flags: string[];
  rationale: string;
}

interface SensitiveParameter {
  parameter: string;
  currentValue: number;
  breakpointValue: number;
  percentMargin: number;
}

interface Fragility {
  fragilityIndex: number;
  category: string;
  margin: number;
  sensitiveParameters: SensitiveParameter[];
  narrative: string;
}

interface EndpointMethodFit {
  fit: string;
  currentMethod: string;
  suggestedMethod: string;
  rationale: string;
  alternatives: string[];
}

interface BiostatJudgment {
  overallVerdict: string;
  overallRisk: string;
  actionRecommendation: string;
  confidence: { level: string; score: number; factors: string[]; limitations: string[] };
  dimensions: JudgmentDimension[];
  endpointMethodFit: EndpointMethodFit;
  roleExplanations: Record<string, string>;
  escalationReasons: string[];
  fragility: Fragility;
}

interface DomainAdaptation {
  track: string;
  methodSuggestions: string[];
  designConsiderations: string[];
  riskFactors: string[];
  endpointGuidance: string[];
  regulatoryNotes: string[];
}

interface RegulatoryCustomization {
  body: string;
  statisticalExpectations: string[];
  guidanceReferences: string[];
  riskFramingNotes: string[];
  documentRequirements: string[];
  specificConstraints: string[];
  templateVariations: Record<string, unknown>;
}

interface DocDef {
  id: string;
  label: string;
  group: string;
  gen: (i: BiostatInput, c: BiostatResult, j: BiostatJudgment, d: DomainAdaptation, r: RegulatoryCustomization | undefined) => string;
  blurb: string;
}

interface BiostatPlan {
  id: string;
  study: string;
  // null when the clinical endpoint is not persisted on the artifact row —
  // the backend returns null rather than fabricating it (honest gap).
  endpoint: string | null;
  // null when statisticalDocumentType was not recorded on the artifact —
  // the backend returns null rather than guessing a document type.
  doc: string | null;
  status: string;
}

interface Preset {
  label: string;
  input: BiostatInput;
}

/* ─── Deterministic computation engine (computation-engine.ts) ─── */

const BiostatEngine = (() => {
  function normCdf(z: number): number {
    if (z < -8) return 0; if (z > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1, x = Math.abs(z) / Math.sqrt(2), t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }
  function normQuantile(p: number): number {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity; if (p === 0.5) return 0;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow; let q: number, r: number;
    if (p < pLow) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= pHigh) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  }
  function buildAssumptions(input: BiostatInput): Assumption[] {
    const A: Assumption[] = [];
    A.push({ parameter: 'alpha', value: input.alpha, source: input.alpha === 0.05 ? 'default' : 'user_provided', sensitivity: 'moderate' });
    A.push({ parameter: 'power', value: input.powerTarget, source: input.powerTarget === 0.80 ? 'default' : 'user_provided', sensitivity: 'high' });
    A.push({ parameter: 'effect_size', value: input.effectSize, source: 'user_provided', sensitivity: 'high' });
    if (input.variance !== undefined) A.push({ parameter: 'variance', value: input.variance, source: 'user_provided', sensitivity: 'high' });
    A.push({ parameter: 'attrition_rate', value: input.attritionRate, source: input.attritionRate === 0.15 ? 'default' : 'user_provided', sensitivity: 'moderate' });
    A.push({ parameter: 'allocation_ratio', value: input.allocationRatio, source: input.allocationRatio === 1 ? 'default' : 'user_provided', sensitivity: 'low' });
    if (input.controlRate !== undefined) A.push({ parameter: 'control_rate', value: input.controlRate, source: 'user_provided', sensitivity: 'high' });
    if (input.treatmentRate !== undefined) A.push({ parameter: 'treatment_rate', value: input.treatmentRate, source: 'user_provided', sensitivity: 'high' });
    if (input.eventRate !== undefined) A.push({ parameter: 'event_rate', value: input.eventRate, source: 'user_provided', sensitivity: 'high' });
    if (input.prevalence !== undefined) A.push({ parameter: 'prevalence', value: input.prevalence, source: 'user_provided', sensitivity: 'high' });
    return A;
  }

  interface ShapeInput {
    method: string;
    formula: string;
    testStatistic: string;
    criticalValue: number;
    perGroup: number;
    total: number;
    groups: number;
    power: number;
    adjPer: number;
    adjTotal: number;
    events?: number;
    diag?: DiagnosticMetrics;
    scenarios?: ScenarioResult[];
  }

  function scenarios(input: BiostatInput, type: string): ScenarioResult[] {
    const out: ScenarioResult[] = []; const mults = [0.75, 1.0, 1.25, 1.5];
    for (const mult of mults) {
      const mi = { ...input, effectSize: input.effectSize * mult };
      const zA = normQuantile(1 - mi.alpha / 2), zB = normQuantile(mi.powerTarget);
      const sigma = mi.variance ? Math.sqrt(mi.variance) : mi.effectSize; let n: number;
      if (type === 'binary') { const p1 = mi.controlRate ?? 0.5, p2 = p1 + mi.effectSize, pBar = (p1 + p2) / 2;
        n = Math.ceil(((zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / ((p2 - p1) ** 2)); }
      else if (type === 'time_to_event') { const hr = 1 - mi.effectSize, logHR = Math.log(hr > 0 ? hr : 0.5);
        const events = Math.ceil((zA + zB) ** 2 * 4 / (logHR * logHR)), er = mi.eventRate ?? 0.5; n = Math.ceil(events / er); }
      else { n = Math.ceil((2 * sigma * sigma * (zA + zB) ** 2) / (mi.effectSize * mi.effectSize)); }
      const adj = Math.ceil(n / (1 - mi.attritionRate));
      out.push({ label: mult === 1 ? 'Base case' : mult < 1 ? `Conservative (${(mult * 100) | 0}% effect)` : `Optimistic (${(mult * 100) | 0}% effect)`,
        sampleSize: { perGroup: Math.ceil(n / 2), total: adj }, power: mi.powerTarget, delta: `Effect = ${mi.effectSize.toFixed(3)}`,
        recommendation: mult < 1 ? 'Use for conservative planning' : mult > 1.25 ? 'May be overly optimistic' : '' });
    }
    return out;
  }
  function shape(input: BiostatInput, o: ShapeInput): BiostatResult {
    return { method: o.method, formula: o.formula, testStatistic: o.testStatistic, criticalValue: o.criticalValue,
      sampleSize: { perGroup: o.perGroup, total: o.total, groups: o.groups }, power: o.power,
      adjustedTotal: o.adjTotal, adjustedSampleSize: o.adjPer, attritionAdjusted: input.attritionRate > 0,
      events: o.events, diagnosticMetrics: o.diag, assumptions: buildAssumptions(input), scenarios: o.scenarios || [] };
  }
  function computeContinuous(input: BiostatInput): BiostatResult {
    const zA = normQuantile(1 - input.alpha / 2), zB = normQuantile(input.powerTarget);
    const sigma = input.variance ? Math.sqrt(input.variance) : input.effectSize, r = input.allocationRatio;
    let n: number, method: string, formula: string;
    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) { const delta = input.effectSize - input.nonInferiorityMargin;
      n = Math.ceil(((1 + 1 / r) * sigma * sigma * (zA + zB) ** 2) / (delta * delta)); method = 'Two-sample t-test (non-inferiority)'; formula = 'n = (1 + 1/r)*s^2*(z_a + z_b)^2 / (d - D_NI)^2'; }
    else if (input.studyType === 'equivalence' && input.equivalenceMargin) {
      n = Math.ceil(((1 + 1 / r) * sigma * sigma * (zA + zB) ** 2) / (input.equivalenceMargin * input.equivalenceMargin)); method = 'TOST equivalence test'; formula = 'n = (1 + 1/r)*s^2*(z_a + z_b)^2 / D_eq^2'; }
    else { n = Math.ceil(((1 + 1 / r) * sigma * sigma * (zA + zB) ** 2) / (input.effectSize * input.effectSize)); method = 'Two-sample t-test (superiority)'; formula = `n = (1 + 1/r)*s^2*(z_a + z_b)^2 / d^2  (s=${sigma.toFixed(2)})`; }
    const groups = input.numberOfGroups ?? 2, total = n * groups, adjPer = Math.ceil(n / (1 - input.attritionRate)), adjTotal = adjPer * groups;
    const se = sigma * Math.sqrt(1 / n + 1 / (n * r)); const power = Math.min(normCdf(input.effectSize / se - zA) + normCdf(-input.effectSize / se - zA), 0.9999);
    return shape(input, { method, perGroup: n, total, groups, power, adjPer, adjTotal, criticalValue: zA, testStatistic: 't-test', formula, scenarios: scenarios(input, 'continuous') });
  }
  function computeBinary(input: BiostatInput): BiostatResult {
    const zA = normQuantile(1 - input.alpha / 2), zB = normQuantile(input.powerTarget), r = input.allocationRatio;
    const p1 = input.controlRate ?? 0.5, p2 = input.treatmentRate ?? (p1 + input.effectSize), pBar = (p1 + r * p2) / (1 + r);
    let n: number, method: string, formula: string;
    if (input.studyType === 'non_inferiority' && input.nonInferiorityMargin) { const delta = (p2 - p1) - input.nonInferiorityMargin, v = p1 * (1 - p1) + p2 * (1 - p2) / r;
      n = Math.ceil((zA + zB) ** 2 * v / (delta * delta)); method = 'Two-proportion z-test (non-inferiority)'; formula = 'n = (z_a + z_b)^2*[p1(1-p1) + p2(1-p2)/r] / (d - D_NI)^2'; }
    else { n = Math.ceil(((zA * Math.sqrt((1 + 1 / r) * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2) / r)) ** 2) / ((p2 - p1) ** 2)); method = 'Two-proportion z-test (superiority)'; formula = `n = [z_a*sqrt((1+1/r)*pbar*(1-pbar)) + z_b*sqrt(p1*(1-p1)+p2*(1-p2)/r)]^2 / (p2-p1)^2  (p1=${p1}, p2=${p2.toFixed(2)})`; }
    const groups = input.numberOfGroups ?? 2, total = n * groups, adjPer = Math.ceil(n / (1 - input.attritionRate)), adjTotal = adjPer * groups;
    return shape(input, { method, perGroup: n, total, groups, power: input.powerTarget, adjPer, adjTotal, criticalValue: zA, testStatistic: 'z-test', formula, scenarios: scenarios(input, 'binary') });
  }
  function computeSurvival(input: BiostatInput): BiostatResult {
    const zA = normQuantile(1 - input.alpha / 2), zB = normQuantile(input.powerTarget), r = input.allocationRatio;
    const hr = 1 - input.effectSize, logHR = Math.log(hr > 0 ? hr : 0.5);
    const events = Math.ceil(((zA + zB) ** 2 * (1 + r) ** 2) / (r * logHR * logHR));
    const er = input.eventRate ?? 0.5, n = Math.ceil(events / (2 * er));
    const groups = input.numberOfGroups ?? 2, total = n * groups, adjPer = Math.ceil(n / (1 - input.attritionRate)), adjTotal = adjPer * groups;
    return shape(input, { method: 'Log-rank test (Schoenfeld formula)', perGroup: n, total, groups, power: input.powerTarget, adjPer, adjTotal, events, criticalValue: zA, testStatistic: 'Log-rank', formula: `Events = (z_a + z_b)^2*(1+r)^2 / (r*ln(HR)^2)  (HR=${hr.toFixed(2)}, events=${events})`, scenarios: scenarios(input, 'time_to_event') });
  }
  function computeDevicePerformance(input: BiostatInput): BiostatResult {
    const zA = normQuantile(1 - input.alpha), zB = normQuantile(input.powerTarget);
    const pg = input.controlRate ?? 0.85, expected = input.treatmentRate ?? (pg + input.effectSize);
    const n = Math.ceil((zA * Math.sqrt(pg * (1 - pg)) + zB * Math.sqrt(expected * (1 - expected))) ** 2 / ((expected - pg) ** 2)), adjN = Math.ceil(n / (1 - input.attritionRate));
    return shape(input, { method: 'Performance goal test (single-arm)', perGroup: n, total: n, groups: 1, power: input.powerTarget, adjPer: adjN, adjTotal: adjN, criticalValue: zA, testStatistic: 'z-test (one-sided)', formula: `n = [z_a*sqrt(PG(1-PG)) + z_b*sqrt(p(1-p))]^2 / (p-PG)^2  (PG=${pg}, p=${expected.toFixed(2)})`, scenarios: scenarios(input, 'binary') });
  }
  function computeDiagnostic(input: BiostatInput): BiostatResult {
    const zA = normQuantile(1 - input.alpha / 2), zB = normQuantile(input.powerTarget);
    const sens = input.sensitivity ?? 0.90, spec = input.specificity ?? 0.90, prev = input.prevalence ?? 0.50;
    const nSens = Math.ceil((zA + zB) ** 2 * sens * (1 - sens) / (0.05 ** 2)), nSpec = Math.ceil((zA + zB) ** 2 * spec * (1 - spec) / (0.05 ** 2));
    const total = Math.ceil(Math.max(nSens / prev, nSpec / (1 - prev))), adjTotal = Math.ceil(total / (1 - input.attritionRate));
    const ppv = (sens * prev) / (sens * prev + (1 - spec) * (1 - prev)), npv = (spec * (1 - prev)) / (spec * (1 - prev) + (1 - sens) * prev);
    return shape(input, { method: 'Diagnostic accuracy study (sensitivity/specificity)', perGroup: total, total, groups: 1, power: input.powerTarget, adjPer: adjTotal, adjTotal, criticalValue: zA, testStatistic: 'Exact binomial / Clopper-Pearson', formula: `n_sens = (z_a+z_b)^2*Se(1-Se)/w^2  *  n_spec = (z_a+z_b)^2*Sp(1-Sp)/w^2  (prev=${prev})`, diag: { sensitivity: sens, specificity: spec, ppv: Math.round(ppv * 1e4) / 1e4, npv: Math.round(npv * 1e4) / 1e4, nSens, nSpec } });
  }
  function compute(input: BiostatInput): BiostatResult {
    if (input.clientTrack === 'diagnostics_ivd' && ['diagnostic_accuracy', 'agreement'].includes(input.studyType)) return computeDiagnostic(input);
    if (input.clientTrack === 'medical_device' && input.studyType === 'performance') return computeDevicePerformance(input);
    if (input.endpointType === 'binary') return computeBinary(input);
    if (input.endpointType === 'time_to_event') return computeSurvival(input);
    return computeContinuous(input);
  }

  /* Layer-3 judgment -- deterministic, rule-backed */
  function judge(input: BiostatInput, res: BiostatResult): BiostatJudgment {
    const dims: JudgmentDimension[] = [];
    const pv = res.power >= input.powerTarget - 0.005 ? 'adequate' : res.power >= input.powerTarget - 0.05 ? 'marginal' : 'inadequate';
    dims.push({ name: 'Power adequacy', verdict: pv, score: Math.round(res.power * 100), flags: pv === 'adequate' ? [] : ['Achieved power below target'], rationale: `Achieved power ${(res.power * 100).toFixed(1)}% vs target ${(input.powerTarget * 100) | 0}%.` });
    dims.push({ name: 'Effect-size assumption', verdict: 'marginal', score: 60, flags: ['Single most sensitive input'], rationale: `Effect size ${input.effectSize} drives N; verify against prior evidence.` });
    const fv = res.adjustedTotal <= 300 ? 'adequate' : res.adjustedTotal <= 800 ? 'marginal' : 'inadequate';
    dims.push({ name: 'Enrollment feasibility', verdict: fv, score: fv === 'adequate' ? 85 : fv === 'marginal' ? 60 : 35, flags: fv === 'inadequate' ? ['Large N — feasibility risk'] : [], rationale: `${res.adjustedTotal} subjects after ${(input.attritionRate * 100) | 0}% attrition.` });
    let bp = input.effectSize; for (let f = 1; f > 0.5; f -= 0.01) { const r2 = compute({ ...input, effectSize: input.effectSize * f }); if (r2.sampleSize.total > res.sampleSize.total * 1.15) { bp = input.effectSize * f; break; } }
    const margin = Math.round((1 - bp / input.effectSize) * 100);
    const cat = margin >= 20 ? 'robust' : margin >= 12 ? 'moderate' : margin >= 6 ? 'fragile' : 'very_fragile';
    const worst = dims.some(d => d.verdict === 'inadequate') ? 'inadequate' : dims.some(d => d.verdict === 'marginal') ? 'marginal' : 'adequate';
    const action = worst === 'inadequate' ? 'revise' : worst === 'marginal' ? 'proceed_with_conditions' : 'proceed';
    const risk = worst === 'inadequate' ? 'high' : worst === 'marginal' ? 'moderate' : 'low';
    const endpointMethodFit = { fit: 'acceptable', currentMethod: res.method,
      suggestedMethod: input.endpointType === 'time_to_event' ? 'Cox proportional hazards (confirmatory)' : input.endpointType === 'binary' ? 'Logistic regression (covariate-adjusted)' : 'ANCOVA (baseline-adjusted)',
      rationale: `${res.method} is appropriate for a ${input.endpointType} endpoint in a ${input.studyType} design; a covariate-adjusted model is recommended as the confirmatory analysis.`,
      alternatives: input.endpointType === 'time_to_event' ? ['Stratified log-rank', 'RMST difference'] : input.endpointType === 'binary' ? ['Cochran-Mantel-Haenszel', 'Fisher exact (small N)'] : ['MMRM (longitudinal)', 'Rank-based (non-normal)'] };
    const limitations: string[] = []; if (pv !== 'adequate') limitations.push('Achieved power is below the stated target at the current assumptions.');
    if (cat === 'fragile' || cat === 'very_fragile') limitations.push('The design is sensitive to the assumed effect size — small overestimation materially reduces power.');
    if (!input.variance && input.endpointType === 'continuous') limitations.push('Variance was assumed rather than sourced from prior data.');
    if (fv === 'inadequate') limitations.push('Enrollment target is large; site capacity and timelines should be confirmed.');
    const escalation: string[] = []; if (worst === 'inadequate') escalation.push('Design is underpowered at current assumptions — revise before finalizing.');
    if (cat === 'very_fragile') escalation.push('Very fragile to effect-size assumption — add a blinded sample-size re-estimation.');
    const conf = { level: worst === 'adequate' ? 'high' : worst === 'marginal' ? 'moderate' : 'low', score: worst === 'adequate' ? 86 : worst === 'marginal' ? 64 : 42, factors: ['Deterministic computation', 'Rule-backed judgment'], limitations };
    const nm = input.indication || 'the study';
    const roleExplanations: Record<string, string> = {
      executive: `The ${input.studyType} design needs about ${res.adjustedTotal} subjects for ${(res.power * 100).toFixed(0)}% power. Overall this design is ${worst}; recommendation is to ${action.replace(/_/g, ' ')}. ${worst !== 'adequate' ? 'A design adjustment now avoids a costly under-powered trial later.' : 'The plan is defensible for ' + (input.regulatoryBody || 'the agency') + '.'}`,
      clinical: `To detect the expected effect (${input.effectSize}) in ${nm}, enroll ${res.adjustedTotal} subjects (${res.sampleSize.perGroup}/arm). ${res.events ? `This is event-driven -- ${res.events} events are required, so follow-up duration matters as much as enrollment.` : ''} Watch the effect-size assumption; it is the biggest lever.`,
      regulatory: `The sample-size justification uses ${res.method} at a=${input.alpha} (two-sided) with ${(res.power * 100).toFixed(1)}% power, consistent with ${input.regulatoryBody || 'FDA'} expectations. Pre-specify the estimand (ICH E9(R1)) and the missing-data strategy in the SAP before database lock.`,
      technical: `${res.method}. ${res.formula} Attrition-adjusted total ${res.adjustedTotal}. Fragility ${cat} (index ${100 - margin}); ~${margin}% effect-size margin before N must grow >15% to hold power.`,
    };
    return { overallVerdict: worst, overallRisk: risk, actionRecommendation: action, confidence: conf, dimensions: dims, endpointMethodFit, roleExplanations, escalationReasons: escalation,
      fragility: { fragilityIndex: 100 - margin, category: cat, margin, sensitiveParameters: [{ parameter: 'effect_size', currentValue: input.effectSize, breakpointValue: Math.round(bp * 1000) / 1000, percentMargin: margin }],
        narrative: `The design tolerates about a ${margin}% shrink in the assumed effect before the required N grows more than 15% to preserve power — classified ${cat.replace('_', ' ')}.` } };
  }
  return { normCdf, normQuantile, compute, judge };
})();

/* ─── Domain adaptation + regulatory customization (deterministic) ─── */
function domainAdapt(input: BiostatInput): DomainAdaptation {
  const T: Record<string, Omit<DomainAdaptation, 'track' | 'endpointGuidance' | 'regulatoryNotes'>> = {
    biotech_pharma: {
      methodSuggestions: ['Pre-specify the estimand per ICH E9(R1)', 'Covariate-adjusted primary model (ANCOVA / Cox / logistic)', 'Blinded sample-size re-estimation if variance is uncertain'],
      designConsiderations: ['Randomization stratified by key prognostic factors', 'ITT as primary population; PP supportive', 'Define a testing hierarchy for key secondary endpoints'],
      riskFactors: ['Effect-size overestimation from small early studies', 'Higher-than-assumed dropout in long follow-up', 'Multiplicity from multiple endpoints'],
    },
    medical_device: {
      methodSuggestions: ['Performance-goal justification from literature/registry', 'Blinded independent endpoint adjudication where feasible'],
      designConsiderations: ['Single-arm vs. performance-standard framing', 'Human-factors and use-related risk in the plan'],
      riskFactors: ['Learning-curve confounding', 'Operator variability'],
    },
    diagnostics_ivd: {
      methodSuggestions: ['Power sensitivity AND specificity independently', 'Report PPV/NPV at the intended-use prevalence', 'Clopper-Pearson exact CIs'],
      designConsiderations: ['Enrichment for low-prevalence targets', 'Reference-standard definition and adjudication'],
      riskFactors: ['Spectrum bias', 'Prevalence mismatch vs. intended use'],
    },
  };
  return { track: input.clientTrack, ...(T[input.clientTrack] || T.biotech_pharma), endpointGuidance: [], regulatoryNotes: [] };
}
function regCustom(input: BiostatInput): RegulatoryCustomization | undefined {
  if (!input.regulatoryBody) return undefined;
  const B: Record<string, Omit<RegulatoryCustomization, 'body' | 'documentRequirements' | 'specificConstraints' | 'templateVariations'>> = {
    FDA: { statisticalExpectations: ['Pre-specified SAP finalized before unblinding', 'ICH E9(R1) estimand framework', 'Multiplicity control for the confirmatory family', 'Sensitivity analyses for missing data (tipping point)'], guidanceReferences: ['FDA Multiple Endpoints Guidance (2022)', 'ICH E9 / E9(R1)', 'FDA Adaptive Designs Guidance (2019)'], riskFramingNotes: ['Reviewers scrutinize the effect-size basis', 'Non-inferiority margins must be clinically and statistically justified'] },
    EMA: { statisticalExpectations: ['CHMP points-to-consider on the primary analysis', 'Estimand and intercurrent-event strategy pre-specified', 'Sensitivity/supplementary analyses aligned to the estimand'], guidanceReferences: ['EMA Guideline on Multiplicity (2017)', 'ICH E9(R1)', 'CHMP Points to Consider on adjustment for baseline'], riskFramingNotes: ['Day-120 questions often target the estimand and missing data'] },
    PMDA: { statisticalExpectations: ['Bridging/consistency considerations for Japanese subpopulation', 'Pre-specified analysis populations'], guidanceReferences: ['ICH E9 / E17', 'PMDA statistical review expectations'], riskFramingNotes: ['Consistency of effect across regions is examined'] },
  };
  const b = B[input.regulatoryBody] || B.FDA; return { body: input.regulatoryBody, ...b, documentRequirements: [], specificConstraints: [], templateVariations: {} };
}

/* ─── Governed document generators (document-generator.ts) ─── */

const BiostatDocs = (() => {
  const V = '1.0.0';
  const foot = () => `\n---\n*Generated by AnA Biostats Engine v${V}. All numeric results are deterministic. Judgment and framing are rule-backed. Review by a qualified biostatistician before regulatory submission.*\n`;
  const track = (t: string) => t === 'biotech_pharma' ? 'Pharma/Biotech' : t === 'medical_device' ? 'Medical Device' : t === 'diagnostics_ivd' ? 'Diagnostics/IVD' : t;

  type GenFn = (i: BiostatInput, c: BiostatResult, j: BiostatJudgment, d: DomainAdaptation, r: RegulatoryCustomization | undefined) => string;

  const sampleSizeRationale: GenFn = (i, c, j, _d, r) => {
    const n = c.adjustedTotal ?? c.sampleSize.total, body = (r && r.body) || 'FDA'; let s = `# Sample Size Rationale\n\n## Study Context\n- **Track**: ${track(i.clientTrack)}\n- **Study Type**: ${i.studyType}\n- **Endpoint Type**: ${i.endpointType}\n- **Objective**: ${i.objectiveType}\n`;
    if (i.indication) s += `- **Indication**: ${i.indication}\n`; if (i.phase) s += `- **Phase**: ${i.phase}\n`; s += `- **Target Regulatory Body**: ${body}\n\n## Sample Size Determination\n\n### Statistical Method\n${c.method}\n\n### Formula\n${c.formula}\n\n### Assumptions\n\n| Parameter | Value | Source | Sensitivity |\n|---|---|---|---|\n`;
    for (const a of c.assumptions) s += `| ${a.parameter} | ${a.value} | ${a.source} | ${a.sensitivity} |\n`;
    s += `\n### Result\n\n- **Sample size per group**: ${c.sampleSize.perGroup}\n- **Number of groups**: ${c.sampleSize.groups}\n- **Total (unadjusted)**: ${c.sampleSize.total}\n- **Dropout adjustment**: ${(i.attritionRate * 100).toFixed(0)}%\n- **Total (adjusted)**: ${n}\n- **Achieved power**: ${(c.power * 100).toFixed(1)}%\n- **Significance level**: ${i.alpha} (two-sided)\n\n`;
    if (c.diagnosticMetrics) { const m = c.diagnosticMetrics; s += `### Diagnostic Performance\n\n- **Sensitivity**: ${(m.sensitivity * 100).toFixed(1)}%\n- **Specificity**: ${(m.specificity * 100).toFixed(1)}%\n- **PPV**: ${(m.ppv * 100).toFixed(1)}%\n- **NPV**: ${(m.npv * 100).toFixed(1)}%\n\n`; }
    if (c.scenarios && c.scenarios.length) { s += `### Scenario Analysis\n\n| Scenario | Sample Size (total) | Power | Notes |\n|---|---|---|---|\n`; for (const x of c.scenarios) s += `| ${x.label} | ${x.sampleSize.total} | ${(x.power * 100).toFixed(0)}% | ${x.delta} |\n`; s += `\n`; }
    s += `## Statistical Assessment\n\n- **Overall Verdict**: ${j.overallVerdict}\n- **Action Recommendation**: ${j.actionRecommendation}\n- **Fragility**: ${j.fragility.category} (index: ${j.fragility.fragilityIndex})\n- **Confidence Level**: ${j.confidence.level} (${j.confidence.score}/100)\n\n`;
    if (j.fragility.sensitiveParameters.length) { s += `### Sensitivity Points\n\n`; for (const sp of j.fragility.sensitiveParameters) s += `- **${sp.parameter}**: current=${sp.currentValue}, breakpoint=${sp.breakpointValue} (${sp.percentMargin}% margin)\n`; s += `\n`; }
    if (j.confidence.limitations.length) { s += `## Limitations\n\n`; for (const l of j.confidence.limitations) s += `- ${l}\n`; s += `\n`; }
    if (r && r.statisticalExpectations.length) { s += `## Regulatory Considerations (${body})\n\n`; for (const e of r.statisticalExpectations.slice(0, 5)) s += `- ${e}\n`; s += `\n`; }
    return s + foot();
  };
  const riskMemo: GenFn = (i, c, j, d, r) => { let s = `# Statistical Risk Memo\n\n## Executive Summary\n\n${j.roleExplanations.executive}\n\n## Risk Classification\n\n- **Overall Risk**: ${j.overallRisk}\n- **Action**: ${j.actionRecommendation}\n- **Confidence**: ${j.confidence.level}\n\n## Dimension Analysis\n\n| Dimension | Verdict | Score | Key Flags |\n|---|---|---|---|\n`;
    for (const dm of j.dimensions) s += `| ${dm.name} | ${dm.verdict} | ${dm.score}/100 | ${dm.flags.join('; ') || 'None'} |\n`;
    s += `\n## Fragility Assessment\n\n${j.fragility.narrative}\n\n## Endpoint-Method Fit\n\n- **Fit**: ${j.endpointMethodFit.fit}\n- **Current Method**: ${j.endpointMethodFit.currentMethod}\n- **Suggested Method**: ${j.endpointMethodFit.suggestedMethod}\n- **Rationale**: ${j.endpointMethodFit.rationale}\n\n`;
    if (j.escalationReasons.length) { s += `## Escalation Items\n\n`; for (const e of j.escalationReasons) s += `- ${e}\n`; s += `\n`; }
    if (d.riskFactors.length) { s += `## Domain-Specific Risks (${track(i.clientTrack)})\n\n`; for (const rf of d.riskFactors) s += `- ${rf}\n`; s += `\n`; }
    if (r && r.riskFramingNotes.length) { s += `## Regulatory Risk Framing (${r.body})\n\n`; for (const n of r.riskFramingNotes) s += `- ${n}\n`; s += `\n`; }
    s += `## Role-Specific Interpretations\n\n### For Clinical Team\n${j.roleExplanations.clinical}\n\n### For Regulatory Affairs\n${j.roleExplanations.regulatory}\n\n### For Biostatistics\n${j.roleExplanations.technical}\n\n`;
    return s + foot();
  };
  const sapSection: GenFn = (i, c, j, _d, r) => { const n = c.adjustedTotal ?? c.sampleSize.total; let s = `# Statistical Analysis Plan — Section Draft\n\n## 1. Study Objectives and Endpoints\n\n### Primary Objective\n${i.objectiveType} assessment using ${i.endpointType} endpoint.\n\n### Primary Endpoint\nType: ${i.endpointType}. Study type: ${i.studyType}.\n\n## 2. Study Design\n\n- Design: ${i.studyType}\n- Groups: ${i.numberOfGroups ?? 2}\n- Allocation ratio: ${i.allocationRatio}:1\n- Comparator: ${i.comparatorType ?? 'placebo'}\n\n## 3. Sample Size Determination\n\nA sample size of ${n} subjects (${c.sampleSize.perGroup} per group) provides ${(c.power * 100).toFixed(1)}% power to detect a ${i.effectSize} ${i.endpointType === 'binary' ? 'difference in proportions' : i.endpointType === 'time_to_event' ? 'hazard ratio reduction' : 'effect size'} at a two-sided significance level of ${i.alpha}.\n\n${c.formula}\n\nAn attrition rate of ${(i.attritionRate * 100).toFixed(0)}% is assumed, yielding an adjusted total of ${n} subjects.\n\n## 4. Statistical Methods\n\n### Primary Analysis\n${c.method}\n\n### Endpoint-Method Assessment\n${j.endpointMethodFit.rationale}\n\n### Alternative Methods\n`;
    for (const a of j.endpointMethodFit.alternatives) s += `- ${a}\n`;
    s += `\n## 5. Significance Level and Multiplicity\n\nTwo-sided significance level: a = ${i.alpha}.\n\n## 6. Estimand Framework\n\n${i.estimandStrategy ? `### Estimand Strategy: ${i.estimandStrategy}\n\nPer ICH E9(R1): population, variable (${i.endpointType}), intercurrent-event handling (${i.estimandStrategy}), summary measure.` : 'Estimand framework should be defined per ICH E9(R1) prior to study conduct.'}\n\n## 7. Missing Data Handling\n\n${i.missingDataMethod ? `Primary approach: ${i.missingDataMethod}.` : 'Pre-specify the missing-data method (MMRM for longitudinal; multiple imputation otherwise).'}\n\n## 8. Sensitivity Analyses\n\n- Tipping point analysis for missing data\n- ITT vs. PP concordance\n`;
    if (j.fragility.category !== 'robust') s += `- Effect-size sensitivity (fragility index ${j.fragility.fragilityIndex})\n`;
    return s + `\n` + foot();
  };
  const fullSAP: GenFn = (i, c, j, _d, r) => { const n = c.adjustedTotal ?? c.sampleSize.total, body = (r && r.body) || i.regulatoryBody || 'FDA'; let s = `# Statistical Analysis Plan\n\n*${track(i.clientTrack)} -- ${i.studyType} -- ${i.objectiveType}*\n\n## 1. Introduction\n\nThis Statistical Analysis Plan (SAP) specifies the analyses for a ${i.studyType} study with a ${i.endpointType} primary endpoint. It is written to ${body} expectations and should be finalized and signed prior to database lock and unblinding.\n\n## 2. Study Objectives and Endpoints\n\n- **Primary objective**: ${i.objectiveType} evaluation via the ${i.endpointType} primary endpoint.\n- **Study type**: ${i.studyType}${i.nonInferiorityMargin ? ` (non-inferiority margin ${i.nonInferiorityMargin})` : ''}${i.equivalenceMargin ? ` (equivalence margin ${i.equivalenceMargin})` : ''}.\n\n## 3. Study Design\n\n- Design: ${i.studyType}\n- Number of groups: ${i.numberOfGroups ?? 2}\n- Allocation ratio: ${i.allocationRatio}:1\n- Comparator: ${i.comparatorType ?? 'placebo'}\n\n## 4. Analysis Populations\n\n- **Intention-to-treat (ITT)**: all randomized subjects, analyzed as randomized. Primary population for efficacy.\n- **Per-protocol (PP)**: subjects without major protocol deviations. ${i.studyType === 'non_inferiority' || i.studyType === 'equivalence' ? 'Co-primary for non-inferiority/equivalence per ICH E9.' : 'Supportive.'}\n- **Safety**: all subjects who received any study intervention, analyzed as treated.\n\n## 5. Sample Size Determination\n\nA total of **${n} subjects** (${c.sampleSize.perGroup} per group) provides **${(c.power * 100).toFixed(1)}% power** at a two-sided a = ${i.alpha} to detect the planned effect (${i.effectSize}).\n\n${c.formula}\n\nAssumed attrition: ${(i.attritionRate * 100).toFixed(0)}%.\n\n## 6. Primary Analysis Method\n\n${c.method}\n\n*Endpoint-method fit*: ${j.endpointMethodFit.rationale}\n\n## 7. Multiplicity\n\nSingle primary endpoint — no multiplicity adjustment required for the primary comparison. Pre-specify a testing hierarchy for key secondary endpoints.\n\n## 8. Estimand (ICH E9(R1))\n\n${i.estimandStrategy ? `Strategy for intercurrent events: **${i.estimandStrategy}**. Define population, variable (${i.endpointType}), intercurrent-event handling, and population-level summary measure explicitly.` : 'Define the estimand (population, variable, intercurrent-event strategy, summary measure) before study conduct per ICH E9(R1).'}\n\n## 9. Missing Data\n\n${i.missingDataMethod ? `Primary approach: **${i.missingDataMethod}**, with a tipping-point sensitivity analysis.` : 'Pre-specify the missing-data approach (e.g. MMRM for longitudinal endpoints, multiple imputation otherwise) and a tipping-point sensitivity analysis.'}\n\n## 10. Sensitivity Analyses\n\n- Tipping-point analysis for missing-data assumptions\n- ITT vs PP concordance\n`;
    if (j.fragility.category !== 'robust') s += `- Effect-size sensitivity (fragility index ${j.fragility.fragilityIndex})\n`;
    s += `\n## 11. Interim Analyses\n\n${i.interimAnalyses && i.interimAnalyses > 0 ? `${i.interimAnalyses} planned interim ${i.interimAnalyses === 1 ? 'analysis' : 'analyses'} governed by a pre-specified alpha-spending function (e.g. O'Brien-Fleming). See the Interim Analysis Plan and DSMB Charter.` : 'No interim efficacy analyses planned. Safety monitoring per the DSMB charter, if applicable.'}\n\n## 12. Planned Outputs\n\nTables, listings and figures are specified in the TLF Shell Plan. Disposition, demographics, primary/secondary efficacy, and safety summaries are mandatory.\n\n`;
    return s + foot();
  };
  const protocolSection: GenFn = (i, c, j, _d, _r) => { let s = `# Protocol — Statistical Considerations\n\n## Statistical Hypotheses\n\n`;
    if (i.studyType === 'superiority') s += `H0: No difference between treatment groups.\nH1: Treatment is superior to control.\n\n`;
    else if (i.studyType === 'non_inferiority') s += `H0: Treatment is inferior to control by more than the non-inferiority margin (${i.nonInferiorityMargin}).\nH1: Treatment is non-inferior to control.\n\n`;
    else if (i.studyType === 'equivalence') s += `H0: Treatment and control differ by more than the equivalence margin (+/-${i.equivalenceMargin}).\nH1: Treatment and control are equivalent.\n\n`;
    else s += `Hypotheses per the study objective (${i.objectiveType}).\n\n`;
    s += `## Sample Size\n\n${c.adjustedTotal ?? c.sampleSize.total} subjects (${c.sampleSize.perGroup} per group) provide ${(c.power * 100).toFixed(1)}% power at a=${i.alpha} (two-sided) to detect an effect size of ${i.effectSize}.\n\n## Primary Analysis\n\n${c.method}. Significance level: a = ${i.alpha} (two-sided).\n\n## Analysis Populations\n\n- **Full Analysis Set (FAS/ITT)**: All randomized subjects\n- **Per-Protocol (PP)**: Subjects completing without major deviations\n- **Safety Population**: All subjects receiving at least one dose\n\n`;
    return s + foot();
  };
  const csrMethods: GenFn = (i, c, j, _d, _r) => { const n = c.adjustedTotal ?? c.sampleSize.total; let s = `# Statistical Methods (CSR S9.7, ICH E3)\n\n## 9.7.1 Statistical and Analytical Plans\n\nThe study was a ${i.studyType} design with a ${i.endpointType} primary endpoint analyzed by ${c.method}. Analyses followed the pre-specified SAP.\n\n## 9.7.1.1 Analysis Populations\n\nEfficacy was analyzed on the ITT population; the PP population was supportive. Safety was summarized on the as-treated population.\n\n## 9.7.1.2 Primary Endpoint Analysis\n\nThe primary endpoint was compared between arms using ${c.method} at a two-sided a = ${i.alpha}. The point estimate is reported with its ${((1 - i.alpha) * 100).toFixed(0)}% confidence interval.\n\n## 9.7.1.3 Sample Size\n\nThe planned sample size of ${n} (${c.sampleSize.perGroup}/group) provided ${(c.power * 100).toFixed(1)}% power. ${c.formula}\n\n## 9.7.2 Multiplicity\n\nA single primary comparison was performed; secondary endpoints were tested within a pre-specified hierarchy.\n\n## 9.7.3 Handling of Missing Data\n\n${i.missingDataMethod ? `Missing data were handled by ${i.missingDataMethod}, with tipping-point sensitivity analyses.` : 'Missing data were handled per the pre-specified SAP approach with sensitivity analyses.'}\n\n## 9.7.4 Interim Analyses\n\n${i.interimAnalyses && i.interimAnalyses > 0 ? `${i.interimAnalyses} interim ${i.interimAnalyses === 1 ? 'analysis was' : 'analyses were'} conducted under a pre-specified alpha-spending function with DSMB oversight.` : 'No interim efficacy analyses were conducted.'}\n\n`;
    if (j.fragility.category !== 'robust') s += `## 9.7.5 Robustness\n\nResult robustness was assessed (fragility index ${j.fragility.fragilityIndex}); conclusions were examined under alternative assumptions.\n\n`;
    return s + foot();
  };
  const dsmbCharter: GenFn = (i, c, _j, _d, r) => { let s = `# Data Safety Monitoring Board (DSMB) Charter\n\n## 1. Purpose and Scope\n\nThe DSMB (also DMC) safeguards the safety and interests of subjects in this ${i.studyType} study (target N = ${c.adjustedTotal ?? c.sampleSize.total}) and the integrity of the trial. It operates independently of the sponsor and investigators.\n\n## 2. Membership\n\n- Independent clinician(s) with relevant therapeutic expertise\n- Independent biostatistician\n- A chair with prior DSMB experience\n\nMembers have no competing financial or intellectual interests in the outcome.\n\n## 3. Responsibilities\n\n- Review accumulating safety data at pre-specified intervals\n- Review interim efficacy at planned looks (see Interim Analysis Plan)\n- Recommend continue / modify / pause / stop\n\n## 4. Meetings\n\n- **Organizational** (before first subject)\n- **Periodic safety reviews** (by enrollment/exposure milestones)\n- **Interim analyses**: ${i.interimAnalyses && i.interimAnalyses > 0 ? `${i.interimAnalyses} planned` : 'safety-only unless protocol specifies efficacy looks'}\n\n## 5. Open and Closed Sessions\n\nOpen sessions include the sponsor (blinded). Closed sessions are restricted to voting members and the independent unblinded statistician who presents by-arm data.\n\n## 6. Statistical Support and Stopping Guidance\n\nAn independent unblinded statistician prepares closed reports. Formal efficacy stopping follows the pre-specified group-sequential boundaries; safety stopping is at DSMB discretion.${r ? ` Aligns with ${r.body} expectations for independent data monitoring.` : ''}\n\n## 7. Confidentiality\n\nInterim by-arm results are confidential to the DSMB until the board recommends otherwise, to protect trial integrity.\n\n`;
    return s + foot();
  };
  const interimPlan: GenFn = (i, c, _j, _d, r) => { const k = i.interimAnalyses && i.interimAnalyses > 0 ? i.interimAnalyses : 1, n = c.adjustedTotal ?? c.sampleSize.total; let s = `# Interim Analysis Plan\n\n## 1. Purpose\n\nThis plan governs ${k} planned interim ${k === 1 ? 'analysis' : 'analyses'} for a ${i.studyType} study (target N = ${n}, ${(c.power * 100).toFixed(0)}% power at a = ${i.alpha}). It controls the overall Type I error and defines stopping rules.\n\n## 2. Timing\n\nInterim ${k === 1 ? 'analysis is' : 'analyses are'} planned at approximately ${Array.from({ length: k }, (_, x) => `${Math.round(((x + 1) / (k + 1)) * 100)}%`).join(', ')} of planned information (events/completers).\n\n## 3. Alpha Spending\n\nA group-sequential design with an O'Brien-Fleming-type alpha-spending function is recommended. The cumulative spend at the final analysis equals the study-wide a = ${i.alpha}.\n\n| Look | Information fraction | Indicative two-sided boundary (Z) |\n|---|---|---|\n`;
    for (let x = 1; x <= k; x++) { const frac = x / (k + 1), z = (2.96 - 0.6 * frac).toFixed(2); s += `| ${x} | ${(frac * 100).toFixed(0)}% | +/-${z} |\n`; }
    s += `| Final | 100% | +/-1.97 |\n\n*Boundaries are indicative; compute exact boundaries with the chosen spending function (Lan-DeMets) at finalization.*\n\n## 4. Stopping Rules\n\n- **Efficacy**: cross the upper boundary at an interim look.\n- **Futility**: non-binding boundary (e.g. conditional power < 20%).\n- **Safety**: per DSMB charter, independent of efficacy boundaries.\n\n## 5. Governance\n\nInterim analyses are performed by an unblinded independent statistician and reviewed by the DSMB. The sponsor remains blinded.${r ? ` ${r.body} expects pre-specification of all boundaries before the first look.` : ''}\n\n`;
    return s + foot();
  };
  const tlfShell: GenFn = (i, c, _j, _d, _r) => { let s = `# Tables, Listings & Figures (TLF) Shell Plan\n\nPlanned outputs for a ${i.studyType} study (N = ${c.adjustedTotal ?? c.sampleSize.total}). Shells are organized by ICH E3 domain.\n\n## Tables\n\n| ID | Title | Population |\n|---|---|---|\n| 14.1.1 | Subject disposition | All randomized |\n| 14.1.2 | Protocol deviations | All randomized |\n| 14.1.3 | Demographics and baseline characteristics | ITT; Safety |\n| 14.2.1 | Primary endpoint (${i.endpointType}) analysis -- ${c.method} | ITT |\n| 14.2.2 | Primary endpoint — PP sensitivity | PP |\n| 14.2.3 | Secondary endpoints | ITT |\n| 14.3.1 | Exposure | Safety |\n| 14.3.2 | Adverse events overview | Safety |\n| 14.3.3 | AEs by SOC/PT | Safety |\n| 14.3.4 | Serious adverse events | Safety |\n| 14.3.5 | Laboratory shifts | Safety |\n\n## Figures\n\n| ID | Title |\n|---|---|\n| F-1 | Subject disposition (CONSORT) |\n`;
    if (i.endpointType === 'time_to_event') s += `| F-2 | Kaplan-Meier curve, primary endpoint |\n`;
    s += `| F-3 | Primary endpoint by visit / forest plot of subgroups |\n\n## Listings\n\n| ID | Title |\n|---|---|\n| 16.2.1 | Subject disposition |\n| 16.2.4 | Protocol deviations |\n| 16.2.7 | Adverse events |\n\n`;
    return s + foot();
  };
  const randomization: GenFn = (i, c, _j, _d, _r) => { const g = i.numberOfGroups ?? 2; let s = `# Randomization & Blinding Plan\n\n## 1. Allocation\n\nSubjects are randomized ${i.allocationRatio}:1 across ${g} arm${g === 1 ? '' : 's'} for this ${i.studyType} study (target N = ${c.adjustedTotal ?? c.sampleSize.total}).\n\n## 2. Method\n\nPermuted-block randomization with randomly varying block sizes is recommended to balance arms while protecting allocation concealment. ${i.studyType === 'single_arm' ? 'Single-arm study — randomization not applicable; document enrollment order instead.' : 'Stratify by key prognostic factors (e.g. site, baseline severity) to control confounding.'}\n\n## 3. Allocation Concealment\n\nThe randomization list is generated by an independent statistician and held in a secure IWRS/IRT. Sites obtain assignments at the point of randomization only.\n\n## 4. Blinding\n\n${i.comparatorType === 'placebo' ? 'Double-blind: subjects, investigators, and outcome assessors are masked using matching placebo.' : 'Specify the blinding level (open-label, single-, or double-blind). Where blinding is infeasible, use blinded independent endpoint adjudication.'}\n\n## 5. Unblinding\n\nEmergency unblinding is available via the IWRS for medical necessity and is logged. Planned unblinding occurs only after database lock, except for DSMB closed sessions.\n\n`;
    return s + foot();
  };

  const REGISTRY: DocDef[] = [
    { id: 'sample_size_rationale', label: 'Sample Size Rationale', group: 'Design', gen: sampleSizeRationale, blurb: 'The justification reviewers ask for — method, assumptions, result, fragility.' },
    { id: 'full_statistical_analysis_plan', label: 'Statistical Analysis Plan', group: 'Analysis', gen: fullSAP, blurb: 'The full SAP — populations, sample size, methods, estimand, missing data, interims.' },
    { id: 'sap_section_draft', label: 'SAP Section Draft', group: 'Analysis', gen: sapSection, blurb: 'A focused SAP section for the primary analysis.' },
    { id: 'protocol_statistical_section', label: 'Protocol Statistical Section', group: 'Design', gen: protocolSection, blurb: 'Hypotheses, sample size, primary analysis and populations for the protocol.' },
    { id: 'statistical_methods_section', label: 'CSR S9.7 Methods', group: 'Reporting', gen: csrMethods, blurb: 'ICH E3 S9.7 statistical methods for the clinical study report.' },
    { id: 'statistical_risk_memo', label: 'Statistical Risk Memo', group: 'Governance', gen: riskMemo, blurb: 'Executive risk read with role-specific interpretations and escalation items.' },
    { id: 'design_assumption_note', label: 'Design Assumption Note', group: 'Design', gen: (i, c, j, d, r) => sampleSizeRationale(i, c, j, d, r), blurb: 'Assumptions and their sensitivity, for the design file.' },
    { id: 'interim_analysis_plan', label: 'Interim Analysis Plan', group: 'Governance', gen: interimPlan, blurb: 'Timing, alpha spending, stopping rules and governance for interim looks.' },
    { id: 'dsmb_charter', label: 'DSMB / DMC Charter', group: 'Governance', gen: dsmbCharter, blurb: 'Independent data monitoring charter — membership, meetings, stopping guidance.' },
    { id: 'tlf_shell_plan', label: 'TLF Shell Plan', group: 'Reporting', gen: tlfShell, blurb: 'Tables, listings and figures shells by ICH E3 domain.' },
    { id: 'randomization_plan', label: 'Randomization & Blinding', group: 'Design', gen: randomization, blurb: 'Allocation, concealment, blinding and unblinding plan.' },
  ];
  function byId(id: string): DocDef | undefined { return REGISTRY.find(x => x.id === id); }
  return { REGISTRY, byId };
})();

/* ─── Tiny markdown -> HTML for the document canvas ─── */
/* Markdown rendering is `renderSafeMarkdown` (marked + DOMPurify), the
   codebase's one audited markdown-to-HTML path -- see
   components/ana/renderSafeMarkdown.ts.

   This file used to carry its own 13-line `mdToHtml`: a regex approximation of
   markdown whose first act was a hand-rolled `&`/`<`/`>` escape. Two other
   surfaces carried the same function, two of the three byte-identical. Three
   copies of an escaper feeding three `dangerouslySetInnerHTML` sinks is three
   places to get HTML escaping right and three places for one to drift, in a
   product where the text being rendered is a document the user wrote or
   uploaded.

   The replacement is not merely deduplication. `renderSafeMarkdown` runs a real
   markdown parser and then reduces the result to an explicit tag/attribute
   allowlist, so `<script>`, inline event handlers and `javascript:` URLs are
   removed rather than depended upon never to arrive -- and it is already
   covered by its own tests, which the hand-rolled copies never were. */

/* ── Design presets (deterministic engine inputs — not stored data) ── */

const BS_PRESETS: Record<string, Preset> = {
  survival: { label: 'Pivotal OS (survival)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.90, effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, interimAnalyses: 2, comparatorType: 'placebo', estimandStrategy: 'treatment_policy', missingDataMethod: 'MMRM', indication: 'Oncology', phase: 'Phase III' } },
  binary: { label: 'ORR (binary)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'binary', alpha: 0.05, powerTarget: 0.90, effectSize: 0.15, controlRate: 0.30, treatmentRate: 0.45, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, comparatorType: 'placebo', phase: 'Phase III' } },
  ni: { label: 'Non-inferiority', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'EMA', studyType: 'non_inferiority', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.025, powerTarget: 0.90, effectSize: 0.0, nonInferiorityMargin: -0.4, variance: 1, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2, comparatorType: 'active', phase: 'Phase III' } },
  ivd: { label: 'Diagnostic accuracy', input: { clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy', endpointType: 'sensitivity_specificity', alpha: 0.05, powerTarget: 0.90, effectSize: 0.9, sensitivity: 0.90, specificity: 0.92, prevalence: 0.30, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 1, numberOfEndpoints: 2 } },
};

function vf(v: string): number | undefined { return v === undefined || v === null || v === '' ? undefined : parseFloat(v); }

/* ── Inline toast helper ── */

/* ════ Biostatistics surface ════ */

export function Biostatistics({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const live = connected();
  const [preset, setPreset] = useState('survival');
  const [input, setInput] = useState<BiostatInput>(BS_PRESETS.survival.input);
  const [docType, setDocType] = useState('sample_size_rationale');
  const [toast, fireToast] = useToast();

  // Governed statistical documents — the ONE stored, org-scoped slice of this
  // surface (the design/document body is computed in-browser deterministically).
  // GET /api/ana-biostats/governed-documents reads real persisted artifacts
  // (concept2cure_artifacts, type 'statistical_summary'), org-scoped. Real rows,
  // an honest empty state, or an honest failed-load state — never a fixture.
  const govDocs = useLiveRows<BiostatPlan>('/api/ana-biostats/governed-documents');
  const set = (k: string, v: unknown) => setInput((s) => ({ ...s, [k]: v }));
  const applyPreset = (k: string) => { setPreset(k); setInput(BS_PRESETS[k].input); };

  const res = useMemo(() => { try { return BiostatEngine.compute(input); } catch { return null; } }, [input]);
  const jud = useMemo(() => { try { return res && BiostatEngine.judge(input, res); } catch { return null; } }, [input, res]);
  const dom = useMemo(() => domainAdapt(input), [input]);
  const reg = useMemo(() => regCustom(input), [input]);
  const docDef = BiostatDocs.byId(docType);
  const md = useMemo(() => { try { return res && jud && docDef ? docDef.gen(input, res, jud, dom, reg) : ''; } catch (e: unknown) { return '# Error\n\n' + (e instanceof Error ? e.message : String(e)); } }, [input, res, jud, dom, reg, docType, docDef]);
  const html = useMemo(() => renderSafeMarkdown(md), [md]);

  const isDiag = input.clientTrack === 'diagnostics_ivd';
  const isSurv = input.endpointType === 'time_to_event';
  const isBin = input.endpointType === 'binary';
  const isNI = input.studyType === 'non_inferiority';
  const n = res ? (res.adjustedTotal || res.sampleSize.total) : 0;

  /*
   * "Open in editor" — a real handoff, at last.
   *
   * WHAT IT USED TO BE. `localStorage.setItem('c2c_biostat_doc', {title, md})`
   * followed by a navigation. Nothing in this repository has ever read that key
   * — no getItem, in any file, in any commit — so the editor opened on whatever
   * it would have opened on anyway and the named document never travelled. Two
   * surfaces also fired "opened in editor" toasts for that non-event; those were
   * deleted in f018695, leaving a button that navigated and claimed nothing.
   *
   * WHY IT COULD NOT BE "RECONNECTED". The payload is CONTENT — a title and a
   * markdown body — not an identifier. There is no row to point at, so honouring
   * the intent means CREATING one: POST the document, POST the section that
   * holds the prose, and only then navigate. That is what happens below, through
   * the same two endpoints AuthoringCreateExport's createDoc/createSection
   * already use (the governed authoring store: tenant-scoped, JWT-attributed,
   * and the section create writes a genesis revision plus a Part 11 audit row
   * server-side).
   *
   * WHY NO RUNTIME CHANNEL. The editor does not need to be told which document
   * to open. DocumentAuthoring mounts fresh on navigation (V2App keys the body
   * by surface id), its loadDocs lists `status=draft` scoped to
   * window.C2C_PROJECT — and GET /api/authoring/docs orders by
   * `d.updated_at DESC` — then it selects the first row and that row's first
   * section. A document created a moment ago IS the most recently updated draft,
   * and the create below sets the same project scope, so the editor lands on it.
   * Writing a window.C2C_DOC that nothing reads would repeat the exact defect
   * this replaces.
   *
   * FAILURE. Nothing is announced that did not happen and nothing is lost. If
   * the document create fails we do NOT navigate — the draft stays on screen
   * with an honest reason. If the document is created but its text fails to
   * save, we do not navigate either: leaving for an editor that would show an
   * empty document is the same silent loss wearing a different hat.
   */
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const attachingRef = useRef(false);
  const [attaching, setAttaching] = useState(false);

  const openEditor = async () => {
    if (openingRef.current) return; // a second click must not create a second document
    const title = docDef?.label || 'Statistical document';
    if (!md.trim()) { fireToast('Nothing to open yet — the document has not been generated.', 'error'); return; }
    openingRef.current = true; setOpening(true);
    try {
      // Statistical documentation files under Module 5; the server would
      // default to M3.
      const r = await saveToAuthoring({
        title, module: 'M5', code: docDef?.id || 'statistical_document',
        content: md, subject: 'the document',
      });
      // Navigate only on a clean write. On a half-failure the document exists
      // but is empty, so going there would show the user an editor without
      // their work — stay put and say so.
      if (!r.ok) { fireToast(r.message, 'error'); return; }
      if (onNav) onNav('document-authoring');
      else fireToast(r.message);
    } finally {
      openingRef.current = false; setOpening(false);
    }
  };
  /**
   * Ask AnA to attach the document — which is what this control does, and now
   * what it says.
   *
   * It used to fire `'<Label> attached to dossier'` with the default 'ok' tone,
   * i.e. the green success tick, SYNCHRONOUSLY and BEFORE `ask(...)` was even
   * called. At the instant that tick painted, not one byte had left the browser.
   *
   * And nothing was attached even after it did. `ask()` returns void — it
   * streams a natural-language sentence into the AnA conversation. The real
   * path, attachToDossier in
   * server/services/ana-biostats/workflow-integrator.ts, needs an artifactId and
   * a dossierSectionId. This control is only reachable once `res && jud &&
   * docDef`, so the document is GENERATED — but generated is not saved: there is
   * no artifactId until `openEditor` writes one through saveToAuthoring, and
   * this surface has no dossier-section picker at all. So there is no success to
   * report, and no failure path to report one from either.
   *
   * `openEditor`, directly above, is this file's own proof of the right pattern:
   * it awaits the real write and refuses to navigate or announce on anything but
   * a confirmed `r.ok`. This is the same rule applied to a control whose honest
   * description is "a request was sent", not "it is done" — so the toast now
   * follows `ask()` rather than preceding it, and says what AnA still has to do.
   *
   * The `!md.trim()` guard mirrors openEditor's and is belt-and-braces for the
   * same reason its twin is: both controls live in one AnswerLead gated on
   * `res && jud && docDef`, so it only bites if `docDef.gen()` returns empty.
   */
  const attach = async () => {
    const label = docDef?.label || 'Document';
    if (!md.trim()) {
      fireToast('Nothing to attach yet — the document has not been generated.', 'error');
      return;
    }
    if (attachingRef.current) return; // a second click must not file a second copy
    attachingRef.current = true;
    setAttaching(true);
    try {
      /* This used to hand the request to the conversation — `ask('Attach the
         … to the submission dossier statistical section')` — and then toast
         that an attachment had been "requested". `ask()` returns void: it
         streams a sentence into the AnA panel. Nothing was filed, and the user
         was left waiting for a confirmation that had no producer.

         `saveToAuthoring` is the real filing path and the sibling button beside
         this one already uses it: it POSTs /api/authoring/docs with
         window.C2C_PROJECT.id as client_program_id, which is what binds the
         document to the project's dossier, then writes the content. Same call,
         same module (statistical documentation files under M5), same failure
         reporting — the only difference from "Open in editor" is that this one
         does not navigate away. */
      const r = await saveToAuthoring({
        title: label, module: 'M5', code: docDef?.id || 'statistical_document',
        content: md, subject: 'the document',
      });
      if (!r.ok) { fireToast(r.message, 'error'); return; }
      fireToast(label + ' filed to the dossier under Module 5 — open it from Document authoring.');
    } finally {
      attachingRef.current = false;
      setAttaching(false);
    }
  };
  const groups = BiostatDocs.REGISTRY.reduce<Record<string, DocDef[]>>((m, d) => { (m[d.group] = m[d.group] || []).push(d); return m; }, {});
  const vTone = (v: string) => v === 'adequate' ? 'ok' : v === 'marginal' ? 'warn' : 'err';

  /* WHAT ANA SEES HERE. The design engine is pure and in-browser, so its
     numbers are always current; the govDocs read scopes ONLY the
     persisted-documents claim — its error must never read as zero rows. When
     the engine itself returns null the screen shows no n/power/verdict, so
     none is published either. */
  const anaContext = useMemo(() => {
    const presetLabel = BS_PRESETS[preset]?.label ?? preset;
    const gov = govDocs.loading
      ? 'the governed statistical document list is still loading'
      : govDocs.error
        ? 'the governed statistical document list did not load, so the count of persisted documents is unknown'
        : govDocs.empty
          ? 'no governed statistical documents persisted yet'
          : govDocs.rows.length + ' governed statistical document(s) persisted (org-scoped)';
    const govFacts = !govDocs.loading && !govDocs.error ? { governedDocumentsPersisted: govDocs.rows.length } : {};
    if (!res || !jud) {
      return {
        summary:
          'Biostatistics — the design engine could not compute a result for the current inputs, so no sample size, power or verdict is on screen; ' + gov + '.',
        facts: { documentType: docDef?.label ?? null, preset: presetLabel, designComputed: false, ...govFacts },
      };
    }
    return {
      summary:
        'Biostatistics — a ' + (docDef?.label ?? 'statistical document') + ' drafted for a ' + input.studyType.replace(/_/g, ' ')
        + ' design (' + presetLabel + ' preset): ' + n + ' subjects, ' + (res.power * 100).toFixed(0) + '% power, overall verdict '
        + jud.overallVerdict + '; ' + gov + '.',
      facts: {
        documentType: docDef?.label ?? null,
        preset: presetLabel,
        subjectsN: n,
        achievedPowerPct: Number((res.power * 100).toFixed(1)),
        overallVerdict: jud.overallVerdict,
        ...govFacts,
      },
      availableActions: [
        'Adjust any design input or preset — the document rewrites deterministically',
        'Pick a different statistical document type to generate',
        'Refine the document with AnA',
        'Opening in the editor and attaching to the dossier both file a real governed document (genesis revision + Part 11 audit row) — AnA proposes them in conversation, never through screen controls.',
      ],
    };
  }, [res, jud, docDef, preset, input.studyType, n, govDocs.loading, govDocs.error, govDocs.empty, govDocs.rows]);
  /* Both actions are pure client-side recomputes of a deterministic design —
     nothing is filed. Opening in the editor and attaching to the dossier stay
     governed human acts. `applyPreset` is the SAME function the chips call. */
  useSurfaceActionHandlers('biostatistics', {
    'biostatistics.set-preset': (params) => {
      const target = String(params.preset ?? '');
      const meta = BS_PRESETS[target];
      if (!meta) return { ok: false, reason: `No design preset named "${params.preset}".` };
      if (preset === target) return { ok: true, detail: `Already on the ${meta.label} preset` };
      applyPreset(target);
      return { ok: true, detail: `Applied the ${meta.label} preset — the design recomputes on screen; nothing is filed` };
    },
    'biostatistics.set-doc-type': (params) => {
      const target = String(params.docType ?? '');
      const doc = BiostatDocs.REGISTRY.find((d) => d.id === target);
      if (!doc) return { ok: false, reason: `No statistical document type named "${params.docType}".` };
      if (docType === target) return { ok: true, detail: `Already drafting the ${doc.label}` };
      setDocType(target);
      return { ok: true, detail: `Switched the document to ${doc.label} — filing it stays a human act` };
    },
  });

  usePublishSurfaceContext('biostatistics', anaContext);

  return (
    <div className="bs">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist — clinical {live ? '-- live' : ''}</div>
          <h1 className="sp-title">Biostatistics</h1>
          <p className="sp-state">Describe the study once — AnA computes the design deterministically (ICH E9(R1)) and writes the governed statistical document you actually need to file.</p>
        </div>
      </div>

      {res && jud && docDef && (
        <AnswerLead
          tone={jud.overallVerdict === 'inadequate' ? 'urgent' : jud.overallVerdict === 'adequate' ? 'good' : 'calm'}
          eyebrow={'Your ' + docDef.label.toLowerCase() + ' is ready to review'}
          headline={<>I've drafted the <b>{docDef.label}</b> for your {input.studyType.replace(/_/g, ' ')} design -- <b>{n} subjects</b>, {(res.power * 100).toFixed(0)}% power, and the design reads as <b>{jud.overallVerdict}</b>.</>}
          body={<>Everything below is written, not just calculated — the method, assumptions, and {jud.fragility.category.replace('_', ' ')} fragility are already in the prose, with a provenance footer for the reviewer. Change any design input and the document rewrites itself.</>}
          reassure={jud.overallVerdict === 'inadequate' ? "I flagged the underpowering honestly in the risk section — better the reviewer sees you addressed it than found it." : "It's drafted to " + (input.regulatoryBody || 'FDA') + " expectations. Read it, adjust, and send it straight to the editor."}
          action={{ label: opening ? 'Saving to the editor…' : 'Open in document editor', onClick: () => void openEditor(), alt: { label: attaching ? 'Filing to the dossier…' : 'File it to the dossier', onClick: () => void attach() } }}
          secondary="Or pick a different document and adjust the design on the left."
        />
      )}

      <div className="bs-doc-layout">
        {/* Left: what to produce + design inputs */}
        <div className="bs-side">
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Document</span><span className="s">what to produce</span></div>
            <div className="pj-card-b" style={{ padding: 10 }}>
              {Object.entries(groups).map(([g, docs]) => (
                <div key={g} className="bs-doc-group">
                  <div className="bs-doc-gl">{g}</div>
                  {docs.map((d) => (
                    <button key={d.id} className={'bs-doc-opt' + (docType === d.id ? ' on' : '')} onClick={() => setDocType(d.id)} title={d.blurb}>
                      <span className="bs-doc-t">{d.label}</span>{docType === d.id && <span className="bs-doc-chk">{I.check}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Study design</span><span className="s">document rewrites live</span></div>
            <div className="pj-card-b" style={{ padding: 12 }}>
              <div className="bs-presets">{Object.entries(BS_PRESETS).map(([k, p]) => <button key={k} className={'bs-preset' + (preset === k ? ' on' : '')} onClick={() => applyPreset(k)}>{p.label}</button>)}</div>
              <div className="bs-fields">
                <label className="bs-f"><span>Track</span><select value={input.clientTrack} onChange={(e) => set('clientTrack', e.target.value)}>{['biotech_pharma', 'medical_device', 'diagnostics_ivd'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' / ')}</option>)}</select></label>
                <label className="bs-f"><span>Agency</span><select value={input.regulatoryBody} onChange={(e) => set('regulatoryBody', e.target.value)}>{['FDA', 'EMA', 'MHRA', 'PMDA', 'NMPA', 'TGA', 'Health_Canada'].map((x) => <option key={x}>{x}</option>)}</select></label>
                <label className="bs-f"><span>Study type</span><select value={input.studyType} onChange={(e) => set('studyType', e.target.value)}>{['superiority', 'non_inferiority', 'equivalence', 'single_arm', 'performance', 'diagnostic_accuracy'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
                <label className="bs-f"><span>Endpoint</span><select value={input.endpointType} onChange={(e) => set('endpointType', e.target.value)}>{['continuous', 'binary', 'time_to_event', 'sensitivity_specificity'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
                <label className="bs-f"><span>Alpha</span><input type="number" step="0.005" value={input.alpha} onChange={(e) => set('alpha', vf(e.target.value) || 0.05)} /></label>
                <label className="bs-f"><span>Power</span><input type="number" step="0.05" value={input.powerTarget} onChange={(e) => set('powerTarget', vf(e.target.value) || 0.8)} /></label>
                {!isDiag && <label className="bs-f"><span>{isSurv ? 'HR reduction' : isBin ? 'Delta rate' : 'Effect (d)'}</span><input type="number" step="0.01" value={input.effectSize} onChange={(e) => set('effectSize', vf(e.target.value) || 0)} /></label>}
                {isNI && <label className="bs-f"><span>NI margin</span><input type="number" step="0.05" value={input.nonInferiorityMargin || ''} onChange={(e) => set('nonInferiorityMargin', vf(e.target.value))} /></label>}
                {input.endpointType === 'continuous' && <label className="bs-f"><span>Variance</span><input type="number" step="0.1" value={input.variance || ''} onChange={(e) => set('variance', vf(e.target.value))} /></label>}
                {isBin && <label className="bs-f"><span>Control rate</span><input type="number" step="0.05" value={input.controlRate || ''} onChange={(e) => set('controlRate', vf(e.target.value))} /></label>}
                {isBin && <label className="bs-f"><span>Treatment rate</span><input type="number" step="0.05" value={input.treatmentRate || ''} onChange={(e) => set('treatmentRate', vf(e.target.value))} /></label>}
                {isSurv && <label className="bs-f"><span>Event rate</span><input type="number" step="0.05" value={input.eventRate || ''} onChange={(e) => set('eventRate', vf(e.target.value))} /></label>}
                {isDiag && <label className="bs-f"><span>Sensitivity</span><input type="number" step="0.01" value={input.sensitivity || ''} onChange={(e) => set('sensitivity', vf(e.target.value))} /></label>}
                {isDiag && <label className="bs-f"><span>Specificity</span><input type="number" step="0.01" value={input.specificity || ''} onChange={(e) => set('specificity', vf(e.target.value))} /></label>}
                {isDiag && <label className="bs-f"><span>Prevalence</span><input type="number" step="0.05" value={input.prevalence || ''} onChange={(e) => set('prevalence', vf(e.target.value))} /></label>}
                <label className="bs-f"><span>Attrition</span><input type="number" step="0.05" value={input.attritionRate} onChange={(e) => set('attritionRate', vf(e.target.value) || 0)} /></label>
                <label className="bs-f"><span>Interims</span><input type="number" step="1" value={input.interimAnalyses || 0} onChange={(e) => set('interimAnalyses', parseInt(e.target.value) || 0)} /></label>
              </div>
              {res && jud && <div className="bs-mini">
                <span><b>{n}</b> subjects</span><span><b>{(res.power * 100).toFixed(0)}%</b> power</span>{res.events ? <span><b>{res.events}</b> events</span> : null}<span className={'rd-chip tone-' + vTone(jud.overallVerdict)}>{jud.overallVerdict}</span>
              </div>}
            </div>
          </div>
        </div>

        {/* Center: the DOCUMENT -- the deliverable */}
        <div className="bs-doc">
          <div className="bs-doc-bar">
            <div className="bs-doc-bar-l"><span className="bs-doc-kind">{docDef?.label}</span><span className="bs-doc-prov">{/* Provenance describes where THIS document came from, and that never
                  varies: `md` is always BiostatDocs.gen() over BiostatEngine.compute(),
                  both defined in this file and ported verbatim from
                  server/services/ana-biostats/*. `live` is connected() — a global
                  API-reachability flag that has no bearing on how the document was
                  produced — so naming the service there stamped a browser-computed
                  document with a server origin, on the one line a reviewer reads to
                  find out exactly that. It also printed an API route into customer
                  UI, which the work order forbids outright. */}
                Deterministic engine -- v1.0.0 — draft</span></div>
            <div className="bs-doc-bar-a">
              <button className="bs-da" onClick={() => ask('Refine the ' + (docDef?.label || 'document') + ': ' + (docDef?.blurb || ''))}>{I.sparkles} Refine with AnA</button>
              <button className="bs-da primary" onClick={() => void openEditor()} disabled={opening}>{I.penLine} {opening ? 'Saving to the editor…' : 'Open in editor'}</button>
            </div>
          </div>
          <div className="bs-doc-page">
            <div className="bs-doc-render" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>

      <div className="pj-card" style={{ marginTop: 14 }}>
        {/* The list is org-scoped (every persisted statistical_summary artifact for the
            tenant), so the sub-label reads "org-scoped" — not "this project", which would
            misrepresent an organization/portfolio-wide list as a single project's. */}
        <div className="pj-card-h"><span className="t">Governed statistical documents</span><span className="s">{govDocs.rows.length > 0 ? govDocs.rows.length + ' persisted · org-scoped' : 'org-scoped'}</span></div>
        <div className="pj-card-b" style={{ padding: 8 }}>
          {govDocs.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading governed documents…</div>
          ) : govDocs.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load governed statistical documents"
              hint="The document store didn't respond. These are the statistical documents AnA Biostats has generated and persisted for this organization — sign in and retry, or check that the AnA Biostats service is reachable."
            />
          ) : govDocs.empty ? (
            <EmptyState
              icon={I.fileText}
              title="No governed statistical documents yet"
              hint="Generate a document above and run it through the AnA Biostats workflow. Once persisted, every SAP, sample-size rationale, or DSMB charter your team files appears here — org-scoped, with its real status."
            />
          ) : (
            <div className="sp-list">
              {govDocs.rows.map((p) => {
                const def = p.doc ? BiostatDocs.byId(p.doc) : undefined;
                return (
                  /* `doc` is null whenever statisticalDocumentType was not
                     recorded on the artifact — a condition this type declares as
                     normal. The row was still a <button> in that case, so
                     clicking a perfectly ordinary persisted document did
                     nothing at all. It now says so: a row we cannot open is
                     rendered as a row, disabled, with the reason in its title,
                     rather than as a control that silently declines. */
                  <button
                    key={p.id}
                    className="sp-row"
                    style={{ width: '100%', textAlign: 'left' }}
                    disabled={!def}
                    title={def ? `Open the ${def.label} generator` : 'This document has no recorded statistical type, so there is no generator to open for it.'}
                    onClick={() => { if (p.doc && def) setDocType(p.doc); }}
                  >
                    <span className="sp-tag" style={{ fontFamily: 'var(--font-mono)' }}>{p.id}</span>
                    <span className="sp-row-b"><span className="sp-row-t">{p.study}</span><span className="sp-row-s">{p.endpoint ? p.endpoint + ' -- ' : ''}{def?.label || 'Statistical document'}</span></span>
                    <span className={'rd-chip tone-' + (p.status === 'approved' ? 'ok' : 'warn')}>{p.status}</span>
                    {!def && <span className="sp-row-note">no recorded type</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
