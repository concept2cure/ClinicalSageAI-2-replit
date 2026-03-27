/**
 * Proactive Commitment Engine — Monitors project state and auto-generates
 * commitments from readiness gaps, timeline risks, and phase gate requirements.
 *
 * This is a pure computation engine — no database queries. It takes data as
 * input parameters and returns structured results. The route layer handles
 * all DB access.
 *
 * Key capabilities:
 *   - At-risk detection: commitments due soon with insufficient progress
 *   - Overdue detection: past-due commitments with impact analysis
 *   - Phase gate readiness: unmet gate requirements blocking phase entry
 *   - Critical path analysis: blocking chains that cascade delays
 *   - Proactive generation: readiness gaps → auto-generated commitments
 *   - Health summary: markdown report for AnA chat injection
 *
 * @module server/services/intelligence/proactive-commitment-engine
 */

import type {
  ProjectCommitment,
  TimelinePhase,
  GateRequirement,
} from '../../../shared/schema/project-charter.js';
import type { ReadinessScore, ReadinessDimensions } from './readiness-scoring-engine.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProactiveCheckResult {
  newCommitments: ProactiveCommitment[];
  atRiskCommitments: AtRiskCommitment[];
  overdueCommitments: OverdueCommitment[];
  phaseGateAlerts: PhaseGateAlert[];
  criticalPathWarnings: CriticalPathWarning[];
}

export interface ProactiveCommitment {
  title: string;
  description: string;
  category: string;
  source: 'proactive' | 'readiness_gap';
  priority: 'critical' | 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'this_week' | 'this_sprint' | 'backlog';
  suggestedDueDate: Date;
  ownerRole: string;
  functionalTeam: string;
  isCriticalPath: boolean;
  rationale: string;
}

export interface AtRiskCommitment {
  commitmentId: number;
  title: string;
  dueDate: Date;
  currentProgress: number;
  riskReason: string;
  suggestedAction: string;
  escalateTo?: string;
}

export interface OverdueCommitment {
  commitmentId: number;
  title: string;
  dueDate: Date;
  daysOverdue: number;
  impact: string;
  requiresDeviation: boolean;
}

export interface PhaseGateAlert {
  phaseName: string;
  phaseId: number;
  gateRequirementsMet: number;
  gateRequirementsTotal: number;
  unmetRequirements: string[];
  estimatedReadyDate?: Date;
  blocked: boolean;
}

