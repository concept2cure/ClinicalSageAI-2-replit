/**
 * @fileoverview DB-backed portfolio board-pack assembly.
 * @module server/services/report-os/portfolio/fetch
 *
 * The portfolio aggregator (aggregate.ts) is pure. This module is the missing
 * DB seam: given an org + program group, it fetches the member projects,
 * computes each member's readiness via the SAME orchestrator the /runs path
 * uses, maps to ProgramMemberInsight, and calls the pure aggregator +
 * renderer. No new number source — every metric traces to computeInitialRun.
 *
 * The computed-run → member mapping (`toMemberInsight`) is PURE and
 * unit-testable; the fetch itself is a thin, org-scoped query loop.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db';
import { projects } from '@shared/schema';
import {
  reportProgramGroups,
  reportProgramGroupProjects,
} from '@shared/schema/report-os';
import { computeInitialRun, type RunComputationResult } from '../orchestrator';
import { aggregatePortfolio, renderPortfolioReport } from './aggregate';
import type { ProgramMemberInsight, PortfolioSummary, RiskLevel } from './types';
import type { RenderedReport } from '../render/types';

/** PURE: risk level from the count of critical blockers on a member. */
export function riskFromBlockers(criticalBlockerCount: number): RiskLevel {
  if (criticalBlockerCount >= 3) return 'critical';
  if (criticalBlockerCount === 2) return 'high';
  if (criticalBlockerCount === 1) return 'medium';
  return 'low';
}

/**
 * PURE: map a computed run for one member project into a ProgramMemberInsight.
 * readinessScore = the run's confidence (0–100); status is derived from
 * confidence + critical blockers so it never claims "ready" with a critical
 * gap open. topBlockers are the (non-critical) blockers surfaced for themes.
 */
export function toMemberInsight(
  projectId: number,
  name: string,
  computed: RunComputationResult,
): ProgramMemberInsight {
  const criticalBlockerCount = computed.criticalBlockers.length;
  const confidence = Math.max(0, Math.min(100, Math.round(computed.confidence)));
  const status: ProgramMemberInsight['status'] =
    criticalBlockerCount > 0 ? 'missing'
    : confidence >= 70 ? 'ready'
    : confidence > 0 ? 'partial'
    : 'missing';
  return {
    projectId,
    name,
    readinessScore: confidence,
    confidence,
    status,
    criticalBlockerCount,
    riskLevel: riskFromBlockers(criticalBlockerCount),
    topBlockers: computed.blockers.slice(0, 3),
  };
}

/** The member projects of a program group, org-scoped. */
async function fetchGroupMembers(
  organizationId: number,
  programGroupId: number,
): Promise<Array<{ projectId: number; name: string }>> {
  const rows = await db
    .select({ projectId: reportProgramGroupProjects.projectId, name: projects.name })
    .from(reportProgramGroupProjects)
    .innerJoin(
      reportProgramGroups,
      eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId),
    )
    .leftJoin(projects, eq(projects.id, reportProgramGroupProjects.projectId))
    .where(
      and(
        eq(reportProgramGroupProjects.programGroupId, programGroupId),
        eq(reportProgramGroups.organizationId, organizationId),
      ),
    );
  return rows.map((r) => ({ projectId: r.projectId, name: r.name ?? `Project ${r.projectId}` }));
}

/**
 * Assemble the portfolio summary for a program group. Computes each member's
 * readiness via the orchestrator (org-scoped), then aggregates. Returns null
 * when the group has no members in this org (honest empty, not a fake zero).
 */
export async function fetchPortfolioSummary(
  organizationId: number,
  programGroupId: number,
): Promise<PortfolioSummary | null> {
  const members = await fetchGroupMembers(organizationId, programGroupId);
  if (members.length === 0) return null;

  const insights: ProgramMemberInsight[] = [];
  for (const m of members) {
    const computed = await computeInitialRun(organizationId, 'project', String(m.projectId));
    insights.push(toMemberInsight(m.projectId, m.name, computed));
  }
  return aggregatePortfolio(programGroupId, insights);
}

/** Assemble + render the board-pack report for a program group. */
export async function fetchPortfolioReport(
  organizationId: number,
  programGroupId: number,
  meta: { reportTypeId: string; reportTypeLabel: string; generatedAt?: string },
): Promise<RenderedReport | null> {
  const summary = await fetchPortfolioSummary(organizationId, programGroupId);
  if (!summary) return null;
  return renderPortfolioReport(summary, {
    reportTypeId: meta.reportTypeId,
    reportTypeLabel: meta.reportTypeLabel,
    scopeId: String(programGroupId),
    generatedAt: meta.generatedAt,
  });
}
