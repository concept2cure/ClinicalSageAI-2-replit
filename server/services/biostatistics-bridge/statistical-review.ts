/**
 * Biostatistics bridge — the statistical review.
 *
 * The design gates (server/services/study-design/design-gates.ts) produce
 * findings; the biostatistics engines produce a verdict, a fragility index and
 * an endpoint–method fit; the adapter produces gaps. A reviewer does not read
 * those three lists — they read a risk table: one row per statistical element,
 * a risk level, the finding, and what to do. That is the "Statistical Risk
 * Summary" and "Defensibility Verdict" of the biostatistics-engine review
 * format, and this module is the one place they are assembled from the
 * platform's own evidence.
 *
 * Pure. Every row cites the finding codes it was derived from, so a row can be
 * traced back to the gate that raised it and nothing here is an opinion the
 * gates did not produce.
 *
 * @module server/services/biostatistics-bridge/statistical-review
 */

import type { DesignValidationReport } from '../study-design/design-validation';
import type { DesignFinding, FindingSeverity } from '../study-design/design-gates';
import type { ComputationResult, JudgmentResult, StatisticalInput } from '../ana-biostats/types';
import type { DesignGap } from './design-adapter';

export type ReviewRisk = 'low' | 'medium' | 'high' | 'critical';

export type ReviewElement =
  | 'Primary endpoint'
  | 'Design framework'
  | 'Sample size'
  | 'Multiplicity'
  | 'Analysis methods'
  | 'Missing data'
  | 'Populations'
  | 'Interim analysis';

export const REVIEW_ELEMENTS: readonly ReviewElement[] = [
  'Primary endpoint', 'Design framework', 'Sample size', 'Multiplicity',
  'Analysis methods', 'Missing data', 'Populations', 'Interim analysis',
] as const;

export interface RiskRow {
  element: ReviewElement;
  risk: ReviewRisk;
  /** What was found, in one or two sentences. */
  finding: string;
  /** What to do, or why nothing is needed. */
  action: string;
  /** Gate finding codes this row rests on (empty when the row rests on the engine judgment or on nothing). */
  codes: string[];
}

export interface DefensibilityVerdict {
  challengeLikelihood: 'low' | 'moderate' | 'high';
  mostVulnerable: ReviewElement | null;
  recommendedActions: string[];
}

