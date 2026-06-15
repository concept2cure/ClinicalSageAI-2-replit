/**
 * Pure assembler that turns normalized prediction-model outputs into
 * Report-OS render-model sections.
 *
 * It is intentionally decoupled from the heavy prediction services: it accepts
 * the normalized {@link PredictionInput} shapes only. Every report it produces
 * carries a MANDATORY disclosure block describing the method and stating the
 * prediction is not validated. Predictions are advisory, so the report status
 * is always `'partial'`, never `'final'`.
 */

import type { ReportBlock, ReportSection, RenderedReport } from '../render/types';
import type {
  DeficiencyRiskInput,
  PredictionDisclosure,
  PredictionInput,
  ReadinessTrajectoryInput,
  TrialPosInput,
} from './types';

/**
 * Metadata describing the report scope and identity, supplied by the caller.
 */
export interface PredictionReportMeta {
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  generatedAt?: string;
}

/**
 * Clamp a probability expressed as a 0..1 fraction onto a 0..100 percentage.
 */
function toPercent(fraction: number): number {
  const pct = fraction * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct * 10) / 10;
}

function metric(
  label: string,
  value: number | string | null,
  unit?: string,
): Extract<ReportBlock, { kind: 'metric' }> {
  return { kind: 'metric', label, value, unit, status: 'partial' };
}

function classifySampleRegime(
  sampleSize: number,
): NonNullable<PredictionDisclosure['sampleRegime']> {
  if (sampleSize < 30) return 'cold_start';
  if (sampleSize < 100) return 'warm_up';
  return 'mature';
}

/**
 * Build the mandatory disclosure for a prediction input. Always returns
 * `validated: false` and a method-appropriate, honest note.
 */
export function buildDisclosure(input: PredictionInput): PredictionDisclosure {
  switch (input.kind) {
    case 'deficiency_risk': {
      const sampleRegime = classifySampleRegime(input.sampleSize);
      let note =
        'Probabilities are produced by a logistic regression and are not validated against historical regulatory decisions.';
      if (input.usingNetworkPrior) {
        note +=
          ' With limited local history this submission falls back to a cross-tenant network prior (cold-start), so figures reflect aggregate behavior rather than your specific record.';
      }
      return {
        method: 'logistic_regression',
        validated: false,
        sampleRegime,
        confidence: input.modelConfidence,
        note,
      };
    }
    case 'readiness_trajectory':
      return {
        method: 'heuristic_gap_score',
        validated: false,
        note:
          'Readiness and its trajectory are a gap-based heuristic derived from missing and incomplete artifacts; they are not a trained probability of approval.',
      };
    case 'trial_pos':
      return {
        method: 'monte_carlo_simulation',
        validated: false,
        note:
          'Probability of success is a Monte Carlo simulation that integrates over an evidence prior. It is illustrative under the stated assumptions, not a guarantee of trial outcome.',
      };
  }
}

function assembleDeficiencyRisk(input: DeficiencyRiskInput): ReportSection[] {
  const rtf = toPercent(input.rtfProbability);
  const crl = toPercent(input.crlProbability);
  const approval = toPercent(input.firstCycleApprovalProbability);

  const executive: ReportSection = {
    id: 'executive-summary',
    title: 'Executive summary',
    blocks: [
      {
        kind: 'summary',
        text: `Predicted first-cycle approval probability is ${approval}%, with a ${rtf}% refuse-to-file risk and a ${crl}% complete-response-letter risk.`,
      },
      metric('First-cycle approval probability', approval, '%'),
      metric('Refuse-to-file (RTF) risk', rtf, '%'),
      metric('Complete response letter (CRL) risk', crl, '%'),
    ],
  };

  const detailBlocks: ReportBlock[] = [
    metric('Training sample size', input.sampleSize),
    metric('Using cross-tenant network prior', input.usingNetworkPrior ? 'yes' : 'no'),
  ];
  if (input.modelConfidence !== undefined) {
    detailBlocks.push(metric('Model confidence', toPercent(input.modelConfidence), '%'));
  }

  return [executive, { id: 'prediction-detail', title: 'Prediction detail', blocks: detailBlocks }];
}

