/**
 * Study digital twin + simulation.
 *
 * A study digital twin is a persisted `StudyDesign` object (the design-as-data spine)
 * that AnA can SIMULATE to predict outcomes — across any therapeutic area and any phase
 * (FIH→4), because the design object is indication/phase-parameterised.
 *
 * The probability of success is NOT guessed by a language model. It is computed by the
 * platform's deterministic, seeded synthetic-twin engine (`simulateTrial`), whose Monte
 * Carlo assurance is cross-validated against the closed-form assurance integral and whose
 * type-I error is calibrated under the null. The prior is built from the client's
 * structured CSR history when available (`gatherCsrEffectEvidence`) and otherwise from the
 * design's own effect assumption — flagged as an assumption, never laundered as data. The
 * design's defensibility gates ride along, so a good-looking number cannot hide a broken
 * design. This is what makes the twin a faithful projection of the engine rather than a
 * second, weaker estimate of the same quantity.
 *
 * Two non-negotiables are enforced HERE, in code, so they cannot be skipped:
 *   1. Every simulation result carries the predictive-model DISCLAIMER.
 *   2. When the client has uploaded no learnable history, the result asks them to upload
 *      prior CSRs / study records so AnA can ground future simulations in evidence.
 *
 * When the design lacks what an honest simulation needs (an effect assumption, a sample
 * size, a controlled comparison), the twin says so and reports NO probability — it never
 * fabricates one. DB calls degrade gracefully.
 *
 * @module server/services/study-design/study-twin-service
 */
import { pool } from '../../db.js';
import type { StudyDesign } from './study-design-types.js';
import { simulateTrial, type TrialSimulationReport } from './trial-simulator.js';
import { buildEffectPrior, type EvidenceObservation } from './evidence-prior.js';
import { validateDesign, type DesignValidationReport } from './design-validation.js';
import { gatherCsrEffectEvidence } from './csr-evidence-source.js';

/**
 * Mandatory predictive disclaimer. Appended to EVERY simulation result — there is no flag
 * to suppress it. Predictions are model estimates, not regulatory advice or a guarantee of
 * trial outcome.
 */
export const STUDY_TWIN_DISCLAIMER =
  'Simulation disclaimer: this is a model-based prediction from a study digital ' +
  'twin, not a guarantee of trial outcome, statistical certification, or regulatory ' +
  'advice. The probability of success is computed by a seeded simulation from the ' +
  'design assumptions and any historical data provided, and carries uncertainty that ' +
  'grows with novelty of the indication, endpoint, or population. Confirm sample size ' +
  'and power with a qualified biostatistician and validate assumptions against ' +
  'regulatory guidance before relying on any figure. AnA does not make the design ' +
  'decision for you.';

/** The request AnA surfaces when the client has uploaded no learnable history. */
export const HISTORY_UPLOAD_REQUEST =
  'To ground this simulation in evidence rather than priors alone, upload prior ' +
  'clinical study reports (CSRs) and historical study records for this indication ' +
  'or programme. AnA learns from what you upload and will cite it in future ' +
  'simulations. Until then, this prediction rests on general priors and is lower ' +
  'confidence.';

export interface StudyTwinSimulationInput {
  design: StudyDesign;
  organizationId: number;
  projectId?: string | number | null;
  /** Optional caller-supplied focus, e.g. "probability of hitting the primary at week 24". */
  question?: string;
}

/** The computed, source-of-truth figures behind a twin prediction. */
export interface TwinQuantitative {
  /** Probability of success on the primary endpoint (0–1), from the seeded engine. */
  probabilityOfSuccess: number;
  /** Power at the planned point effect alone (0–1), for contrast. */
  powerAtPlanned: number;
  /** Whether the effect prior was evidence-grounded or an assumption. */
  effectBasis: string;
  /** Defensibility risk level from the design gates. */
  riskLevel: string;
  /** True when the design has no approval-blocking findings. */
  canAdvance: boolean;
  /** Reproducibility seed from the simulation provenance. */
  provenanceSeed: number;
}

