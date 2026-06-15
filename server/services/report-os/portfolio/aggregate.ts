/**
 * Pure aggregation of per-program-member insights into a portfolio (board-pack)
 * summary, plus a render-target-agnostic report document.
 *
 * No DB or IO concerns: every function here is a pure transformation.
 */

import type { RenderedReport, ReportBlock, ReportSection } from '../render/types';
import type { PortfolioSummary, ProgramMemberInsight, RiskLevel } from './types';

const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high', 'critical'];

/**
 * Returns the highest-severity risk level across the inputs. Mirrors the
 * worst-case semantics of `project-rollup-service` (low < medium < high <
 * critical). An empty list yields the lowest severity, 'low'.
 */
export function worstRisk(levels: RiskLevel[]): RiskLevel {
  let worstIndex = 0;
  for (const level of levels) {
    const index = RISK_LEVELS.indexOf(level);
    if (index > worstIndex) worstIndex = index;
  }
  return RISK_LEVELS[worstIndex];
}

function roundedMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / values.length);
}

/**
 * Aggregates per-program-member insights into a portfolio summary. Pure.
 *
 * - avgReadiness / avgConfidence are simple rounded means (0 when empty).
 * - readyCount / partialCount / missingCount count members by status.
 * - totalCriticalBlockers sums member criticalBlockerCount.
 * - worstRisk uses worstRisk() over member risk levels.
 * - attentionRanked sorts ascending by readinessScore, then descending by
 *   criticalBlockerCount.
 * - topBlockerThemes counts the frequency of all members' topBlockers strings,
 *   sorted descending by count, capped at the top 5.
 */
export function aggregatePortfolio(
  programGroupId: number,
  members: ProgramMemberInsight[]
): PortfolioSummary {
  const readyCount = members.filter(m => m.status === 'ready').length;
  const partialCount = members.filter(m => m.status === 'partial').length;
  const missingCount = members.filter(m => m.status === 'missing').length;

  const totalCriticalBlockers = members.reduce((acc, m) => acc + m.criticalBlockerCount, 0);

  const attentionRanked = [...members].sort((a, b) => {
    if (a.readinessScore !== b.readinessScore) return a.readinessScore - b.readinessScore;
    return b.criticalBlockerCount - a.criticalBlockerCount;
  });

  const themeCounts = new Map<string, number>();
  for (const member of members) {
    for (const blocker of member.topBlockers ?? []) {
      themeCounts.set(blocker, (themeCounts.get(blocker) ?? 0) + 1);
    }
  }
  const topBlockerThemes = Array.from(themeCounts.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    programGroupId,
    memberCount: members.length,
    avgReadiness: roundedMean(members.map(m => m.readinessScore)),
    avgConfidence: roundedMean(members.map(m => m.confidence)),
    worstRisk: worstRisk(members.map(m => m.riskLevel)),
    readyCount,
    partialCount,
    missingCount,
    totalCriticalBlockers,
    attentionRanked,
    topBlockerThemes,
  };
}

/**
 * Renders a portfolio summary into a render-target-agnostic board-pack report.
 *
 * Sections:
 *   (1) "Portfolio summary" — headline metric blocks.
 *   (2) "Attention worklist" — table of members, lowest-readiness first.
 *   (3) "Top blocker themes" — table, or a summary block when empty.
 *
 * scopeType is always 'program'. status is 'final' only when every member is
 * ready and there are zero critical blockers; otherwise 'partial'.
 */
export function renderPortfolioReport(
  summary: PortfolioSummary,
  meta: {
    reportTypeId: string;
    reportTypeLabel: string;
    scopeId: string;
    generatedAt?: string;
  }
): RenderedReport {
  const summaryBlocks: ReportBlock[] = [
    { kind: 'summary', text: `${meta.reportTypeLabel} across ${summary.memberCount} programs.` },
    { kind: 'metric', label: 'Programs', value: summary.memberCount },
    { kind: 'metric', label: 'Avg readiness', value: summary.avgReadiness, unit: '%' },
    { kind: 'metric', label: 'Avg confidence', value: summary.avgConfidence, unit: '%' },
    { kind: 'metric', label: 'Worst risk', value: summary.worstRisk },
    { kind: 'metric', label: 'Programs ready', value: summary.readyCount, status: 'ready' },
    { kind: 'metric', label: 'Programs partial', value: summary.partialCount, status: 'partial' },
    { kind: 'metric', label: 'Programs missing', value: summary.missingCount, status: 'missing' },
    { kind: 'metric', label: 'Total critical blockers', value: summary.totalCriticalBlockers },
  ];

  const worklistRows: Array<Array<string | number | null>> = summary.attentionRanked.map(member => [
    member.name,
    member.readinessScore,
    member.riskLevel,
    member.criticalBlockerCount,
    member.status,
  ]);

  const themesBlock: ReportBlock =
    summary.topBlockerThemes.length === 0
      ? { kind: 'summary', text: 'No recurring blocker themes.' }
      : {
          kind: 'table',
          columns: ['Theme', 'Count'],
          rows: summary.topBlockerThemes.map(theme => [theme.theme, theme.count]),
        };

  const sections: ReportSection[] = [
    {
      id: 'portfolio-summary',
      title: 'Portfolio summary',
      blocks: summaryBlocks,
    },
    {
      id: 'attention-worklist',
      title: 'Attention worklist',
      blocks: [
        {
          kind: 'table',
          columns: ['Program', 'Readiness', 'Risk', 'Critical blockers', 'Status'],
          rows: worklistRows,
        },
      ],
    },
    {
      id: 'top-blocker-themes',
      title: 'Top blocker themes',
      blocks: [themesBlock],
    },
  ];

  const allReady =
    summary.memberCount > 0 &&
    summary.readyCount === summary.memberCount &&
    summary.totalCriticalBlockers === 0;

  return {
    reportTypeId: meta.reportTypeId,
    scopeType: 'program',
    scopeId: meta.scopeId,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    status: allReady ? 'final' : 'partial',
    sections,
  };
}