function assembleReadinessTrajectory(input: ReadinessTrajectoryInput): ReportSection[] {
  const approval = toPercent(input.predictedApprovalProbability);

  const executive: ReportSection = {
    id: 'executive-summary',
    title: 'Executive summary',
    blocks: [
      {
        kind: 'summary',
        text: `Overall readiness scores ${input.overallScore}, implying a predicted approval probability of ${approval}%.`,
      },
      metric('Overall readiness score', input.overallScore),
      metric('Predicted approval probability', approval, '%'),
    ],
  };

  const detailBlocks: ReportBlock[] = [
    metric('Predicted review time', input.predictedReviewTimeDays, 'days'),
    metric('Predicted deficiency count', input.predictedDeficiencyCount),
  ];
  if (input.trend && input.trend.length > 0) {
    detailBlocks.push({
      kind: 'table',
      columns: ['As of', 'Score'],
      rows: input.trend.map(point => [point.asOf, point.score]),
    });
  }

  return [executive, { id: 'prediction-detail', title: 'Prediction detail', blocks: detailBlocks }];
}

function assembleTrialPos(input: TrialPosInput): ReportSection[] {
  const executiveBlocks: ReportBlock[] = [];
  if (input.hasEvidence) {
    const pos = toPercent(input.probabilityOfSuccess);
    executiveBlocks.push({
      kind: 'summary',
      text: `Simulated probability of success is ${pos}% across ${input.nRuns} runs.`,
    });
    executiveBlocks.push(metric('Probability of success', pos, '%'));
  } else {
    executiveBlocks.push({
      kind: 'summary',
      text: 'The trial simulator refuses to produce a probability of success without effect-size evidence. No POS figure is presented; supply an evidence prior to run the simulation.',
    });
  }

  const executive: ReportSection = {
    id: 'executive-summary',
    title: 'Executive summary',
    blocks: executiveBlocks,
  };

  const detailBlocks: ReportBlock[] = [
    metric('Statistical power at prior mean', toPercent(input.powerAtPriorMean), '%'),
    metric('Simulation runs', input.nRuns),
  ];
  if (input.typeIError !== undefined) {
    detailBlocks.push(metric('Type I error', toPercent(input.typeIError), '%'));
  }
  if (input.effectivePerArm !== undefined) {
    detailBlocks.push(metric('Effective sample size per arm', input.effectivePerArm));
  }
  if (input.assumptions.length > 0) {
    detailBlocks.push({ kind: 'blocker-list', items: input.assumptions });
  }

  return [executive, { id: 'prediction-detail', title: 'Prediction detail', blocks: detailBlocks }];
}

/**
 * Assemble a {@link RenderedReport} from a normalized prediction input. Pure:
 * given the same input and `meta.generatedAt`, the output is deterministic.
 *
 * Guarantees a mandatory final disclosure section and a `'partial'` status.
 */
export function assemblePredictionReport(
  input: PredictionInput,
  meta: PredictionReportMeta,
): RenderedReport {
  let sections: ReportSection[];
  switch (input.kind) {
    case 'deficiency_risk':
      sections = assembleDeficiencyRisk(input);
      break;
    case 'readiness_trajectory':
      sections = assembleReadinessTrajectory(input);
      break;
    case 'trial_pos':
      sections = assembleTrialPos(input);
      break;
  }

  const disclosure = buildDisclosure(input);
  sections.push({
    id: 'disclosure',
    title: 'Disclosure',
    blocks: [
      {
        kind: 'disclosure',
        method: disclosure.method,
        confidence: disclosure.confidence,
        validated: disclosure.validated,
        note: disclosure.note,
      },
    ],
  });

  return {
    reportTypeId: meta.reportTypeId,
    scopeType: meta.scopeType,
    scopeId: meta.scopeId,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    status: 'partial',
    sections,
  };
}

/**
 * Defensive guard: throws if no disclosure block exists in any section.
 */
export function assertHasDisclosure(report: RenderedReport): void {
  const hasDisclosure = report.sections.some(section =>
    section.blocks.some(block => block.kind === 'disclosure'),
  );
  if (!hasDisclosure) {
    throw new Error('Prediction report is missing its mandatory disclosure block.');
  }
}
