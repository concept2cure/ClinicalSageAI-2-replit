/**
 * Effort Certification deterministic logic (add-on) — pure, no DB/LLM.
 *
 * Total effort across all activities must not exceed 100% (a person cannot commit
 * >100% of their time); a material deviation between committed and actual effort
 * triggers recertification. Grounded in 2 CFR 200.430 (compensation/effort).
 *
 * @module server/services/effort-certification/effort-logic
 */

import { createHash } from 'crypto';

export interface EffortLineView {
  awardId?: number | null;
  activityLabel: string;
  committedPct: number;
  actualPct: number;
}

export type EffortFindingSeverity = 'critical' | 'major' | 'minor';
export type EffortRiskLevel = 'high' | 'medium' | 'low';

export interface EffortFinding {
  severity: EffortFindingSeverity;
  message: string;
  basis: string;
}

/** Material-deviation threshold for recertification (25% of the actual/committed scale). */
export const RECERT_DEVIATION_PCT = 25;

/**
 * Validate an effort statement. Total committed and total actual effort must each
 * be > 0 and ≤ 100; no line may be negative or exceed 100; large committed↔actual
 * deviations are flagged. Pure — cited findings + risk + the totals.
 */
export function validateEffort(lines: EffortLineView[]): {
  findings: EffortFinding[];
  riskLevel: EffortRiskLevel;
  totalCommitted: number;
  totalActual: number;
  needsRecertification: boolean;
} {
  const findings: EffortFinding[] = [];
  let totalCommitted = 0;
  let totalActual = 0;
  let needsRecertification = false;

  for (const [i, l] of lines.entries()) {
    const ref = `${l.activityLabel || `line #${i + 1}`}`;
    if (l.committedPct < 0 || l.committedPct > 100 || l.actualPct < 0 || l.actualPct > 100) {
      findings.push({ severity: 'critical', message: `${ref}: effort percentages must be between 0 and 100.`, basis: '2 CFR 200.430' });
    }
    totalCommitted += l.committedPct;
    totalActual += l.actualPct;
    const dev = l.committedPct > 0 ? Math.abs(l.actualPct - l.committedPct) / l.committedPct * 100 : (l.actualPct > 0 ? 100 : 0);
    if (l.awardId != null && dev > RECERT_DEVIATION_PCT) {
      needsRecertification = true;
      findings.push({ severity: 'major', message: `${ref}: actual effort (${l.actualPct}%) deviates >${RECERT_DEVIATION_PCT}% from committed (${l.committedPct}%); recertification / rebudget may be required.`, basis: '2 CFR 200.430(g)' });
    }
  }

  totalCommitted = Number(totalCommitted.toFixed(2));
  totalActual = Number(totalActual.toFixed(2));
  if (totalCommitted > 100) findings.push({ severity: 'critical', message: `Total committed effort is ${totalCommitted}% (exceeds 100%).`, basis: '2 CFR 200.430' });
  if (totalActual > 100) findings.push({ severity: 'critical', message: `Total actual effort is ${totalActual}% (exceeds 100%).`, basis: '2 CFR 200.430' });
  if (lines.length === 0 || totalActual === 0) findings.push({ severity: 'major', message: 'No effort is recorded for the period.', basis: '2 CFR 200.430' });

  const riskLevel: EffortRiskLevel = findings.some((f) => f.severity === 'critical') ? 'high' : findings.some((f) => f.severity === 'major') ? 'medium' : 'low';
  return { findings, riskLevel, totalCommitted, totalActual, needsRecertification };
}

/** Deterministic content hash of the effort snapshot for e-sign binding. Pure. */
export function computeEffortContentHash(lines: EffortLineView[], periodStart: string, periodEnd: string): string {
  const canonical = {
    periodStart, periodEnd,
    lines: [...lines]
      .map((l) => ({ awardId: l.awardId ?? null, activityLabel: l.activityLabel, committedPct: l.committedPct, actualPct: l.actualPct }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
