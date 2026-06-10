/**
 * Study-design defensibility report (module spec §17).
 *
 * Composes the deterministic design gates into a single risk-rated report and an
 * explicit advance/block decision. This is the check the governance gate chain (§20)
 * runs before a design may move `qc → approved`: a Critical finding blocks approval
 * outright, and any Major finding blocks promotion past QC.
 *
 * Pure and deterministic — the same design always yields the same report. The richer,
 * AI-assisted scoring in `statistical-defensibility-service.ts` (which reads the DB and
 * the precedent corpus) is layered on top of this in a later slice; this module is the
 * honest floor that needs neither network nor model to run.
 *
 * @module server/services/study-design/design-validation
 */

import { type StudyDesign } from './study-design-types';
import { runAllGates, type DesignFinding, type FindingSeverity } from './design-gates';

export type DesignRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DesignValidationReport {
  /** Overall risk rating derived from the worst finding present. */
  riskLevel: DesignRiskLevel;
  /** True only when there are no Critical and no Major findings (clears §20 QC→approved). */
  canAdvance: boolean;
  /** True when any Critical finding is present (blocks approval outright). */
  blocksApproval: boolean;
  counts: Record<FindingSeverity, number>;
  /** Findings ordered worst-first for display and audit. */
  findings: DesignFinding[];
  /** One-line human-readable summary. */
  summary: string;
  /** The standards the gates evaluated against. */
  standardsChecked: string[];
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

/**
 * Validate a design and produce its defensibility report. Deterministic.
 */
export function validateDesign(design: StudyDesign): DesignValidationReport {
  const findings = runAllGates(design).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const counts: Record<FindingSeverity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  const blocksApproval = counts.critical > 0;
  const canAdvance = counts.critical === 0 && counts.major === 0;
  const riskLevel = deriveRiskLevel(counts);

  const standardsChecked = Array.from(
    new Set(findings.map(f => f.standard).filter((s): s is string => Boolean(s))),
  ).sort();

  return {
    riskLevel,
    canAdvance,
    blocksApproval,
    counts,
    findings,
    summary: summarize(riskLevel, counts),
    standardsChecked,
  };
}

function deriveRiskLevel(counts: Record<FindingSeverity, number>): DesignRiskLevel {
  if (counts.critical > 0) return 'critical';
  if (counts.major > 0) return 'high';
  if (counts.minor > 0) return 'medium';
  return 'low';
}

function summarize(riskLevel: DesignRiskLevel, counts: Record<FindingSeverity, number>): string {
  if (riskLevel === 'low') {
    return 'No design-defensibility findings. The design clears the deterministic gates.';
  }
  const parts: string[] = [];
  if (counts.critical) parts.push(`${counts.critical} critical`);
  if (counts.major) parts.push(`${counts.major} major`);
  if (counts.minor) parts.push(`${counts.minor} minor`);
  const lead =
    riskLevel === 'critical'
      ? 'Design is blocked: critical defensibility findings must be resolved before approval.'
      : riskLevel === 'high'
        ? 'Design has major defensibility findings that block promotion past QC.'
        : 'Design has minor defensibility findings to address.';
  return `${lead} (${parts.join(', ')}).`;
}