export interface CriticalPathWarning {
  description: string;
  severity: 'critical' | 'high' | 'medium';
  affectedPhases: string[];
  suggestedAction: string;
  estimatedDelayWeeks?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Days before due date to flag a commitment as at-risk */
const AT_RISK_WINDOW_DAYS = 7;

/** Days before due date to flag critical-path commitments as at-risk */
const CRITICAL_PATH_AT_RISK_WINDOW_DAYS = 14;

/** Minimum progress (0-100) expected when a commitment is within the at-risk window */
const MIN_EXPECTED_PROGRESS = 80;

/** Days before a phase start to check gate readiness */
const PHASE_GATE_LOOKAHEAD_DAYS = 14;

/** Readiness dimension threshold below which a proactive commitment is generated */
const READINESS_GAP_THRESHOLD = 60;

/** Map of readiness dimensions to the functional team responsible */
const DIMENSION_TEAM_MAP: Record<keyof ReadinessDimensions, string> = {
  completeness: 'medical_writing',
  quality: 'qa',
  consistency: 'regulatory',
  compliance: 'regulatory',
};

/** Map of readiness dimensions to the owner role */
const DIMENSION_OWNER_MAP: Record<keyof ReadinessDimensions, string> = {
  completeness: 'Medical Writer',
  quality: 'QA Director',
  consistency: 'RA Lead',
  compliance: 'RA Lead',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function isTerminalStatus(status: string | null): boolean {
  return status === 'completed' || status === 'waived';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE COMMITMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class ProactiveCommitmentEngine {
  /**
   * Check all commitments for a project and return a full proactive health check.
   *
   * This is the main entry point. The caller provides all data — no DB queries here.
   */
  async checkProjectHealth(
    projectId: number,
    organizationId: number,
    commitments: ProjectCommitment[],
    phases: TimelinePhase[],
    readinessScore?: ReadinessScore,
  ): Promise<ProactiveCheckResult> {
    const atRiskCommitments = this.checkAtRiskCommitments(commitments);
    const overdueCommitments = this.checkOverdueCommitments(commitments);
    const phaseGateAlerts = this.checkPhaseGates(phases);
    const criticalPathWarnings = this.detectCriticalPathIssues(phases, commitments);
    const newCommitments = readinessScore
      ? this.generateFromReadinessGaps(readinessScore, phases)
      : [];

    return {
      newCommitments,
      atRiskCommitments,
      overdueCommitments,
      phaseGateAlerts,
      criticalPathWarnings,
    };
  }

  /**
   * Check if any commitments are at risk.
   *
   * At-risk criteria:
   * - Due within 7 days AND status is not completed/waived
   * - Due within 14 days AND is on the critical path AND status is not completed/waived
   */
  checkAtRiskCommitments(commitments: ProjectCommitment[]): AtRiskCommitment[] {
    const now = new Date();
    const results: AtRiskCommitment[] = [];

    for (const c of commitments) {
      if (isTerminalStatus(c.status)) continue;

      const dueDate = toDate(c.dueDate);
      if (!dueDate) continue;

      const daysUntilDue = daysBetween(now, dueDate);
      if (daysUntilDue < 0) continue; // overdue, handled by checkOverdueCommitments

      const isCritical = c.isCriticalPath ?? false;
      const window = isCritical ? CRITICAL_PATH_AT_RISK_WINDOW_DAYS : AT_RISK_WINDOW_DAYS;

      if (daysUntilDue > window) continue;

      // Progress is not tracked as a numeric field on the commitment itself,
      // so we infer from status: pending=0%, in_progress=50%, at_risk=50%
      const progress = inferProgress(c.status);

      if (progress >= MIN_EXPECTED_PROGRESS) continue;

      const riskReason = isCritical
        ? `Critical-path commitment due in ${daysUntilDue} day(s) with only ${progress}% progress`
        : `Commitment due in ${daysUntilDue} day(s) with only ${progress}% progress`;

      const suggestedAction = daysUntilDue <= 2
        ? `Immediately prioritize completion or request extension`
        : `Accelerate work to complete before ${dueDate.toISOString().slice(0, 10)}`;

      const escalateTo = isCritical ? (c.ownerRole ?? 'Project Manager') : undefined;

      results.push({
        commitmentId: c.id,
        title: c.title,
        dueDate,
        currentProgress: progress,
        riskReason,
        suggestedAction,
        escalateTo,
      });
    }

    return results;
  }

  /**
   * Check for overdue commitments.
   *
   * Overdue = dueDate < today AND status not completed/waived.
   * If on critical path, requiresDeviation = true.
   */
  checkOverdueCommitments(commitments: ProjectCommitment[]): OverdueCommitment[] {
    const now = new Date();
    const results: OverdueCommitment[] = [];

    // Build a map of what each commitment blocks
    const blocksMap = buildBlocksMap(commitments);

    for (const c of commitments) {
      if (isTerminalStatus(c.status)) continue;

      const dueDate = toDate(c.dueDate);
      if (!dueDate) continue;

      const daysOverdue = daysBetween(dueDate, now);
      if (daysOverdue <= 0) continue;

      const blockedTitles = (blocksMap.get(c.id) ?? []).map((id) => {
        const blocked = commitments.find((x) => x.id === id);
        return blocked?.title ?? `Commitment #${id}`;
      });

      const impact = blockedTitles.length > 0
        ? `Blocks: ${blockedTitles.join(', ')}`
        : 'No direct downstream dependencies identified';

      results.push({
        commitmentId: c.id,
        title: c.title,
        dueDate,
        daysOverdue,
        impact,
        requiresDeviation: c.isCriticalPath ?? false,
      });
    }

    return results;
  }

  /**
   * Check phase gate readiness.
   *
   * For each phase with gateRequirements, count met vs unmet.
   * If phase startDate is within 14 days and gates are not fully met, mark blocked.
   */
  checkPhaseGates(phases: TimelinePhase[]): PhaseGateAlert[] {
    const now = new Date();
    const results: PhaseGateAlert[] = [];

    for (const phase of phases) {
      const gates = (phase.gateRequirements as GateRequirement[] | null) ?? [];
      if (gates.length === 0) continue;

      const met = gates.filter((g) => g.completed).length;
      const total = gates.length;
      const unmet = gates.filter((g) => !g.completed).map((g) => g.requirement);

      if (met === total) continue; // all gates met, no alert needed

      const startDate = toDate(phase.startDate);
      const blocked = startDate
        ? daysBetween(now, startDate) <= PHASE_GATE_LOOKAHEAD_DAYS
        : false;

      // Estimate ready date: if phase has a target end, assume gates should
      // be met by start; add 1 week per unmet requirement as rough estimate
      const estimatedReadyDate = startDate
        ? addDays(now, unmet.length * 7)
        : undefined;

      results.push({
        phaseName: phase.phaseName,
        phaseId: phase.id,
        gateRequirementsMet: met,
        gateRequirementsTotal: total,
        unmetRequirements: unmet,
        estimatedReadyDate,
        blocked,
      });
    }

    return results;
  }

  /**
   * Detect critical path issues.
   *
   * If a commitment that blocks another commitment is at_risk or overdue,
   * generate a warning with estimated delay.
   */
  detectCriticalPathIssues(
    phases: TimelinePhase[],
    commitments: ProjectCommitment[],
  ): CriticalPathWarning[] {
    const now = new Date();
    const warnings: CriticalPathWarning[] = [];
    const commitmentMap = new Map(commitments.map((c) => [c.id, c]));

    // Find commitments that block others and are themselves at risk or overdue
    for (const c of commitments) {
      if (isTerminalStatus(c.status)) continue;
      if (!c.isCriticalPath) continue;

      const dueDate = toDate(c.dueDate);
      if (!dueDate) continue;

      const daysUntilDue = daysBetween(now, dueDate);
      const isOverdue = daysUntilDue < 0;
      const isAtRisk = !isOverdue && daysUntilDue <= CRITICAL_PATH_AT_RISK_WINDOW_DAYS
        && inferProgress(c.status) < MIN_EXPECTED_PROGRESS;

      if (!isOverdue && !isAtRisk) continue;

      // Find what phases this commitment's phase feeds into
      const phase = c.phaseId ? phases.find((p) => p.id === c.phaseId) : null;
      const affectedPhaseNames: string[] = [];

      if (phase) {
        // Find successor phases — phases that have this phase as a predecessor
        for (const p of phases) {
          const preds = (p.predecessors as number[] | null) ?? [];
          if (preds.includes(phase.id)) {
            affectedPhaseNames.push(p.phaseName);
          }
        }
      }

      // Also find commitments blocked by this one
      const blockedCommitments: string[] = [];
      for (const other of commitments) {
        const blockedBy = (other.blockedByCommitments as number[] | null) ?? [];
        if (blockedBy.includes(c.id)) {
          blockedCommitments.push(other.title);
        }
      }

      if (affectedPhaseNames.length === 0 && blockedCommitments.length === 0) continue;

      const delayWeeks = isOverdue ? Math.ceil(Math.abs(daysUntilDue) / 7) : undefined;
      const severity: CriticalPathWarning['severity'] = isOverdue ? 'critical' : 'high';

      const blockedDesc = blockedCommitments.length > 0
        ? ` Blocks: ${blockedCommitments.join(', ')}.`
        : '';

      const phaseDesc = affectedPhaseNames.length > 0
        ? ` Downstream phases affected: ${affectedPhaseNames.join(', ')}.`
        : '';

      warnings.push({
        description: `"${c.title}" is ${isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : 'at risk'} on the critical path.${blockedDesc}${phaseDesc}`,
        severity,
        affectedPhases: affectedPhaseNames,
        suggestedAction: isOverdue
          ? `Escalate immediately. Consider deviation protocol and timeline re-baseline.`
          : `Accelerate completion. Assign additional resources or reduce scope to meet deadline.`,
        estimatedDelayWeeks: delayWeeks,
      });
    }

    return warnings;
  }

  /**
   * Generate proactive commitments from readiness gaps.
   *
   * For each readiness dimension below 60%, generate a commitment to remediate.
   */
  generateFromReadinessGaps(
    readinessScore: ReadinessScore,
    phases: TimelinePhase[],
  ): ProactiveCommitment[] {
    const results: ProactiveCommitment[] = [];
    const dims = readinessScore.dimensions;
    const now = new Date();

    // Find the earliest upcoming phase for suggested due dates
    const upcomingPhases = phases
      .filter((p) => {
        const start = toDate(p.startDate);
        return start && start > now;
      })
      .sort((a, b) => {
        const aStart = toDate(a.startDate)!;
        const bStart = toDate(b.startDate)!;
        return aStart.getTime() - bStart.getTime();
      });

    const nextPhaseStart = upcomingPhases.length > 0
      ? toDate(upcomingPhases[0].startDate)!
      : addDays(now, 30); // fallback: 30 days out

    // Check each dimension
    const dimensionEntries: [keyof ReadinessDimensions, number][] = [
      ['completeness', dims.completeness],
      ['quality', dims.quality],
      ['consistency', dims.consistency],
      ['compliance', dims.compliance],
    ];

    for (const [dimension, score] of dimensionEntries) {
      if (score >= READINESS_GAP_THRESHOLD) continue;

      const isCritical = score < 30;
      const isHigh = score < 45;
      const priority: ProactiveCommitment['priority'] = isCritical
        ? 'critical'
        : isHigh
          ? 'high'
          : 'medium';

      const urgency: ProactiveCommitment['urgency'] = isCritical
        ? 'immediate'
        : isHigh
          ? 'this_week'
          : 'this_sprint';

      // Suggested due date: before next phase gate, or 2 weeks from now
      const suggestedDueDate = isCritical
        ? addDays(now, 7)
        : nextPhaseStart < addDays(now, 14)
          ? addDays(now, 7)
          : addDays(now, 14);

      results.push({
        title: `Remediate ${formatDimensionName(dimension)} gap (score: ${score}/100)`,
        description: buildDimensionDescription(dimension, score),
        category: dimensionToCategory(dimension),
        source: 'readiness_gap',
        priority,
        urgency,
        suggestedDueDate,
        ownerRole: DIMENSION_OWNER_MAP[dimension],
        functionalTeam: DIMENSION_TEAM_MAP[dimension],
        isCriticalPath: isCritical,
        rationale: `${formatDimensionName(dimension)} readiness score is ${score}/100, below the ${READINESS_GAP_THRESHOLD}% threshold. This gap must be closed before submission to avoid deficiency letters or refusal to file.`,
      });
    }

    // Also generate from individual readiness gaps if available
    for (const gap of readinessScore.gaps) {
      // Skip if we already have a dimension-level commitment that covers this
      const alreadyCovered = results.some(
        (r) => r.category === dimensionToCategory(gap.module as keyof ReadinessDimensions),
      );
      if (alreadyCovered && gap.severity !== 'critical') continue;

      const priority = gap.severity;
      const urgency: ProactiveCommitment['urgency'] =
        gap.severity === 'critical'
          ? 'immediate'
          : gap.severity === 'high'
            ? 'this_week'
            : 'this_sprint';

      const effortDays = gap.estimatedEffortHours
        ? Math.ceil(gap.estimatedEffortHours / 8)
        : 7;

      results.push({
        title: `${gap.description}`,
        description: `Module: ${gap.module}. Remediation: ${gap.remediation}`,
        category: 'evidence_gathering',
        source: 'readiness_gap',
        priority,
        urgency,
        suggestedDueDate: addDays(now, Math.max(effortDays, 3)),
        ownerRole: 'RA Lead',
        functionalTeam: 'regulatory',
        isCriticalPath: gap.severity === 'critical',
        rationale: `Readiness gap identified in module "${gap.module}": ${gap.description}. Severity: ${gap.severity}.`,
      });
    }

    return results;
  }

  /**
   * Generate a natural language markdown summary for AnA chat injection.
   */
  generateHealthSummary(result: ProactiveCheckResult): string {
    const lines: string[] = [];
    lines.push('## Project Health Check\n');

    // ── Status summary line ──────────────────────────────────────────────────
    const totalTracked =
      result.overdueCommitments.length +
      result.atRiskCommitments.length;

    if (result.overdueCommitments.length > 0) {
      const criticalOverdue = result.overdueCommitments.filter((o) => o.requiresDeviation).length;
      const overdueDesc = criticalOverdue > 0
        ? `${result.overdueCommitments.length} overdue commitments (${criticalOverdue} on critical path)`
        : `${result.overdueCommitments.length} overdue commitments`;
      lines.push(`- :red_circle: ${overdueDesc}`);
    }

    if (result.atRiskCommitments.length > 0) {
      lines.push(`- :yellow_circle: ${result.atRiskCommitments.length} commitments at risk this week`);
    }

    if (result.phaseGateAlerts.length > 0) {
      const blocked = result.phaseGateAlerts.filter((a) => a.blocked).length;
      if (blocked > 0) {
        lines.push(`- :red_circle: ${blocked} phase gate(s) blocked — requirements not met`);
      } else {
        lines.push(`- :yellow_circle: ${result.phaseGateAlerts.length} phase gate(s) with unmet requirements`);
      }
    }

    if (result.newCommitments.length > 0) {
      lines.push(`- :blue_circle: ${result.newCommitments.length} new commitments suggested from readiness gaps`);
    }

    if (totalTracked === 0 && result.phaseGateAlerts.length === 0) {
      lines.push('- :green_circle: All commitments on track. No immediate actions required.');
    }

    // ── Critical path warnings ────────────────────────────────────────────────
    if (result.criticalPathWarnings.length > 0) {
      lines.push('');
      lines.push('### Critical Path Warnings\n');
      for (const w of result.criticalPathWarnings) {
        const delayNote = w.estimatedDelayWeeks
          ? ` Estimated delay: ~${w.estimatedDelayWeeks} week(s).`
          : '';
        lines.push(`- **[${w.severity.toUpperCase()}]** ${w.description}${delayNote}`);
        lines.push(`  - *Action:* ${w.suggestedAction}`);
      }
    }

    // ── Overdue commitments ────────────────────────────────────────────────────
    if (result.overdueCommitments.length > 0) {
      lines.push('');
      lines.push('### Overdue Commitments\n');
      for (const o of result.overdueCommitments) {
        const devNote = o.requiresDeviation ? ' **(deviation required)**' : '';
        lines.push(
          `- **${o.title}** — ${o.daysOverdue} day(s) overdue (due: ${o.dueDate.toISOString().slice(0, 10)})${devNote}`,
        );
        lines.push(`  - Impact: ${o.impact}`);
      }
    }

    // ── At-risk commitments ────────────────────────────────────────────────────
    if (result.atRiskCommitments.length > 0) {
      lines.push('');
      lines.push('### At-Risk Commitments\n');
      for (const a of result.atRiskCommitments) {
        lines.push(
          `- **${a.title}** — due ${a.dueDate.toISOString().slice(0, 10)}, progress: ${a.currentProgress}%`,
        );
        lines.push(`  - Risk: ${a.riskReason}`);
        lines.push(`  - *Action:* ${a.suggestedAction}`);
        if (a.escalateTo) {
          lines.push(`  - *Escalate to:* ${a.escalateTo}`);
        }
      }
    }

    // ── Phase gate alerts ─────────────────────────────────────────────────────
    if (result.phaseGateAlerts.length > 0) {
      lines.push('');
      lines.push('### Phase Gate Readiness\n');
      for (const pg of result.phaseGateAlerts) {
        const status = pg.blocked ? ':red_circle: BLOCKED' : ':yellow_circle: Not Ready';
        lines.push(
          `- **${pg.phaseName}** — ${status} (${pg.gateRequirementsMet}/${pg.gateRequirementsTotal} requirements met)`,
        );
        if (pg.unmetRequirements.length > 0) {
          for (const req of pg.unmetRequirements) {
            lines.push(`  - [ ] ${req}`);
          }
        }
      }
    }

    // ── Next actions (from new commitments) ───────────────────────────────────
    const actionable = [
      ...result.overdueCommitments.map((o) => ({
        title: o.title,
        due: o.dueDate.toISOString().slice(0, 10),
        owner: 'Assigned Owner',
        sort: 0,
      })),
      ...result.atRiskCommitments
        .filter((a) => a.escalateTo)
        .map((a) => ({
          title: a.title,
          due: a.dueDate.toISOString().slice(0, 10),
          owner: a.escalateTo!,
          sort: 1,
        })),
      ...result.newCommitments
        .filter((n) => n.priority === 'critical' || n.priority === 'high')
        .map((n) => ({
          title: n.title,
          due: n.suggestedDueDate.toISOString().slice(0, 10),
          owner: n.ownerRole,
          sort: 2,
        })),
    ].sort((a, b) => a.sort - b.sort);

    if (actionable.length > 0) {
      lines.push('');
      lines.push('### Next Actions\n');
      const top = actionable.slice(0, 5);
      top.forEach((item, i) => {
        lines.push(`${i + 1}. **${item.title}** (due: ${item.due}, owner: ${item.owner})`);
      });
    }

    return lines.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Infer numeric progress from commitment status.
 * The schema does not have a numeric progress field, so we approximate.
 */
function inferProgress(status: string | null): number {
  switch (status) {
    case 'completed':
      return 100;
    case 'waived':
      return 100;
    case 'in_progress':
      return 50;
    case 'at_risk':
      return 40;
    case 'overdue':
      return 30;
    case 'pending':
    default:
      return 0;
  }
}

/**
 * Build a reverse index: commitmentId → list of commitment IDs it blocks.
 */
function buildBlocksMap(commitments: ProjectCommitment[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const c of commitments) {
    const blockedBy = (c.blockedByCommitments as number[] | null) ?? [];
    for (const blockerId of blockedBy) {
      const list = map.get(blockerId) ?? [];
      list.push(c.id);
      map.set(blockerId, list);
    }
  }
  return map;
}

/**
 * Format a readiness dimension key into a human-readable name.
 */
function formatDimensionName(dim: keyof ReadinessDimensions): string {
  const names: Record<keyof ReadinessDimensions, string> = {
    completeness: 'Document Completeness',
    quality: 'Content Quality',
    consistency: 'Cross-Section Consistency',
    compliance: 'Regulatory Compliance',
  };
  return names[dim];
}

/**
 * Build a description for a dimension gap commitment.
 */
function buildDimensionDescription(dim: keyof ReadinessDimensions, score: number): string {
  const descriptions: Record<keyof ReadinessDimensions, string> = {
    completeness: `Document completeness is at ${score}%. Key sections or modules are missing content that will be required for submission. Review the module breakdown and prioritize incomplete sections.`,
    quality: `Content quality score is ${score}%. Documents may contain issues such as weak language, unsupported claims, or insufficient detail for regulatory review. Conduct a quality review pass.`,
    consistency: `Cross-section consistency is at ${score}%. Data, terminology, or conclusions may conflict across document sections. Perform a cross-reference audit to align all sections.`,
    compliance: `Regulatory compliance score is ${score}%. Documents may not meet agency-specific formatting, content, or evidentiary requirements. Run a compliance scan and address findings.`,
  };
  return descriptions[dim];
}

/**
 * Map a readiness dimension to a commitment category.
 */
function dimensionToCategory(dim: string): string {
  const map: Record<string, string> = {
    completeness: 'document_delivery',
    quality: 'quality_assurance',
    consistency: 'data_integrity',
    compliance: 'regulatory_submission',
  };
  return map[dim] ?? 'team_deliverable';
}
