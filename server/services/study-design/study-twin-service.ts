/**
 * Study digital twin + simulation.
 *
 * A study digital twin is a persisted `StudyDesign` object (the design-as-data
 * spine) that AnA can SIMULATE to predict outcomes — across any therapeutic area
 * and any phase (FIH→4), because the design object is indication/phase-parameter-
 * ised. A simulation is an AnA prediction (probability of success, expected
 * effect vs. assumptions, enrolment feasibility, key design risks), grounded on
 * the client's own uploaded history (prior CSRs / records) when available.
 *
 * Two non-negotiables are enforced HERE, in code, so they cannot be skipped:
 *   1. Every simulation result carries the predictive-model DISCLAIMER.
 *   2. When the client has uploaded no learnable history, the result asks them to
 *      upload prior CSRs / study records so AnA can ground future simulations.
 *
 * All model calls go through the AI gateway. DB + gateway calls are graceful: a
 * failure degrades to a clearly-labelled, disclaimer-bearing result rather than
 * throwing into the caller.
 *
 * @module server/services/study-design/study-twin-service
 */
import { pool } from '../../db.js';
import { getGateway } from '../ai-gateway/gateway.js';
import type { StudyDesign } from './study-design-types.js';

/**
 * Mandatory predictive disclaimer. Appended to EVERY simulation result — there is
 * no flag to suppress it. Predictions are model estimates, not regulatory advice
 * or a guarantee of trial outcome.
 */
export const STUDY_TWIN_DISCLAIMER =
  'Simulation disclaimer: this is an AI-generated prediction from a study digital ' +
  'twin, not a guarantee of trial outcome, statistical certification, or regulatory ' +
  'advice. Estimates depend on the design assumptions and any historical data ' +
  'provided, and carry uncertainty that grows with novelty of the indication, ' +
  'endpoint, or population. Confirm sample size and power with a qualified ' +
  'biostatistician and validate assumptions against regulatory guidance before ' +
  'relying on any figure. AnA does not make the design decision for you.';

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

export interface StudyTwinSimulationResult {
  /** The model's prediction prose (or a graceful note when the model is unavailable). */
  prediction: string;
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

/** Build the simulation prompt for a design. Pure and unit-testable. */
export function buildSimulationPrompt(
  design: StudyDesign,
  groundingText: string,
  question?: string,
): { system: string; user: string } {
  const sp = design.statisticalPlan ?? ({} as StudyDesign['statisticalPlan']);
  const primary = (design.endpoints ?? []).filter(e => e.role === 'primary');
  const system =
    'You are AnA simulating a clinical study digital twin to predict outcomes. ' +
    'Predict, for the design given: (1) approximate probability of success on the ' +
    'primary endpoint, (2) expected effect vs. the powered assumption and the ' +
    'optimism-bias risk, (3) enrolment / dropout feasibility, (4) the two or three ' +
    'design risks most likely to sink the readout. Be quantitative where the design ' +
    'and any historical data support it, and explicitly state your uncertainty. ' +
    'Ground every quantitative claim in the provided historical evidence when present; ' +
    'never fabricate a precedent. Do not make the design decision for the user. ' +
    'Sentence case, no emoji, no exclamation marks.';
  const user =
    `Study design to simulate:\n` +
    `- Title: ${design.title ?? 'Untitled'}\n` +
    `- Phase: ${design.phase}\n` +
    `- Indication: ${design.indication ?? 'unspecified'}\n` +
    `- Product type: ${design.productType ?? 'unspecified'}\n` +
    `- Framework: ${design.framework?.inferentialFrame ?? '?'} / ${design.framework?.structuralDesign ?? '?'} / control: ${design.framework?.controlType ?? '?'}\n` +
    `- Primary endpoint(s): ${primary.map(e => `${e.name} (${e.type})`).join('; ') || 'unspecified'}\n` +
    `- Planned N: ${sp?.plannedSampleSize ?? 'unspecified'}; power: ${sp?.power ?? 'unspecified'}; alpha: ${sp?.alpha ?? 'unspecified'}; dropout: ${sp?.dropoutRate ?? 'unspecified'}\n` +
    `- Assumed effect size: ${sp?.powerAssumptions?.effectSize ?? 'unspecified'}; prior-phase observed: ${sp?.powerAssumptions?.priorPhaseObservedEffect ?? 'unknown'}\n\n` +
    (groundingText
      ? `Historical evidence the client uploaded (ground predictions in this):\n${groundingText}\n\n`
      : `No client-uploaded historical evidence is available; rely on general priors and say so.\n\n`) +
    (question ? `Focus the simulation on: ${question}\n` : '');
  return { system, user };
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
): StudyTwinSimulationResult {
  return {
    prediction,
    disclaimer: STUDY_TWIN_DISCLAIMER,
    needsHistoryUpload: !hasHistory,
    ...(hasHistory ? {} : { historyRequest: HISTORY_UPLOAD_REQUEST }),
    grounded: hasHistory,
    phase,
    indication,
  };
}

/**
 * Does this org have uploaded history (prior CSRs) AnA can learn from? Graceful:
 * any error (missing table/column) → false, which makes AnA ask for an upload.
 */
export async function hasLearnableHistory(organizationId: number): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM csr_reports WHERE organization_id = $1 LIMIT 1`,
      [organizationId],
    );
    if (r.rows.length > 0) return true;
  } catch {
    /* csr_reports may be unscoped or absent in this env — fall through. */
  }
  return false;
}

/**
 * Run a study-twin simulation. Always returns a disclaimer-bearing result; asks
 * for a history upload when none is available; never throws.
 */
export async function simulateStudyTwin(
  input: StudyTwinSimulationInput,
  groundingText = '',
): Promise<StudyTwinSimulationResult> {
  const { design, organizationId, question } = input;
  const phase = String(design.phase ?? 'unspecified');
  const indication = design.indication ?? 'unspecified';
  const hasHistory = groundingText.trim().length > 0 || (await hasLearnableHistory(organizationId));

  let prediction =
    'A prediction could not be generated because no AI provider is configured. ' +
    'The design was accepted and can be re-simulated once a provider is available.';
  try {
    const gw = getGateway();
    if (gw && gw.getEnabledProviders().length > 0) {
      const { system, user } = buildSimulationPrompt(design, groundingText, question);
      const resp = await gw.route({
        taskType: 'general',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        maxTokens: 1200,
        temperature: 0.2,
        callerModule: 'study-twin-simulation',
      });
      if (resp?.content?.trim()) prediction = resp.content.trim();
    }
  } catch (err: any) {
    console.warn('[study-twin] simulation model call failed (degraded):', err?.message);
  }

  return composeSimulationResult(prediction, hasHistory, phase, indication);
}
