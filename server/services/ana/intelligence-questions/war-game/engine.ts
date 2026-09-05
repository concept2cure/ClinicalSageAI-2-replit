/**
 * AnA War Game Engine — core audit simulation runner.
 *
 * Takes flow answers, runs them through category-specific audit rules,
 * and produces a WarGameReport simulating FDA auditor scrutiny.
 *
 * @module server/services/ana/intelligence-questions/war-game/engine
 */

import type {
  WarGameCategory,
  WarGameReport,
  WarGameFinding,
  AuditDimension,
  WarGameAuditor,
} from './types.js';
import { getAuditor, getAvailableAuditors } from './auditors/index.js';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

const ALL_DIMENSIONS: AuditDimension[] = [
  'completeness',
  'consistency',
  'regulatory_alignment',
  'scientific_rigor',
  'practical_feasibility',
  'documentation',
  'risk_identification',
];

const SEVERITY_PENALTY: Record<string, number> = {
  critical: 25,
  warning: 15,
  info: 5,
};

/** Generate a unique ID for war-game artifacts. */
function generateId(): string {
  return `wg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Flatten nested answers (nodeId -> { fieldId: value }) into a single
 * flat record (fieldId -> value). If keys collide, later nodes win.
 */
function flattenAnswers(
  answers: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}

/* ─── Engine ───────────────────────────────────────────────────────────── */

/**
 * Run a War Game audit simulation against collected flow answers.
 *
 * @param category   - The document category to audit (e.g. 'protocol', 'ind').
 * @param sourceFlowId - The ID of the intelligence-question flow whose answers
 *                       are being audited.
 * @param answers    - Nested answers map as stored in FlowState
 *                     (nodeId -> { fieldId: value }).
 * @returns A complete {@link WarGameReport}.
 */
export function runWarGame(
  category: WarGameCategory,
  sourceFlowId: string,
  answers: Record<string, Record<string, unknown>>,
): WarGameReport {
  const auditor = getAuditor(category);
  const flatAnswers = flattenAnswers(answers);

  // ── Run all rules and collect findings ──────────────────────────────
  const findings: WarGameFinding[] = [];
  for (const rule of auditor.rules) {
    const finding = rule.check(flatAnswers);
    if (finding) {
      findings.push(finding);
    }
  }

  // ── Calculate dimension scores ──────────────────────────────────────
  const dimensionScores = {} as Record<
    AuditDimension,
    { score: number; findingCount: number }
  >;
  for (const dim of ALL_DIMENSIONS) {
    dimensionScores[dim] = { score: 100, findingCount: 0 };
  }

  for (const finding of findings) {
    const entry = dimensionScores[finding.dimension];
    entry.score = Math.max(0, entry.score - (SEVERITY_PENALTY[finding.severity] ?? 0));
    entry.findingCount += 1;
  }

  // ── Overall score (average of all dimension scores) ─────────────────
  const overallScore = Math.round(
    ALL_DIMENSIONS.reduce((sum, dim) => sum + dimensionScores[dim].score, 0) /
      ALL_DIMENSIONS.length,
  );

  // ── Severity counts ─────────────────────────────────────────────────
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  // ── Assessment & risk level ─────────────────────────────────────────
  let overallAssessment: WarGameReport['overallAssessment'] =
    overallScore >= 85
      ? 'audit_ready'
      : overallScore >= 70
        ? 'needs_work'
        : overallScore >= 50
          ? 'significant_gaps'
          : 'not_ready';

  let regulatoryRiskLevel: WarGameReport['regulatoryRiskLevel'] =
    overallScore >= 85
      ? 'low'
      : overallScore >= 70
        ? 'moderate'
        : overallScore >= 50
          ? 'high'
          : 'critical';

  // A finding's severity must CAP the headline verdict. The overall score is a
  // mean of seven dimension scores, and a single critical finding deducts its
  // penalty from only one dimension — so a filing with an OPEN CRITICAL blocker
  // (e.g. "Nitrosamine Risk Not Evaluated") still averaged ~96/100 and read
  // "Audit-Ready / low regulatory risk", contradicting the critical it lists. A
  // critical is an unresolved blocker: the filing cannot be audit-ready and is
  // at least high risk. An unresolved warning is at best "needs work"/moderate.
  const ASSESS_RANK: Record<WarGameReport['overallAssessment'], number> = {
    audit_ready: 0,
    needs_work: 1,
    significant_gaps: 2,
    not_ready: 3,
  };
  const RISK_RANK: Record<WarGameReport['regulatoryRiskLevel'], number> = {
    low: 0,
    moderate: 1,
    high: 2,
    critical: 3,
  };
  const capAssessment = (
    cur: WarGameReport['overallAssessment'],
    floor: WarGameReport['overallAssessment'],
  ) => (ASSESS_RANK[cur] >= ASSESS_RANK[floor] ? cur : floor);
  const capRisk = (
    cur: WarGameReport['regulatoryRiskLevel'],
    floor: WarGameReport['regulatoryRiskLevel'],
  ) => (RISK_RANK[cur] >= RISK_RANK[floor] ? cur : floor);
  if (criticalCount > 0) {
    overallAssessment = capAssessment(overallAssessment, 'significant_gaps');
    regulatoryRiskLevel = capRisk(regulatoryRiskLevel, 'high');
  } else if (warningCount > 0) {
    overallAssessment = capAssessment(overallAssessment, 'needs_work');
    regulatoryRiskLevel = capRisk(regulatoryRiskLevel, 'moderate');
  }

  // ── Executive summary ───────────────────────────────────────────────
  const assessmentLabel: Record<WarGameReport['overallAssessment'], string> = {
    audit_ready: 'Audit-Ready',
    needs_work: 'Needs Work',
    significant_gaps: 'Significant Gaps Identified',
    not_ready: 'Not Ready for Audit',
  };

  const severityParts: string[] = [];
  if (criticalCount > 0) severityParts.push(`${criticalCount} critical`);
  if (warningCount > 0) severityParts.push(`${warningCount} warning`);
  if (infoCount > 0) severityParts.push(`${infoCount} informational`);

  const findingSummary =
    findings.length === 0
      ? 'No issues were identified.'
      : `${findings.length} finding${findings.length === 1 ? '' : 's'} identified (${severityParts.join(', ')}).`;

  const topIssuesSummary =
    criticalCount > 0
      ? ` Top issues: ${findings
          .filter((f) => f.severity === 'critical')
          .slice(0, 3)
          .map((f) => f.title)
          .join('; ')}.`
      : '';

  const executiveSummary =
    `War Game assessment: ${assessmentLabel[overallAssessment]} (score ${overallScore}/100). ` +
    `${findingSummary}${topIssuesSummary}`;

  // ── Top priorities ──────────────────────────────────────────────────
  const prioritized = [
    ...findings.filter((f) => f.severity === 'critical'),
    ...findings.filter((f) => f.severity === 'warning'),
    ...findings.filter((f) => f.severity === 'info'),
  ];

  const topPriorities = prioritized
    .slice(0, 5)
    .map((f) => `[${f.severity.toUpperCase()}] ${f.title}: ${f.recommendation}`);

  // ── Assemble report ─────────────────────────────────────────────────
  return {
    id: generateId(),
    category,
    sourceFlowId,
    timestamp: new Date().toISOString(),
    overallScore,
    overallAssessment,
    findings,
    dimensionScores,
    executiveSummary,
    topPriorities,
    regulatoryRiskLevel,
  };
}

/**
 * List all available war-game auditor categories with metadata.
 */
export function getAvailableWarGames(): Array<{
  category: WarGameCategory;
  name: string;
  description: string;
}> {
  return getAvailableAuditors();
}