export interface StatisticalReview {
  rows: RiskRow[];
  verdict: DefensibilityVerdict;
  /** The standards the gates evaluated against (from the validation report). */
  standardsChecked: string[];
  /** Worst risk across rows — the one-word answer. */
  overallRisk: ReviewRisk;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

/** Gate code prefix → the review element it speaks to. FRM-003 is a population rule. */
export function elementForCode(code: string): ReviewElement {
  if (code === 'FRM-003') return 'Populations';
  const prefix = code.split('-')[0];
  switch (prefix) {
    case 'EST':
    case 'EPT': return 'Primary endpoint';
    case 'FRM': return 'Design framework';
    case 'PWR': return 'Sample size';
    case 'MUL': return 'Multiplicity';
    case 'MTH': return 'Analysis methods';
    case 'MIS': return 'Missing data';
    case 'POP': return 'Populations';
    case 'INT': return 'Interim analysis';
    default: return 'Design framework';
  }
}

const SEVERITY_TO_RISK: Record<FindingSeverity, ReviewRisk> = {
  critical: 'critical', major: 'high', minor: 'medium', info: 'low',
};
const RISK_ORDER: Record<ReviewRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function worst(a: ReviewRisk, b: ReviewRisk): ReviewRisk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const STANDARD_OK: Record<ReviewElement, string> = {
  'Primary endpoint': 'Single primary endpoint with a complete ICH E9(R1) estimand.',
  'Design framework': 'Frame, control and structural design are specified and justified.',
  'Sample size': 'Powered at or above the confirmatory threshold with sourced assumptions.',
  'Multiplicity': 'No uncontrolled hypothesis hierarchy.',
  'Analysis methods': 'Planned methods fit their endpoints.',
  'Missing data': 'A pre-specified model- or imputation-based strategy aligned with the estimand.',
  'Populations': 'A primary analysis set is marked and appropriate to the frame.',
  'Interim analysis': 'No interim looks planned, or looks with alpha spending and an independent DMC.',
};

// ─── Assembly ────────────────────────────────────────────────────────────────

export interface ReviewInputs {
  validation: DesignValidationReport;
  judgment: JudgmentResult | null;
  computation: ComputationResult | null;
  input: StatisticalInput | null;
  gaps: DesignGap[];
}

/** One row per element, built from the gate findings and the engine judgment. */
export function buildStatisticalReview(args: ReviewInputs): StatisticalReview {
  const byElement = new Map<ReviewElement, DesignFinding[]>();
  for (const el of REVIEW_ELEMENTS) byElement.set(el, []);
  for (const f of args.validation.findings) byElement.get(elementForCode(f.code))!.push(f);

  const rows: RiskRow[] = REVIEW_ELEMENTS.map((element) => {
    const findings = byElement.get(element)!;
    let risk: ReviewRisk = findings.reduce<ReviewRisk>((r, f) => worst(r, SEVERITY_TO_RISK[f.severity]), 'low');
    const findingText: string[] = findings.map((f) => f.title + '.');
    const actions: string[] = findings.map((f) => f.suggestedFix).filter((x): x is string => Boolean(x));

    if (element === 'Sample size') {
      // The engine's judgment is evidence the gates do not have: it sizes the
      // study and stresses the assumptions. It can only raise the risk.
      const j = args.judgment;
      if (!args.input && args.gaps.some((g) => g.severity === 'blocking')) {
        risk = worst(risk, 'high');
        findingText.push('The design could not be sized: ' + args.gaps.filter((g) => g.severity === 'blocking').map((g) => g.message).join(' '));
        actions.push('Resolve the blocking design gaps so the sample size can be computed.');
      } else if (j) {
        if (j.overallVerdict === 'inadequate') {
          risk = worst(risk, 'critical');
          findingText.push(`The engine judged the design inadequate (${j.overallRisk} risk).`);
          actions.push(j.roleExplanations.technical);
        } else if (j.overallVerdict === 'marginal') {
          risk = worst(risk, 'medium');
          findingText.push(`The engine judged the design marginal (${j.overallRisk} risk).`);
        }
        if (j.fragility.category === 'very_fragile' || j.fragility.category === 'fragile') {
          risk = worst(risk, 'high');
          const params = j.fragility.sensitiveParameters.map((p) => p.parameter).join(', ');
          findingText.push(`Fragility index ${j.fragility.fragilityIndex}/100 (${j.fragility.category.replace('_', ' ')})${params ? ' — sensitive to ' + params : ''}.`);
          actions.push('Run sensitivity scenarios across the sensitive parameters and state the result in the rationale.');
        }
        if (args.computation) {
          findingText.push(`Sized at ${args.computation.adjustedTotal ?? args.computation.sampleSize.total} subjects for ${Math.round(args.computation.power * 100)}% power (${args.computation.method}).`);
        }
      }
    }
    if (element === 'Analysis methods' && args.judgment) {
      const fit = args.judgment.endpointMethodFit;
      if (fit.fit === 'mismatch') { risk = worst(risk, 'high'); findingText.push(`Endpoint–method fit is a mismatch: ${fit.rationale}`); actions.push(`Consider ${fit.suggestedMethod}.`); }
      else if (fit.fit === 'weak') { risk = worst(risk, 'medium'); findingText.push(`Endpoint–method fit is weak: ${fit.rationale}`); actions.push(`Consider ${fit.suggestedMethod}.`); }
    }

    return {
      element,
      risk,
      finding: findingText.length ? uniq(findingText).join(' ') : STANDARD_OK[element],
      action: actions.length ? uniq(actions).join(' ') : 'No action required.',
      codes: findings.map((f) => f.code),
    };
  });

  const overallRisk = rows.reduce<ReviewRisk>((r, row) => worst(r, row.risk), 'low');
  const ranked = [...rows].sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);
  const mostVulnerable = ranked[0] && ranked[0].risk !== 'low' ? ranked[0].element : null;
  const challengeLikelihood: DefensibilityVerdict['challengeLikelihood'] =
    overallRisk === 'critical' ? 'high' : overallRisk === 'high' ? 'moderate' : 'low';
  const recommendedActions = ranked
    .filter((r) => r.risk !== 'low')
    .map((r) => `${r.element}: ${r.action}`)
    .filter((a) => !a.endsWith('No action required.'));

  return {
    rows,
    verdict: { challengeLikelihood, mostVulnerable, recommendedActions },
    standardsChecked: args.validation.standardsChecked,
    overallRisk,
  };
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}