export interface StudyTwinSimulationResult {
  /** The prediction prose, composed from the computed figures (or an honest no-number note). */
  prediction: string;
  /** The computed figures, present when a probability could be computed. */
  quantitative?: TwinQuantitative;
  /** Always present — the mandatory predictive disclaimer. */
  disclaimer: string;
  /** True when the client has no uploaded history to learn from. */
  needsHistoryUpload: boolean;
  /** The upload request, present iff needsHistoryUpload. */
  historyRequest?: string;
  /** Whether the prediction was grounded on uploaded history. */
  grounded: boolean;
  /** Echo of the design's phase + indication for the caller/UI. */
  phase: string;
  indication: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Compose the prediction prose from a computed simulation report and the design's
 * defensibility report. Pure and unit-testable — every number here came from the engine.
 */
export function composeTwinPrediction(
  report: TrialSimulationReport,
  validation: DesignValidationReport,
  csrNote?: string,
): { text: string; quantitative: TwinQuantitative } {
  const s = report.summary;
  const eff = s.estimatedEffect;
  const lines: string[] = [];

  lines.push(
    `Probability of success on the primary endpoint: ${pct(s.probabilityOfSuccess)} — a seeded ` +
      `synthetic-twin Monte Carlo over ${s.nRuns} runs, cross-validated against the closed-form ` +
      `assurance, not an estimate. Power at the planned effect alone is ${pct(s.powerAtPriorMean)}.`,
  );
  lines.push(
    `Expected effect (95% interval): ${eff.median.toFixed(2)} [${eff.lower.toFixed(2)}, ${eff.upper.toFixed(2)}] ` +
      `on the ${eff.scale}.`,
  );
  if (report.assumptions.effectBasis === 'evidence') {
    lines.push(`Effect prior grounded in ${report.assumptions.evidenceSources.length} historical source(s).`);
  } else {
    lines.push(
      `Effect basis: ${report.assumptions.effectBasis.replace(/_/g, ' ')}. ${report.assumptions.caveats[0] ?? ''}`.trim(),
    );
  }
  lines.push(
    `Empirical type-I error under the null: ${s.typeIErrorUnderNull.toFixed(3)} (target ${report.design.alpha}).`,
  );
  lines.push(
    `Defensibility: ${validation.riskLevel}; ` +
      `${validation.canAdvance ? 'no approval-blocking findings' : `${validation.counts.critical} blocking finding(s)`}.`,
  );
  const topRisks = validation.findings
    .filter(f => f.severity === 'critical' || f.severity === 'major')
    .slice(0, 3)
    .map(f => `${f.section} — ${f.title}`);
  if (topRisks.length) lines.push(`Top design risks: ${topRisks.join('; ')}.`);
  if (csrNote) lines.push(csrNote);

  return {
    text: lines.join('\n'),
    quantitative: {
      probabilityOfSuccess: s.probabilityOfSuccess,
      powerAtPlanned: s.powerAtPriorMean,
      effectBasis: report.assumptions.effectBasis,
      riskLevel: validation.riskLevel,
      canAdvance: validation.canAdvance,
      provenanceSeed: report.provenance.seed,
    },
  };
}

/**
 * Compose the final result, ALWAYS attaching the disclaimer and, when there is no
 * learnable history, the upload request. Pure and unit-testable.
 */
export function composeSimulationResult(
  prediction: string,
  hasHistory: boolean,
  phase: string,
  indication: string,
  quantitative?: TwinQuantitative,
): StudyTwinSimulationResult {
  return {
    prediction,
    ...(quantitative ? { quantitative } : {}),
    disclaimer: STUDY_TWIN_DISCLAIMER,
    needsHistoryUpload: !hasHistory,
    ...(hasHistory ? {} : { historyRequest: HISTORY_UPLOAD_REQUEST }),
    grounded: hasHistory,
    phase,
    indication,
  };
}

/**
 * Does this org have uploaded history (prior CSRs) AnA can learn from? Graceful: any error
 * (missing table/column) → false, which makes AnA ask for an upload.
 */
export async function hasLearnableHistory(organizationId: number): Promise<boolean> {
  try {
    const r = await pool.query(`SELECT 1 FROM csr_reports WHERE organization_id = $1 LIMIT 1`, [organizationId]);
    if (r.rows.length > 0) return true;
  } catch {
    /* csr_reports may be unscoped or absent in this env — fall through. */
  }
  return false;
}

/**
 * Gather structured CSR effect observations for the org/indication. Graceful: any DB
 * problem yields no observations (the prior then rests on the design's assumption).
 */
async function gatherObservations(
  design: StudyDesign,
  organizationId: number,
): Promise<{ observations: EvidenceObservation[]; csrNote?: string }> {
  try {
    const direction = (design.endpoints ?? []).find(e => e.role === 'primary')?.direction;
    const csr = await gatherCsrEffectEvidence({
      tenantId: organizationId,
      indication: design.indication,
      phase: design.phase,
      direction,
    });
    return { observations: csr.observations, csrNote: csr.withStructuredEffect > 0 ? csr.note : undefined };
  } catch {
    return { observations: [] };
  }
}

/**
 * Run a study-twin simulation. The probability of success is computed by the deterministic
 * engine; the result always carries the disclaimer, asks for a history upload when none is
 * available, and never throws or fabricates a number.
 */
export async function simulateStudyTwin(
  input: StudyTwinSimulationInput,
  groundingText = '',
): Promise<StudyTwinSimulationResult> {
  const { design, organizationId } = input;
  const phase = String(design.phase ?? 'unspecified');
  const indication = design.indication ?? 'unspecified';
  const hasHistory = groundingText.trim().length > 0 || (await hasLearnableHistory(organizationId));

  const { observations, csrNote } = await gatherObservations(design, organizationId);

  // Build the effect prior: structured CSR evidence when present, else the design's own
  // assumed effect (flagged as an assumption by buildEffectPrior).
  const plannedEffect = design.statisticalPlan?.powerAssumptions?.effectSize;
  let prior;
  try {
    prior = buildEffectPrior(observations, { plannedEffect });
  } catch {
    const text =
      'This twin cannot be simulated yet: add an assumed effect size to the design’s power ' +
      'assumptions, or upload prior CSRs with a structured primary effect for this indication ' +
      'so the prior can be grounded. No probability is reported because none can be computed honestly.';
    return composeSimulationResult(text, hasHistory, phase, indication);
  }

  let report: TrialSimulationReport;
  try {
    report = simulateTrial(design, { effectPrior: prior });
  } catch (err: any) {
    const text =
      `This twin cannot be simulated as specified: ${err?.message ?? 'the design is incomplete.'} ` +
      'No probability is reported because none can be computed honestly for this design.';
    return composeSimulationResult(text, hasHistory, phase, indication);
  }

  const validation = validateDesign(design);
  const { text, quantitative } = composeTwinPrediction(report, validation, csrNote);
  return composeSimulationResult(text, hasHistory, phase, indication, quantitative);
}
